import { BrowserWindow as e, app as t, dialog as n, ipcMain as r } from "electron";
import i from "node:path";
import { fileURLToPath as a } from "node:url";
import { PrismaClient as o } from "@prisma/client";
import s from "node:crypto";
import c from "node:fs";
import l from "node:http";
import u from "node:os";
//#region electron/crypto.ts
var d = t.getPath("userData"), f = i.join(d, "quantlib.meta"), p = i.join(d, "quantlib.enc"), m = i.join(d, "quantlib.enc.bak"), h = i.join(d, "quantlib.enc.tmp"), g = i.join(d, "quantlib_temp.db"), _ = i.join(process.cwd(), "quantlib.db"), v = null, y = null;
function b(e) {
	let t = e || y;
	if (t && typeof t.$executeRawUnsafe == "function") try {
		t.$executeRawUnsafe("PRAGMA wal_checkpoint(FULL)").catch(() => {});
	} catch {}
}
function x() {
	return g;
}
function S() {
	return c.existsSync(f) && c.existsSync(p) ? "LOCKED" : "SETUP";
}
function C(e, t, n = 6e5) {
	return s.pbkdf2Sync(e, t, n, 32, "sha256");
}
function w(e) {
	return s.randomBytes(12);
}
function ee(e) {
	let t = null, n = null;
	try {
		if (S() !== "SETUP") return {
			success: !1,
			error: "Database is already set up"
		};
		if (c.existsSync(f) || c.existsSync(p)) return {
			success: !1,
			error: "Existing database state found. Unlock or recover the database instead."
		};
		let r = s.randomBytes(16), i = s.randomBytes(32), a = s.randomBytes(16).toString("hex").match(/.{1,4}/g)?.join("-").toUpperCase() || "";
		t = C(e, r), n = C(a, r);
		let o = w(0), l = s.createCipheriv("aes-256-gcm", t, o), u = Buffer.concat([l.update(i), l.final()]), d = l.getAuthTag(), m = w(1), h = s.createCipheriv("aes-256-gcm", n, m), y = Buffer.concat([h.update(i), h.final()]), b = h.getAuthTag(), x = {
			salt: r.toString("base64"),
			iterations: 6e5,
			password_payload: Buffer.concat([
				o,
				d,
				u
			]).toString("base64"),
			recovery_payload: Buffer.concat([
				m,
				b,
				y
			]).toString("base64")
		};
		if (c.writeFileSync(f, JSON.stringify(x)), c.existsSync(_)) {
			c.copyFileSync(_, g);
			try {
				E(_);
			} catch {}
			try {
				E(_ + ".bak");
			} catch {}
		} else c.writeFileSync(g, "");
		return v = i, T(), {
			success: !0,
			recoveryKey: a
		};
	} catch (e) {
		return {
			success: !1,
			error: e instanceof Error ? e.message : String(e)
		};
	} finally {
		t && t.fill(0), n && n.fill(0);
	}
}
function te(e, t) {
	try {
		let n = Buffer.from(e, "base64"), r = n.subarray(0, 12), i = n.subarray(12, 28), a = n.subarray(28), o = s.createDecipheriv("aes-256-gcm", t, r);
		return o.setAuthTag(i), Buffer.concat([o.update(a), o.final()]);
	} catch {
		return null;
	}
}
function ne(e, t = !1) {
	let n = null, r = null;
	try {
		let i = c.readFileSync(f, "utf-8"), a = JSON.parse(i), o = Buffer.from(a.salt, "base64"), l = a.iterations || 1e5;
		n = C(e, o, l);
		let u = te(t ? a.recovery_payload : a.password_payload, n);
		if (!u) return {
			success: !1,
			error: "Invalid password or recovery key"
		};
		if (l < 6e5 && !t) {
			r = C(e, o, 6e5);
			let t = w(0), n = s.createCipheriv("aes-256-gcm", r, t), i = Buffer.concat([n.update(u), n.final()]), l = n.getAuthTag();
			a.iterations = 6e5, a.password_payload = Buffer.concat([
				t,
				l,
				i
			]).toString("base64"), c.writeFileSync(f, JSON.stringify(a));
		}
		v = u;
		let d = c.readFileSync(p);
		if (d.length > 0) {
			let e = d.subarray(0, 12), t = d.subarray(12, 28), n = d.subarray(28), r = s.createDecipheriv("aes-256-gcm", v, e);
			r.setAuthTag(t);
			let i = Buffer.concat([r.update(n), r.final()]);
			c.writeFileSync(g, i);
		} else c.writeFileSync(g, "");
		return { success: !0 };
	} catch (e) {
		return {
			success: !1,
			error: e instanceof Error ? e.message : "Unlock failed"
		};
	} finally {
		n && n.fill(0), r && r.fill(0);
	}
}
async function T(e) {
	if (!(!v || !c.existsSync(g))) try {
		b(e);
		let t = await c.promises.readFile(g), n = w(2), r = s.createCipheriv("aes-256-gcm", v, n), i = Buffer.concat([r.update(t), r.final()]), a = r.getAuthTag();
		await c.promises.writeFile(h, Buffer.concat([
			n,
			a,
			i
		])), c.existsSync(p) && await c.promises.copyFile(p, m), await c.promises.rename(h, p);
	} catch (e) {
		console.error("Failed to encrypt database:", e);
		try {
			c.existsSync(h) && await c.promises.unlink(h);
		} catch {}
	}
}
function re(e) {
	if (!(!v || !c.existsSync(g))) try {
		b(e);
		let t = c.readFileSync(g), n = w(2), r = s.createCipheriv("aes-256-gcm", v, n), i = Buffer.concat([r.update(t), r.final()]), a = r.getAuthTag();
		c.writeFileSync(h, Buffer.concat([
			n,
			a,
			i
		])), c.existsSync(p) && c.copyFileSync(p, m), c.renameSync(h, p);
	} catch (e) {
		console.error("Failed to encrypt database sync:", e);
		try {
			c.existsSync(h) && c.unlinkSync(h);
		} catch {}
	}
}
function E(e) {
	if (!c.existsSync(e)) return;
	let t = null;
	try {
		let n = c.statSync(e);
		t = c.openSync(e, "r+");
		let r = 4096, i = Buffer.alloc(r, 0), a = 0;
		for (; a < n.size;) {
			let e = Math.min(r, n.size - a), o = c.writeSync(t, i, 0, e, a);
			a += o;
		}
		c.fsyncSync(t);
	} catch (t) {
		console.error(`Failed to securely wipe ${e}:`, t);
	} finally {
		if (t !== null) try {
			c.closeSync(t);
		} catch (t) {
			console.error(`Failed to close ${e}:`, t);
		}
		try {
			c.existsSync(e) && c.unlinkSync(e);
		} catch (t) {
			console.error(`Failed to delete ${e}:`, t);
		}
	}
}
function D(e) {
	try {
		c.existsSync(g) && (b(e), re(e), E(g), E(`${g}-wal`), E(`${g}-shm`));
	} catch (e) {
		console.error("Cleanup failed:", e);
	} finally {
		v &&= (v.fill(0), null);
	}
}
function ie(e, t) {
	let n = null, r = null, i = null;
	try {
		let a = c.readFileSync(f, "utf-8"), o = JSON.parse(a);
		n = C(e, Buffer.from(o.salt, "base64"), o.iterations || 1e5);
		let l = te(o.password_payload, n);
		if (!l) return {
			success: !1,
			error: "Incorrect current password"
		};
		let u = s.randomBytes(16), d = s.randomBytes(16).toString("hex").match(/.{1,4}/g)?.join("-").toUpperCase() || "";
		r = C(t, u), i = C(d, u);
		let p = w(0), m = s.createCipheriv("aes-256-gcm", r, p), h = Buffer.concat([m.update(l), m.final()]), g = m.getAuthTag(), _ = w(1), v = s.createCipheriv("aes-256-gcm", i, _), y = Buffer.concat([v.update(l), v.final()]), b = v.getAuthTag(), x = {
			salt: u.toString("base64"),
			iterations: 6e5,
			password_payload: Buffer.concat([
				p,
				g,
				h
			]).toString("base64"),
			recovery_payload: Buffer.concat([
				_,
				b,
				y
			]).toString("base64")
		};
		return c.writeFileSync(f, JSON.stringify(x)), {
			success: !0,
			recoveryKey: d
		};
	} catch (e) {
		return {
			success: !1,
			error: e instanceof Error ? e.message : "Failed to change password"
		};
	} finally {
		n && n.fill(0), r && r.fill(0), i && i.fill(0);
	}
}
//#endregion
//#region electron/database.ts
var O = null, k = !1, ae = 0, oe = !1;
function se() {
	return O;
}
function A() {
	if (oe) throw Error("Application is shutting down.");
	if (!O) throw Error("Database is locked. Please authenticate first.");
	return O;
}
function j(e) {
	return e instanceof Error ? e.message : String(e);
}
async function ce(e) {
	await e.$executeRawUnsafe("PRAGMA foreign_keys = ON"), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"School\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"name\" TEXT NOT NULL,\n      \"motto\" TEXT,\n      \"logoPath\" TEXT,\n      \"address\" TEXT,\n      \"contactName\" TEXT,\n      \"contactPhone\" TEXT,\n      \"academicYear\" TEXT,\n      \"updatedAt\" DATETIME NOT NULL,\n      \"checkoutDuration\" INTEGER NOT NULL DEFAULT 14\n    )\n  "), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"Subject\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"name\" TEXT NOT NULL,\n      \"category\" TEXT,\n      \"openingCount\" INTEGER NOT NULL DEFAULT 0,\n      \"recovered\" INTEGER NOT NULL DEFAULT 0,\n      \"issued\" INTEGER NOT NULL DEFAULT 0,\n      \"damaged\" INTEGER NOT NULL DEFAULT 0,\n      \"lost\" INTEGER NOT NULL DEFAULT 0,\n      \"notes\" TEXT,\n      \"averageCondition\" REAL NOT NULL DEFAULT 3.0,\n      \"degradationRate\" REAL NOT NULL DEFAULT 0.0,\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      \"updatedAt\" DATETIME NOT NULL\n    )\n  "), await e.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"Subject_name_key\" ON \"Subject\"(\"name\")"), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"Incident\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"type\" TEXT NOT NULL,\n      \"date\" DATETIME NOT NULL,\n      \"subjectId\" INTEGER,\n      \"bookTitle\" TEXT NOT NULL,\n      \"condition\" TEXT,\n      \"comment\" TEXT,\n      \"reportedBy\" TEXT,\n      \"responsibleParty\" TEXT,\n      \"studentClass\" TEXT,\n      \"actionTaken\" TEXT,\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      CONSTRAINT \"Incident_subjectId_fkey\" FOREIGN KEY (\"subjectId\") REFERENCES \"Subject\" (\"id\") ON DELETE SET NULL ON UPDATE CASCADE\n    )\n  "), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"AuditLog\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"subjectId\" INTEGER NOT NULL,\n      \"field\" TEXT NOT NULL,\n      \"oldValue\" TEXT NOT NULL,\n      \"newValue\" TEXT NOT NULL,\n      \"changedBy\" TEXT,\n      \"changedAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      CONSTRAINT \"AuditLog_subjectId_fkey\" FOREIGN KEY (\"subjectId\") REFERENCES \"Subject\" (\"id\") ON DELETE RESTRICT ON UPDATE CASCADE\n    )\n  "), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"User\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"name\" TEXT NOT NULL,\n      \"role\" TEXT NOT NULL DEFAULT 'LIBRARIAN',\n      \"pinHash\" TEXT,\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n    )\n  "), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"Checkout\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"subjectId\" INTEGER NOT NULL,\n      \"studentName\" TEXT NOT NULL,\n      \"studentClass\" TEXT,\n      \"checkoutDate\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      \"dueDate\" DATETIME NOT NULL,\n      \"returnDate\" DATETIME,\n      \"status\" TEXT NOT NULL DEFAULT 'ACTIVE',\n      \"conditionOut\" INTEGER NOT NULL,\n      \"conditionIn\" INTEGER,\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      \"updatedAt\" DATETIME NOT NULL,\n      CONSTRAINT \"Checkout_subjectId_fkey\" FOREIGN KEY (\"subjectId\") REFERENCES \"Subject\" (\"id\") ON DELETE RESTRICT ON UPDATE CASCADE\n    )\n  "), await e.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"Checkout_subjectId_idx\" ON \"Checkout\"(\"subjectId\")"), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"BorrowingRule\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"roleOrGrade\" TEXT NOT NULL,\n      \"maxBooksAllowed\" INTEGER NOT NULL DEFAULT 2,\n      \"borrowDurationDays\" INTEGER NOT NULL DEFAULT 14,\n      \"finePerDay\" REAL NOT NULL DEFAULT 0.0,\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      \"updatedAt\" DATETIME NOT NULL\n    )\n  "), await e.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"BorrowingRule_roleOrGrade_key\" ON \"BorrowingRule\"(\"roleOrGrade\")"), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"StockAudit\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"auditDate\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      \"auditedBy\" TEXT,\n      \"notes\" TEXT,\n      \"status\" TEXT NOT NULL DEFAULT 'IN_PROGRESS',\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      \"updatedAt\" DATETIME NOT NULL\n    )\n  "), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"StockAuditItem\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"auditId\" INTEGER NOT NULL,\n      \"subjectId\" INTEGER NOT NULL,\n      \"expectedCount\" INTEGER NOT NULL,\n      \"actualCount\" INTEGER NOT NULL,\n      \"discrepancy\" INTEGER NOT NULL,\n      \"notes\" TEXT,\n      CONSTRAINT \"StockAuditItem_auditId_fkey\" FOREIGN KEY (\"auditId\") REFERENCES \"StockAudit\" (\"id\") ON DELETE CASCADE ON UPDATE CASCADE,\n      CONSTRAINT \"StockAuditItem_subjectId_fkey\" FOREIGN KEY (\"subjectId\") REFERENCES \"Subject\" (\"id\") ON DELETE RESTRICT ON UPDATE CASCADE\n    )\n  "), await e.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"StockAuditItem_auditId_subjectId_key\" ON \"StockAuditItem\"(\"auditId\", \"subjectId\")"), await e.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"StockAuditItem_auditId_idx\" ON \"StockAuditItem\"(\"auditId\")"), await e.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"StockAuditItem_subjectId_idx\" ON \"StockAuditItem\"(\"subjectId\")"), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"AppConfig\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,\n      \"autoBackupEnabled\" BOOLEAN NOT NULL DEFAULT 0,\n      \"autoBackupPath\" TEXT,\n      \"autoBackupIntervalHours\" INTEGER NOT NULL DEFAULT 24,\n      \"lastAutoBackupAt\" DATETIME,\n      \"lanSyncEnabled\" BOOLEAN NOT NULL DEFAULT 0,\n      \"lanPort\" INTEGER NOT NULL DEFAULT 8085,\n      \"lanPasscode\" TEXT DEFAULT 'quantlib-sync',\n      \"lastLanSyncAt\" DATETIME,\n      \"updatedAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n    )\n  ");
	let t = await e.$queryRawUnsafe("SELECT COUNT(*) as count FROM \"AppConfig\"");
	if (Number(t[0]?.count || 0) === 0) {
		let t = (/* @__PURE__ */ new Date()).toISOString();
		await e.$executeRawUnsafe("INSERT INTO \"AppConfig\" (\"id\", \"autoBackupEnabled\", \"autoBackupIntervalHours\", \"lanSyncEnabled\", \"lanPort\", \"lanPasscode\", \"updatedAt\") VALUES (1, 0, 24, 0, 8085, 'quantlib-sync', ?)", t);
	}
	let n = await e.$queryRawUnsafe("SELECT COUNT(*) as count FROM \"BorrowingRule\"");
	if (Number(n[0]?.count || 0) === 0) {
		let t = [
			{
				roleOrGrade: "DEFAULT",
				maxBooksAllowed: 2,
				borrowDurationDays: 14,
				finePerDay: 0
			},
			{
				roleOrGrade: "S.1-S.4",
				maxBooksAllowed: 2,
				borrowDurationDays: 14,
				finePerDay: 0
			},
			{
				roleOrGrade: "S.5-S.6",
				maxBooksAllowed: 4,
				borrowDurationDays: 21,
				finePerDay: 0
			},
			{
				roleOrGrade: "TEACHER",
				maxBooksAllowed: 10,
				borrowDurationDays: 30,
				finePerDay: 0
			}
		], n = (/* @__PURE__ */ new Date()).toISOString();
		for (let r of t) await e.$executeRawUnsafe("INSERT INTO \"BorrowingRule\" (\"roleOrGrade\", \"maxBooksAllowed\", \"borrowDurationDays\", \"finePerDay\", \"updatedAt\") VALUES (?, ?, ?, ?, ?)", r.roleOrGrade, r.maxBooksAllowed, r.borrowDurationDays, r.finePerDay, n);
	}
}
async function le() {
	return O = new o({ datasources: { db: { url: `file:${x()}?connection_limit=1` } } }), await ce(O), O;
}
async function M() {
	O &&= (await O.$disconnect(), null);
}
async function N() {
	if (k) return;
	oe = !0;
	let e = Date.now();
	for (; ae > 0 && Date.now() - e < 5e3;) await new Promise((e) => setTimeout(e, 50));
	await M();
	try {
		await D();
	} finally {
		k = !0;
	}
}
//#endregion
//#region src/lib/utils.ts
function P(e) {
	let t = e.openingCount + e.recovered - e.issued - e.damaged - e.lost;
	return Math.max(0, t);
}
function ue(e) {
	return e.length < 12 ? "Password must be at least 12 characters long" : /[a-z]/.test(e) ? /[A-Z]/.test(e) ? /\d/.test(e) ? /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(e) ? "" : "Password must include at least one special character" : "Password must include at least one number" : "Password must include at least one uppercase letter" : "Password must include at least one lowercase letter";
}
var F = {
	DAMAGED: "DAMAGED",
	LOST: "LOST",
	NEW: "NEW",
	RECOVERED: "RECOVERED",
	DONATION: "DONATION"
}, I = /* @__PURE__ */ new Map();
function de() {
	r.handle("check-db-status", () => S()), r.handle("setup-db", async (e, t) => {
		let n = ue(t);
		if (n) return {
			success: !1,
			error: n
		};
		let r = ee(t);
		if (r.success) try {
			await le();
		} catch (e) {
			return await M(), {
				success: !1,
				error: j(e)
			};
		}
		return r;
	}), r.handle("unlock-db", async (e, { password: t, isRecovery: n = !1 }) => {
		let r = n ? "recovery" : "password", i = I.get(r) || {
			attempts: 0,
			nextAllowedTime: 0
		};
		if (Date.now() < i.nextAllowedTime) return {
			success: !1,
			error: `Too many failed attempts. Try again in ${Math.ceil((i.nextAllowedTime - Date.now()) / 1e3)} seconds.`
		};
		let a = ne(t, n);
		if (!a.success) {
			i.attempts++;
			let e = Math.min(60, 2 ** (i.attempts - 1));
			return i.nextAllowedTime = Date.now() + e * 1e3, I.set(r, i), {
				success: !1,
				error: "Invalid password or recovery key"
			};
		}
		if (I.delete(r), a.success) try {
			await le();
		} catch (e) {
			return await M(), {
				success: !1,
				error: j(e)
			};
		}
		return a;
	}), r.handle("lock-db", async () => {
		try {
			return D(), await M(), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("change-password", (e, { oldPassword: t, newPassword: n }) => {
		let r = ue(n);
		return r ? {
			success: !1,
			error: r
		} : ie(t, n);
	});
}
//#endregion
//#region electron/ipc/inventory.ts
var fe = Object.values(F);
function pe() {
	r.handle("get-subjects", async () => {
		try {
			return {
				success: !0,
				data: await A().subject.findMany()
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-incidents", async () => {
		try {
			return {
				success: !0,
				data: await A().incident.findMany({
					include: { subject: !0 },
					orderBy: { date: "desc" }
				})
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-summary", async () => {
		try {
			let e = A(), [t, n] = await Promise.all([e.subject.findMany(), e.checkout.count({ where: {
				status: "ACTIVE",
				dueDate: { lt: /* @__PURE__ */ new Date() }
			} })]), { totalBooks: r, available: i, issued: a, damagedLost: o } = t.reduce((e, t) => (e.totalBooks += t.openingCount + t.recovered, e.issued += t.issued, e.damagedLost += t.damaged + t.lost, e.available += P(t), e), {
				totalBooks: 0,
				available: 0,
				issued: 0,
				damagedLost: 0
			});
			return {
				success: !0,
				data: {
					totalBooks: r,
					available: i,
					issued: a,
					damagedLost: o,
					subjects: t,
					overdueCount: n
				}
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("add-subject", async (e, t) => {
		try {
			let e = A();
			if (!t.name || typeof t.name != "string") throw Error("Invalid subject name");
			let n = await e.subject.create({ data: {
				name: t.name.trim(),
				category: typeof t.category == "string" && t.category.trim() ? t.category.trim() : "General",
				openingCount: typeof t.openingCount == "number" ? Math.max(0, t.openingCount) : 0,
				notes: typeof t.notes == "string" && t.notes.trim() ? t.notes.trim() : null
			} });
			return await T(), {
				success: !0,
				data: n
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("add-incident", async (e, t) => {
		try {
			let e = A();
			if (!t.bookTitle || typeof t.bookTitle != "string") throw Error("Invalid book title");
			if (!fe.includes(t.type)) throw Error("Invalid incident type");
			if (t.subjectId && typeof t.subjectId != "number") throw Error("Invalid subject ID");
			let n = await e.$transaction(async (e) => {
				let n = null;
				if (t.subjectId && (n = await e.subject.findUnique({ where: { id: t.subjectId } }), !n)) throw Error("Referenced subject does not exist");
				let r = await e.incident.create({
					data: {
						type: t.type,
						date: t.date ? new Date(t.date) : /* @__PURE__ */ new Date(),
						subjectId: t.subjectId || null,
						bookTitle: t.bookTitle,
						condition: t.condition || null,
						comment: t.comment || null,
						reportedBy: t.reportedBy || null,
						responsibleParty: t.responsibleParty || null,
						studentClass: t.studentClass || null,
						actionTaken: t.actionTaken || "PENDING"
					},
					include: { subject: !0 }
				});
				if (t.subjectId && n) {
					let r = {};
					if (t.type === F.DAMAGED && (r.damaged = { increment: 1 }), t.type === F.LOST && (r.lost = { increment: 1 }), t.type === F.RECOVERED && (r.recovered = { increment: 1 }), (t.type === F.NEW || t.type === F.DONATION) && (r.openingCount = { increment: 1 }), Object.keys(r).length > 0) {
						await e.subject.update({
							where: { id: t.subjectId },
							data: r
						});
						let i = t.type === F.DAMAGED ? "damaged" : t.type === F.LOST ? "lost" : t.type === F.RECOVERED ? "recovered" : t.type === F.NEW || t.type === F.DONATION ? "openingCount" : null;
						if (i) {
							let r = String(n[i] ?? 0), a = String(Number(n[i] ?? 0) + 1);
							await e.auditLog.create({ data: {
								subjectId: t.subjectId,
								field: i,
								oldValue: r,
								newValue: a,
								changedBy: "LIBRARIAN"
							} });
						}
					}
				}
				return r;
			});
			return await T(), {
				success: !0,
				data: n
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("resolve-incident", async (e, t) => {
		try {
			let e = A();
			if (!t?.id || typeof t.id != "number") throw Error("Invalid incident ID");
			let n = await e.$transaction(async (e) => {
				let n = await e.incident.findUnique({ where: { id: t.id } });
				if (!n) throw Error("Incident not found");
				if (n.actionTaken === "RESOLVED") throw Error("Incident is already resolved");
				let r = t.resolutionNotes ? n.comment ? `${n.comment} | Resolved: ${t.resolutionNotes}` : `Resolved: ${t.resolutionNotes}` : n.comment, i = await e.incident.update({
					where: { id: t.id },
					data: {
						actionTaken: "RESOLVED",
						comment: r
					},
					include: { subject: !0 }
				});
				if (n.subjectId) {
					let t = await e.subject.findUnique({ where: { id: n.subjectId } });
					if (t) {
						if (n.type === F.DAMAGED && t.damaged > 0) {
							let n = Math.max(0, t.damaged - 1);
							await e.subject.update({
								where: { id: t.id },
								data: { damaged: n }
							}), await e.auditLog.create({ data: {
								subjectId: t.id,
								field: "damaged",
								oldValue: String(t.damaged),
								newValue: String(n),
								changedBy: "INCIDENT_RESOLVED"
							} });
						} else if (n.type === F.LOST) {
							let n = t.recovered + 1;
							await e.subject.update({
								where: { id: t.id },
								data: { recovered: n }
							}), await e.auditLog.create({ data: {
								subjectId: t.id,
								field: "recovered",
								oldValue: String(t.recovered),
								newValue: String(n),
								changedBy: "INCIDENT_RESOLVED"
							} });
						}
					}
				}
				return i;
			});
			return await T(), {
				success: !0,
				data: n
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("update-subject", async (e, t) => {
		try {
			let e = A();
			if (!t.id || typeof t.id != "number") throw Error("Invalid subject ID");
			let n = await e.$transaction(async (e) => {
				let n = await e.subject.findUnique({ where: { id: t.id } });
				if (!n) throw Error("Referenced subject does not exist");
				let r = {}, i = [];
				if (typeof t.data?.name == "string" && t.data.name.trim()) {
					let e = t.data.name.trim();
					r.name = e, e !== n.name && i.push({
						field: "name",
						oldValue: n.name,
						newValue: e
					});
				}
				if (typeof t.data?.category == "string") {
					let e = t.data.category.trim() || "General";
					r.category = e, e !== (n.category || "") && i.push({
						field: "category",
						oldValue: n.category || "",
						newValue: e
					});
				}
				if (t.data?.notes !== void 0) {
					let e = typeof t.data.notes == "string" && t.data.notes.trim() ? t.data.notes.trim() : null;
					r.notes = e, (e || "") !== (n.notes || "") && i.push({
						field: "notes",
						oldValue: n.notes || "",
						newValue: e || ""
					});
				}
				for (let e of [
					"openingCount",
					"recovered",
					"issued",
					"damaged",
					"lost"
				]) {
					let a = t.data?.[e];
					if (typeof a == "number" && !Number.isNaN(a)) {
						let t = Math.max(0, Math.floor(a));
						r[e] = t, t !== n[e] && i.push({
							field: e,
							oldValue: String(n[e]),
							newValue: String(t)
						});
					}
				}
				let a = await e.subject.update({
					where: { id: t.id },
					data: r
				});
				return i.length > 0 && await e.auditLog.createMany({ data: i.map((e) => ({
					subjectId: t.id,
					changedBy: "LIBRARIAN",
					...e
				})) }), a;
			});
			return await T(), {
				success: !0,
				data: n
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("delete-subject", async (e, t) => {
		try {
			let e = A();
			if (!t || typeof t != "number") throw Error("Invalid subject ID");
			return await e.$transaction(async (e) => {
				if (!await e.subject.findUnique({ where: { id: t } })) throw Error("Subject not found");
				if (await e.checkout.count({ where: {
					subjectId: t,
					status: "ACTIVE"
				} }) > 0) throw Error("Cannot delete a subject with active student loans. Return all active checkouts first.");
				await e.stockAuditItem.deleteMany({ where: { subjectId: t } }), await e.incident.deleteMany({ where: { subjectId: t } }), await e.auditLog.deleteMany({ where: { subjectId: t } }), await e.checkout.deleteMany({ where: { subjectId: t } }), await e.subject.delete({ where: { id: t } });
			}), await T(), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-audit-logs", async () => {
		try {
			return {
				success: !0,
				data: await A().auditLog.findMany({
					include: { subject: !0 },
					orderBy: { changedAt: "desc" },
					take: 100
				})
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-school-info", async () => {
		try {
			return {
				success: !0,
				data: await A().school.findFirst() || {
					name: "Mentor High School - Kitende",
					motto: "Education is the Key",
					academicYear: "2026",
					address: "",
					contactPhone: ""
				}
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("save-school-info", async (e, t) => {
		try {
			let e = A(), n = await e.school.findFirst(), r = {
				name: t.name,
				motto: t.motto ?? null,
				academicYear: t.academicYear ?? null,
				address: t.address ?? null,
				contactPhone: t.contactPhone ?? null,
				logoPath: t.logoPath ?? null
			}, i;
			return i = n ? await e.school.update({
				where: { id: n.id },
				data: r
			}) : await e.school.create({ data: r }), await T(), {
				success: !0,
				data: i
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	});
}
//#endregion
//#region electron/ipc/checkouts.ts
function L(e, t) {
	if (!t || t.length === 0) return {
		roleOrGrade: "DEFAULT",
		maxBooksAllowed: 2,
		borrowDurationDays: 14,
		finePerDay: 0
	};
	let n = t.find((e) => e.roleOrGrade === "DEFAULT") || {
		roleOrGrade: "DEFAULT",
		maxBooksAllowed: 2,
		borrowDurationDays: 14,
		finePerDay: 0
	};
	if (!e || !e.trim()) return n;
	let r = e.trim().toUpperCase(), i = t.find((e) => e.roleOrGrade.trim().toUpperCase() === r);
	if (i) return i;
	if (r.startsWith("S.1") || r.startsWith("S.2") || r.startsWith("S.3") || r.startsWith("S.4")) {
		let e = t.find((e) => e.roleOrGrade === "S.1-S.4");
		if (e) return e;
	}
	if (r.startsWith("S.5") || r.startsWith("S.6")) {
		let e = t.find((e) => e.roleOrGrade === "S.5-S.6");
		if (e) return e;
	}
	if (r.includes("TEACHER") || r.includes("STAFF")) {
		let e = t.find((e) => e.roleOrGrade === "TEACHER");
		if (e) return e;
	}
	return n;
}
async function R(e, t) {
	if (!e || typeof e != "string" || !e.trim()) throw Error("Invalid student name");
	let n = A(), r = e.trim(), i = t ? t.trim() : null, a = (await n.checkout.findMany({
		where: { status: "ACTIVE" },
		include: { subject: !0 }
	})).filter((e) => e.studentName.trim().toLowerCase() === r.toLowerCase() && (!i || (e.studentClass || "").trim().toLowerCase() === i.toLowerCase())), o = (await n.incident.findMany({ include: { subject: !0 } })).filter((e) => e.responsibleParty && e.responsibleParty.trim().toLowerCase() === r.toLowerCase() && (!i || !e.studentClass || e.studentClass.trim().toLowerCase() === i.toLowerCase())), s = o.filter((e) => !(e.actionTaken && (e.actionTaken.toUpperCase().includes("RESOLVED") || e.actionTaken.toUpperCase().includes("PAID") || e.actionTaken.toUpperCase().includes("WAIVED")))), c = L(i, await n.borrowingRule.findMany()), l = /* @__PURE__ */ new Date(), u = 0;
	for (let e of a) if (e.dueDate < l) {
		let t = l.getTime() - new Date(e.dueDate).getTime(), n = Math.ceil(t / (1e3 * 60 * 60 * 24));
		u += Math.min(15, n * c.finePerDay);
	}
	let d = 0;
	for (let e of s) e.type === "LOST" ? d += 25 : e.type === "DAMAGED" ? d += 10 : d += 5;
	let f = Math.round((u + d) * 100) / 100, p = a.length === 0 && s.length === 0;
	return {
		studentName: r,
		studentClass: i,
		status: p ? "CLEARED" : "HOLD",
		activeCheckouts: a,
		incidents: o,
		unresolvedIncidents: s,
		totalReplacementCharges: f,
		totalOverdueFines: Math.round(u * 100) / 100,
		totalIncidentCharges: Math.round(d * 100) / 100,
		totalAmountDue: f,
		isCleared: p
	};
}
function me() {
	r.handle("add-checkout", async (e, t) => {
		try {
			let e = A();
			if (!t.subjectId || typeof t.subjectId != "number") throw Error("Invalid subject ID");
			if (!t.studentName || typeof t.studentName != "string") throw Error("Invalid student name");
			let n = t.studentName.trim(), r = t.studentClass ? t.studentClass.trim() : null, i = L(r, await e.borrowingRule.findMany()), a = await e.$transaction(async (e) => {
				let a = await e.subject.findUnique({ where: { id: t.subjectId } });
				if (!a) throw Error("Referenced subject does not exist");
				if (P(a) <= 0) throw Error("No available books for this subject");
				let o = await e.checkout.count({ where: {
					studentName: n,
					status: "ACTIVE",
					...r ? { studentClass: r } : {}
				} });
				if (o >= i.maxBooksAllowed) throw Error(`Borrowing limit exceeded: ${n} already has ${o} active book(s) checked out (max allowed for ${i.roleOrGrade}: ${i.maxBooksAllowed}).`);
				let s;
				t.dueDate ? s = new Date(t.dueDate) : (s = /* @__PURE__ */ new Date(), s.setDate(s.getDate() + i.borrowDurationDays));
				let c = await e.checkout.create({ data: {
					subjectId: t.subjectId,
					studentName: n,
					studentClass: r,
					dueDate: s,
					conditionOut: typeof t.conditionOut == "number" ? t.conditionOut : 3,
					status: "ACTIVE"
				} });
				return await e.subject.update({
					where: { id: t.subjectId },
					data: { issued: { increment: 1 } }
				}), await e.auditLog.create({ data: {
					subjectId: t.subjectId,
					field: "issued",
					oldValue: a.issued.toString(),
					newValue: (a.issued + 1).toString(),
					changedBy: "LIBRARIAN"
				} }), c;
			});
			return await T(), {
				success: !0,
				data: a
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("return-checkout", async (e, { id: t, conditionIn: n }) => {
		try {
			let e = A();
			if (typeof t != "number") throw Error("Invalid checkout ID");
			let r = await e.$transaction(async (e) => {
				let r = await e.checkout.findUnique({ where: { id: t } });
				if (!r) throw Error("Checkout record not found");
				if (r.status !== "ACTIVE") throw Error("Checkout is not active");
				let i = await e.checkout.update({
					where: { id: t },
					data: {
						status: "RETURNED",
						returnDate: /* @__PURE__ */ new Date(),
						conditionIn: typeof n == "number" ? n : null
					}
				}), a = await e.subject.findUnique({
					where: { id: i.subjectId },
					include: { checkouts: !0 }
				});
				if (a) {
					let { totalDegradation: t, count: r } = a.checkouts.reduce((e, t) => (t.status === "RETURNED" && t.conditionIn !== null && (e.totalDegradation += t.conditionOut - (t.conditionIn ?? t.conditionOut), e.count++), e), {
						totalDegradation: 0,
						count: 0
					}), o = r > 0 ? t / r : 0, s = a.openingCount + a.recovered - a.lost - a.damaged, c = i.conditionOut - (n ?? i.conditionOut), l = s > 0 ? c / s : c, u = Math.max(1, a.averageCondition - l);
					await e.subject.update({
						where: { id: a.id },
						data: {
							issued: { decrement: 1 },
							degradationRate: o,
							averageCondition: u
						}
					}), await e.auditLog.create({ data: {
						subjectId: a.id,
						field: "issued",
						oldValue: a.issued.toString(),
						newValue: (a.issued - 1).toString(),
						changedBy: "LIBRARIAN"
					} });
				}
				return i;
			});
			return await T(), {
				success: !0,
				data: r
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("renew-checkout", async (e, t) => {
		try {
			let e = A(), { id: n, extraDays: r = 7, newDueDate: i } = t || {};
			if (!n || typeof n != "number") throw Error("Invalid checkout ID");
			let a = await e.$transaction(async (e) => {
				let t = await e.checkout.findUnique({ where: { id: n } });
				if (!t) throw Error("Checkout record not found");
				if (t.status !== "ACTIVE") throw Error("Only active checkouts can be renewed");
				let a;
				if (i) a = new Date(i);
				else {
					let e = Math.max(Date.now(), new Date(t.dueDate).getTime());
					a = new Date(e + Math.max(1, r) * 24 * 60 * 60 * 1e3);
				}
				return e.checkout.update({
					where: { id: n },
					data: { dueDate: a },
					include: { subject: !0 }
				});
			});
			return await T(), {
				success: !0,
				data: a
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-active-checkouts", async (e, t) => {
		try {
			let e = A(), n = { status: "ACTIVE" };
			return typeof t == "number" && t > 0 && (n.subjectId = t), {
				success: !0,
				data: await e.checkout.findMany({
					where: n,
					include: { subject: !0 },
					orderBy: { checkoutDate: "desc" }
				})
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("record-fine-payment", async (e, t) => {
		try {
			let e = A(), { studentName: n, studentClass: r, amount: i, paymentMethod: a, notes: o } = t || {};
			if (!n || typeof n != "string" || !n.trim()) throw Error("Invalid student name");
			let s = Number(i);
			if (isNaN(s) || s < 0) throw Error("Invalid payment amount");
			let c = n.trim(), l = r ? r.trim() : null, u = a || "Cash", d = (/* @__PURE__ */ new Date()).toLocaleDateString(), f = (await e.incident.findMany()).filter((e) => e.responsibleParty && e.responsibleParty.trim().toLowerCase() === c.toLowerCase() && (!l || !e.studentClass || e.studentClass.trim().toLowerCase() === l.toLowerCase()) && (!e.actionTaken || !e.actionTaken.toUpperCase().includes("PAID") && !e.actionTaken.toUpperCase().includes("WAIVED") && !e.actionTaken.toUpperCase().includes("RESOLVED")));
			for (let t of f) await e.incident.update({
				where: { id: t.id },
				data: { actionTaken: `PAID (${u} - $${s.toFixed(2)}${o ? " - " + o : ""}) on ${d}` }
			});
			let p = await R(c, l);
			return await T(), {
				success: !0,
				data: p
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("waive-fine", async (e, t) => {
		try {
			let e = A(), { studentName: n, studentClass: r, reason: i, approvedBy: a } = t || {};
			if (!n || typeof n != "string" || !n.trim()) throw Error("Invalid student name");
			if (!i || typeof i != "string" || !i.trim()) throw Error("Waiver reason is required");
			let o = n.trim(), s = r ? r.trim() : null, c = a ? a.trim() : "LIBRARIAN", l = (/* @__PURE__ */ new Date()).toLocaleDateString(), u = (await e.incident.findMany()).filter((e) => e.responsibleParty && e.responsibleParty.trim().toLowerCase() === o.toLowerCase() && (!s || !e.studentClass || e.studentClass.trim().toLowerCase() === s.toLowerCase()) && (!e.actionTaken || !e.actionTaken.toUpperCase().includes("PAID") && !e.actionTaken.toUpperCase().includes("WAIVED") && !e.actionTaken.toUpperCase().includes("RESOLVED")));
			for (let t of u) await e.incident.update({
				where: { id: t.id },
				data: { actionTaken: `WAIVED (Reason: ${i.trim()} by ${c}) on ${l}` }
			});
			let d = await R(o, s);
			return await T(), {
				success: !0,
				data: d
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-overdue-checkouts", async () => {
		try {
			return {
				success: !0,
				data: await A().checkout.findMany({
					where: {
						status: "ACTIVE",
						dueDate: { lt: /* @__PURE__ */ new Date() }
					},
					include: { subject: !0 },
					orderBy: { dueDate: "asc" }
				})
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-borrowing-rules", async () => {
		try {
			return {
				success: !0,
				data: await A().borrowingRule.findMany({ orderBy: { id: "asc" } })
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("save-borrowing-rule", async (e, t) => {
		try {
			let e = A();
			if (!t.roleOrGrade || typeof t.roleOrGrade != "string") throw Error("Invalid role or grade");
			let n = t.roleOrGrade.trim().toUpperCase(), r = typeof t.maxBooksAllowed == "number" ? t.maxBooksAllowed : Number(t.maxBooksAllowed || 2), i = typeof t.borrowDurationDays == "number" ? t.borrowDurationDays : Number(t.borrowDurationDays || 14), a = typeof t.finePerDay == "number" ? t.finePerDay : Number(t.finePerDay || 0), o = await e.borrowingRule.upsert({
				where: { roleOrGrade: n },
				update: {
					maxBooksAllowed: r,
					borrowDurationDays: i,
					finePerDay: a
				},
				create: {
					roleOrGrade: n,
					maxBooksAllowed: r,
					borrowDurationDays: i,
					finePerDay: a
				}
			});
			return await T(), {
				success: !0,
				data: o
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("delete-borrowing-rule", async (e, t) => {
		try {
			let e = A(), n = typeof t == "number" ? t : t?.id;
			if (!n || typeof n != "number") throw Error("Invalid rule ID");
			if ((await e.borrowingRule.findUnique({ where: { id: n } }))?.roleOrGrade === "DEFAULT") throw Error("Cannot delete the DEFAULT borrowing rule");
			return await e.borrowingRule.delete({ where: { id: n } }), await T(), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-clearance-status", async (e, t) => {
		try {
			A();
			let { studentName: e, studentClass: n } = t || {};
			return {
				success: !0,
				data: await R(e, n)
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("generate-clearance-slip", async (e, t) => {
		try {
			let e = A(), { studentName: n, studentClass: r } = t || {}, i = await R(n, r), a = await e.school.findFirst();
			a ||= {
				id: 1,
				name: "Mentor High School - Kitende",
				motto: "Education is the Key",
				logoPath: null,
				address: "P.O. Box 1234, Kampala",
				contactName: "Library Dept",
				contactPhone: "+256 700 000 000",
				academicYear: "2026",
				updatedAt: /* @__PURE__ */ new Date(),
				checkoutDuration: 14
			};
			let o = i.status === "CLEARED" ? "CLEARED - Student has returned all materials and cleared all outstanding obligations." : "HOLD - Clearance withheld due to outstanding checkouts or unaddressed incidents.";
			return {
				success: !0,
				data: {
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					school: {
						name: a.name,
						motto: a.motto,
						logoPath: a.logoPath,
						address: a.address,
						contactPhone: a.contactPhone,
						academicYear: a.academicYear
					},
					student: {
						studentName: i.studentName,
						studentClass: i.studentClass
					},
					status: i.status,
					activeCheckouts: i.activeCheckouts,
					incidents: i.incidents,
					unresolvedIncidents: i.unresolvedIncidents,
					totalReplacementCharges: i.totalReplacementCharges,
					clearanceDecision: o
				}
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	});
}
//#endregion
//#region electron/ipc/audits.ts
function z(e, t) {
	let n = typeof e == "number" && !isNaN(e) ? Math.max(0, e) : 0, r = typeof t == "number" && !isNaN(t) ? Math.max(0, t) : 0, i = r - n;
	return {
		expectedCount: n,
		actualCount: r,
		discrepancy: i,
		hasDiscrepancy: i !== 0,
		isMissing: i < 0,
		isMisplaced: i > 0,
		discrepancyAmount: Math.abs(i)
	};
}
function B(e) {
	let t = 0, n = 0, r = 0, i = 0, a = 0;
	for (let o of e) t += o.expectedCount, n += o.actualCount, r += o.discrepancy, o.discrepancy < 0 && (i += Math.abs(o.discrepancy)), o.discrepancy > 0 && (a += o.discrepancy);
	return {
		totalSubjects: e.length,
		totalExpected: t,
		totalActual: n,
		totalDiscrepancy: r,
		missingItems: i,
		misplacedItems: a
	};
}
function he() {
	r.handle("create-stock-audit", async (e, t) => {
		try {
			let e = A(), n = typeof t?.auditedBy == "string" && t.auditedBy.trim() ? t.auditedBy.trim() : "LIBRARIAN", r = typeof t?.notes == "string" && t.notes.trim() ? t.notes.trim() : null, i = await e.subject.findMany(), a = await e.$transaction(async (e) => {
				let t = await e.stockAudit.create({ data: {
					auditedBy: n,
					notes: r,
					status: "IN_PROGRESS"
				} });
				if (i.length > 0) {
					let n = i.map((e) => {
						let n = P(e);
						return {
							auditId: t.id,
							subjectId: e.id,
							expectedCount: n,
							actualCount: n,
							discrepancy: 0
						};
					});
					await e.stockAuditItem.createMany({ data: n });
				}
				let a = await e.stockAudit.findUnique({
					where: { id: t.id },
					include: { items: { include: { subject: !0 } } }
				});
				return a && {
					...a,
					summary: B(a.items)
				};
			});
			return await T(), {
				success: !0,
				data: a
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("save-stock-audit-item", async (e, t) => {
		try {
			let e = A(), { auditId: n, subjectId: r, actualCount: i, notes: a } = t || {};
			if (!n || typeof n != "number") throw Error("Invalid audit ID");
			if (!r || typeof r != "number") throw Error("Invalid subject ID");
			if (typeof i != "number") throw Error("Invalid actual count");
			let o = await e.$transaction(async (e) => {
				let t = await e.stockAudit.findUnique({ where: { id: n } });
				if (!t) throw Error("Stock audit not found");
				if (t.status === "COMPLETED") throw Error("Cannot edit a completed audit");
				let o = await e.subject.findUnique({ where: { id: r } });
				if (!o) throw Error("Referenced subject does not exist");
				let s = P(o), c = z(s, i);
				return await e.stockAuditItem.upsert({
					where: { auditId_subjectId: {
						auditId: n,
						subjectId: r
					} },
					create: {
						auditId: n,
						subjectId: r,
						expectedCount: s,
						actualCount: c.actualCount,
						discrepancy: c.discrepancy,
						notes: a || null
					},
					update: {
						expectedCount: s,
						actualCount: c.actualCount,
						discrepancy: c.discrepancy,
						notes: a === void 0 ? void 0 : a
					},
					include: { subject: !0 }
				});
			});
			return await T(), {
				success: !0,
				data: o
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("complete-stock-audit", async (e, t) => {
		try {
			let e = A(), { auditId: n, notes: r } = t || {};
			if (!n || typeof n != "number") throw Error("Invalid audit ID");
			let i = await e.$transaction(async (e) => {
				let t = await e.stockAudit.findUnique({
					where: { id: n },
					include: { items: { include: { subject: !0 } } }
				});
				if (!t) throw Error("Stock audit not found");
				if (t.status === "COMPLETED") throw Error("Stock audit is already completed");
				let i = await e.stockAudit.update({
					where: { id: n },
					data: {
						status: "COMPLETED",
						notes: r === void 0 ? t.notes : r,
						updatedAt: /* @__PURE__ */ new Date()
					},
					include: { items: { include: { subject: !0 } } }
				});
				for (let t of i.items) if (t.discrepancy < 0 && t.subject) {
					let n = Math.abs(t.discrepancy);
					await e.subject.update({
						where: { id: t.subjectId },
						data: { lost: { increment: n } }
					}), await e.auditLog.create({ data: {
						subjectId: t.subjectId,
						field: "lost",
						oldValue: t.subject.lost.toString(),
						newValue: (t.subject.lost + n).toString(),
						changedBy: "AUDIT_AUTO"
					} });
				} else if (t.discrepancy > 0 && t.subject) {
					let r = t.discrepancy;
					await e.subject.update({
						where: { id: t.subjectId },
						data: { recovered: { increment: r } }
					}), await e.incident.create({ data: {
						type: "RECOVERED",
						date: /* @__PURE__ */ new Date(),
						subjectId: t.subjectId,
						bookTitle: `${t.subject.name} (x${r})`,
						condition: "Good",
						comment: `Auto-logged surplus from Stock Audit #${n}`,
						reportedBy: "Stock Audit System",
						actionTaken: "STOCK_ADJUSTED"
					} }), await e.auditLog.create({ data: {
						subjectId: t.subjectId,
						field: "recovered",
						oldValue: t.subject.recovered.toString(),
						newValue: (t.subject.recovered + r).toString(),
						changedBy: "AUDIT_AUTO"
					} });
				}
				return {
					...i,
					summary: B(i.items)
				};
			});
			return await T(), {
				success: !0,
				data: i
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-stock-audits", async (e, t) => {
		try {
			let e = A(), n = typeof t == "number" ? t : t?.id;
			if (n) {
				let t = await e.stockAudit.findUnique({
					where: { id: n },
					include: { items: { include: { subject: !0 } } }
				});
				return {
					success: !0,
					data: t ? {
						...t,
						summary: B(t.items)
					} : null
				};
			}
			return {
				success: !0,
				data: (await e.stockAudit.findMany({
					orderBy: { auditDate: "desc" },
					include: { items: { include: { subject: !0 } } }
				})).map((e) => ({
					...e,
					summary: B(e.items)
				}))
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	});
}
//#endregion
//#region electron/ipc/analytics.ts
function V(e, t, n) {
	let r = Math.max(1, Math.min(3, e)), i = t > 0 ? t : .02;
	return {
		currentCondition: r,
		degradationRate: i,
		futureCheckouts: n,
		projectedCondition: Math.max(1, Math.round((r - i * n) * 100) / 100),
		remainingCheckouts: Math.max(0, Math.floor((r - 1) / i))
	};
}
function ge(e, t = 25) {
	let n = 0, r = 0, i = 0, a = e.map((e) => {
		let a = Math.max(0, (e.openingCount || 0) + (e.recovered || 0)), o = Math.max(0, e.damaged || 0), s = Math.max(0, e.lost || 0), c = Math.max(0, a - o - s), l = typeof e.averageCondition == "number" ? e.averageCondition : 3, u = 0;
		if (l <= 1.5) u = c;
		else if (l < 2.5) {
			let e = (2.5 - l) / 1.5;
			u = Math.floor(c * e);
		}
		let d = o + u, f = Math.round(d * t * 100) / 100;
		return n += f, r += o, i += u, {
			subjectId: e.id,
			name: e.name || "Unknown",
			category: e.category || "General",
			totalBooks: a,
			damagedCount: o,
			nearEndLifeCount: u,
			replacementCount: d,
			estimatedCost: f,
			averageCondition: l
		};
	}), o = /* @__PURE__ */ new Map();
	for (let e of a) {
		let t = e.category || "General";
		o.set(t, (o.get(t) || 0) + e.estimatedCost);
	}
	let s = Array.from(o.entries()).map(([e, t]) => ({
		category: e,
		cost: Math.round(t * 100) / 100
	}));
	return {
		subjects: a,
		totalReplacementCost: Math.round(n * 100) / 100,
		totalDamaged: r,
		totalNearEndLife: i,
		categoryCosts: s,
		unitCost: t
	};
}
function _e(e) {
	let t = /* @__PURE__ */ new Map(), n = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday"
	], r = /* @__PURE__ */ new Map();
	n.forEach((e) => r.set(e, 0));
	let i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map();
	for (let o of e) {
		let e = new Date(o.checkoutDate);
		if (isNaN(e.getTime())) continue;
		let s = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}`, c = e.toLocaleString("default", {
			month: "short",
			year: "numeric"
		});
		if (t.has(s) || t.set(s, {
			month: c,
			checkouts: 0,
			returns: 0,
			timestamp: new Date(e.getFullYear(), e.getMonth(), 1).getTime()
		}), t.get(s).checkouts++, o.returnDate) {
			let e = new Date(o.returnDate);
			if (!isNaN(e.getTime())) {
				let n = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}`, r = e.toLocaleString("default", {
					month: "short",
					year: "numeric"
				});
				t.has(n) || t.set(n, {
					month: r,
					checkouts: 0,
					returns: 0,
					timestamp: new Date(e.getFullYear(), e.getMonth(), 1).getTime()
				}), t.get(n).returns++;
			}
		}
		let l = n[e.getDay()];
		r.set(l, (r.get(l) || 0) + 1);
		let u = o.subject?.category || "General";
		i.set(u, (i.get(u) || 0) + 1);
		let d = (o.studentName || "").trim();
		if (d) {
			let e = `${d.toLowerCase()}||${(o.studentClass || "").trim().toLowerCase()}`;
			a.has(e) || a.set(e, {
				studentName: d,
				studentClass: o.studentClass ? o.studentClass.trim() : null,
				totalCheckouts: 0
			}), a.get(e).totalCheckouts++;
		}
	}
	return {
		monthlyTrends: Array.from(t.values()).sort((e, t) => e.timestamp - t.timestamp).map(({ month: e, checkouts: t, returns: n }) => ({
			month: e,
			checkouts: t,
			returns: n
		})),
		peakDays: Array.from(r.entries()).map(([e, t]) => ({
			day: e,
			count: t
		})),
		popularCategories: Array.from(i.entries()).map(([e, t]) => ({
			category: e,
			count: t
		})).sort((e, t) => t.count - e.count),
		topReaders: Array.from(a.values()).sort((e, t) => t.totalCheckouts - e.totalCheckouts).slice(0, 10)
	};
}
function ve() {
	r.handle("get-depreciation-analytics", async () => {
		try {
			let e = await A().subject.findMany({ include: { checkouts: !0 } });
			return {
				success: !0,
				data: {
					decayProjections: e.map((e) => {
						let t = [
							0,
							10,
							25,
							50,
							100
						].map((t) => V(e.averageCondition, e.degradationRate, t)), n = V(e.averageCondition, e.degradationRate, 0);
						return {
							subjectId: e.id,
							subjectName: e.name,
							category: e.category || "General",
							averageCondition: e.averageCondition,
							degradationRate: n.degradationRate,
							remainingCheckouts: n.remainingCheckouts,
							projections: t
						};
					}),
					replacementCostAnalysis: ge(e, 25)
				}
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-circulation-insights", async () => {
		try {
			return {
				success: !0,
				data: _e(await A().checkout.findMany({
					include: { subject: !0 },
					orderBy: { checkoutDate: "asc" }
				}))
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	});
}
//#endregion
//#region electron/services/backup.ts
function H(e = /* @__PURE__ */ new Date()) {
	let t = !(e instanceof Date) || isNaN(e.getTime()) ? /* @__PURE__ */ new Date() : e;
	return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}_${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}${String(t.getSeconds()).padStart(2, "0")}`;
}
function ye(e, t, n = /* @__PURE__ */ new Date()) {
	if (!e) return !0;
	let r = e instanceof Date ? e : new Date(e);
	return !(r instanceof Date) || isNaN(r.getTime()) || r.getTime() > n.getTime() ? !0 : (n.getTime() - r.getTime()) / (1e3 * 60 * 60) >= t;
}
function U(e) {
	let t = i.resolve(e), n = i.parse(t).root;
	if (t === n || t === i.join(n, "Windows") || t === i.join(n, "System32")) throw Error("Invalid or restricted backup directory path.");
	return t;
}
function W(e, n) {
	try {
		if (!e || !e.trim()) return {
			success: !1,
			error: "Target directory is required"
		};
		let r = U(e), a = t.getPath("userData"), o = n || i.join(a, "quantlib.enc");
		if (!c.existsSync(o)) return {
			success: !1,
			error: "Source vault file (quantlib.enc) does not exist."
		};
		c.existsSync(r) || c.mkdirSync(r, { recursive: !0 });
		let s = `quantlib_backup_${H()}.enc`, l = i.join(r, s);
		return c.copyFileSync(o, l), {
			success: !0,
			backupPath: l,
			filename: s
		};
	} catch (e) {
		return {
			success: !1,
			error: e instanceof Error ? e.message : String(e)
		};
	}
}
async function be(e) {
	try {
		let n = U(e || i.join(t.getPath("userData"), "backups"));
		if (!c.existsSync(n)) return [];
		let r = (await c.promises.readdir(n)).filter((e) => e.startsWith("quantlib_backup_") && e.endsWith(".enc"));
		return (await Promise.all(r.map(async (e) => {
			let t = i.join(n, e), r = await c.promises.stat(t);
			return {
				filename: e,
				fullPath: t,
				sizeBytes: r.size,
				createdAt: r.birthtime ? r.birthtime.toISOString() : r.mtime.toISOString()
			};
		}))).sort((e, t) => t.createdAt.localeCompare(e.createdAt));
	} catch {
		return [];
	}
}
function xe(e) {
	try {
		let n = U(e || i.join(t.getPath("userData"), "backups"));
		return c.existsSync(n) ? c.readdirSync(n).filter((e) => e.startsWith("quantlib_backup_") && e.endsWith(".enc")).map((e) => {
			let t = i.join(n, e), r = c.statSync(t);
			return {
				filename: e,
				fullPath: t,
				sizeBytes: r.size,
				createdAt: r.birthtime ? r.birthtime.toISOString() : r.mtime.toISOString()
			};
		}).sort((e, t) => t.createdAt.localeCompare(e.createdAt)) : [];
	} catch {
		return [];
	}
}
var G = null;
function Se() {
	K(), G = setInterval(async () => {
		try {
			let e = se();
			if (!e) return;
			let n = (await e.$queryRawUnsafe("SELECT autoBackupEnabled, autoBackupIntervalHours, autoBackupPath, lastAutoBackupAt FROM AppConfig WHERE id = 1"))[0];
			if (!n || !n.autoBackupEnabled) return;
			if (ye(n.lastAutoBackupAt, n.autoBackupIntervalHours) && W(n.autoBackupPath || i.join(t.getPath("userData"), "backups")).success) {
				let t = (/* @__PURE__ */ new Date()).toISOString();
				await e.$executeRawUnsafe("UPDATE AppConfig SET lastAutoBackupAt = ? WHERE id = 1", t);
			}
		} catch (e) {
			console.error("Auto backup scheduler error:", e);
		}
	}, 3600 * 1e3);
}
function K() {
	G &&= (clearInterval(G), null);
}
//#endregion
//#region electron/services/lan-sync.ts
function Ce() {
	let e = u.networkInterfaces();
	for (let t of Object.keys(e)) for (let n of e[t] || []) if (n.family === "IPv4" && !n.internal) return n.address;
	return "127.0.0.1";
}
async function q(e) {
	let [t, n, r, i] = await Promise.all([
		e.subject.findMany(),
		e.checkout.findMany({ include: { subject: { select: { name: !0 } } } }),
		e.incident.findMany({ include: { subject: { select: { name: !0 } } } }),
		e.borrowingRule.findMany()
	]);
	return {
		version: 1,
		exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
		subjects: t,
		checkouts: n.map((e) => ({
			...e,
			subjectName: e.subject?.name
		})),
		incidents: r.map((e) => ({
			...e,
			subjectName: e.subject?.name
		})),
		borrowingRules: i
	};
}
function J(e, t = /* @__PURE__ */ new Date()) {
	if (!e) return t;
	let n = e instanceof Date ? e : new Date(e);
	return isNaN(n.getTime()) ? t : n;
}
async function Y(e, t) {
	let n = t && typeof t == "object" ? t : null;
	if (!n) return { mergedCounts: {
		subjects: 0,
		checkouts: 0,
		incidents: 0,
		rules: 0
	} };
	let r = Array.isArray(n.borrowingRules) && n.borrowingRules.length > 0, i = Array.isArray(n.subjects) && n.subjects.length > 0, a = Array.isArray(n.checkouts) && n.checkouts.length > 0, o = Array.isArray(n.incidents) && n.incidents.length > 0;
	if (!r && !i && !a && !o) return { mergedCounts: {
		subjects: 0,
		checkouts: 0,
		incidents: 0,
		rules: 0
	} };
	let s = 0, c = 0, l = 0, u = 0;
	await e.$transaction(async (e) => {
		if (Array.isArray(n.borrowingRules)) for (let t of n.borrowingRules) t.roleOrGrade && (await e.borrowingRule.upsert({
			where: { roleOrGrade: t.roleOrGrade },
			update: {
				maxBooksAllowed: t.maxBooksAllowed,
				borrowDurationDays: t.borrowDurationDays,
				finePerDay: t.finePerDay
			},
			create: {
				roleOrGrade: t.roleOrGrade,
				maxBooksAllowed: t.maxBooksAllowed,
				borrowDurationDays: t.borrowDurationDays,
				finePerDay: t.finePerDay
			}
		}), u++);
		let t = /* @__PURE__ */ new Map();
		if (Array.isArray(n.subjects)) {
			for (let r of n.subjects) if (r.name) {
				let n = await e.subject.findUnique({ where: { name: r.name } }), i;
				n ? (i = n.id, i = (await e.subject.update({
					where: { id: n.id },
					data: {
						category: r.category ?? n.category,
						openingCount: Math.max(n.openingCount, r.openingCount || 0),
						recovered: Math.max(n.recovered, r.recovered || 0),
						issued: Math.max(n.issued, r.issued || 0),
						damaged: Math.max(n.damaged, r.damaged || 0),
						lost: Math.max(n.lost, r.lost || 0),
						notes: r.notes ?? n.notes
					}
				})).id) : i = (await e.subject.create({ data: {
					name: r.name,
					category: r.category || "General",
					openingCount: r.openingCount || 0,
					recovered: r.recovered || 0,
					issued: r.issued || 0,
					damaged: r.damaged || 0,
					lost: r.lost || 0,
					notes: r.notes || null,
					averageCondition: r.averageCondition ?? 3,
					degradationRate: r.degradationRate ?? 0
				} })).id, typeof r.id == "number" && t.set(r.id, i), s++;
			}
		}
		if (Array.isArray(n.checkouts)) for (let r of n.checkouts) {
			let n = null;
			if (r.subjectId && t.has(r.subjectId)) n = t.get(r.subjectId);
			else if (r.subjectName) {
				let t = await e.subject.findUnique({ where: { name: r.subjectName } });
				t && (n = t.id);
			} else r.subjectId && (n = r.subjectId);
			if (r.studentName && n !== null) {
				let t = J(r.checkoutDate), i = J(r.dueDate), a = r.returnDate ? J(r.returnDate) : null, o = await e.checkout.findFirst({ where: {
					studentName: r.studentName,
					subjectId: n,
					checkoutDate: t
				} });
				o ? o.status !== "RETURNED" && r.status === "RETURNED" && (await e.checkout.update({
					where: { id: o.id },
					data: {
						returnDate: a || /* @__PURE__ */ new Date(),
						status: "RETURNED",
						conditionIn: r.conditionIn ?? o.conditionIn ?? 3
					}
				}), c++) : (await e.checkout.create({ data: {
					subjectId: n,
					studentName: r.studentName,
					studentClass: r.studentClass || null,
					checkoutDate: t,
					dueDate: i,
					returnDate: a,
					status: r.status || "ACTIVE",
					conditionOut: r.conditionOut ?? 3,
					conditionIn: r.conditionIn ?? null
				} }), c++);
			}
		}
		if (Array.isArray(n.incidents)) for (let r of n.incidents) {
			let n = null;
			if (r.subjectId && t.has(r.subjectId)) n = t.get(r.subjectId);
			else if (r.subjectName) {
				let t = await e.subject.findUnique({ where: { name: r.subjectName } });
				t && (n = t.id);
			}
			if (r.bookTitle) {
				let t = J(r.date);
				await e.incident.findFirst({ where: {
					bookTitle: r.bookTitle,
					date: t
				} }) || (await e.incident.create({ data: {
					type: r.type || "DAMAGED",
					date: t,
					subjectId: n,
					bookTitle: r.bookTitle,
					condition: r.condition || null,
					comment: r.comment || null,
					reportedBy: r.reportedBy || null,
					responsibleParty: r.responsibleParty || null,
					studentClass: r.studentClass || null,
					actionTaken: r.actionTaken || null
				} }), l++);
			}
		}
	});
	try {
		await T();
	} catch {}
	return { mergedCounts: {
		subjects: s,
		checkouts: c,
		incidents: l,
		rules: u
	} };
}
var X = null, we = 8085, Z = "";
function Te() {
	return s.randomBytes(8).toString("hex");
}
function Ee(e = 8085, t) {
	Q(), we = e, Z = t || Te(), X = l.createServer((t, n) => {
		if (n.setHeader("Content-Type", "application/json"), t.method === "OPTIONS") {
			n.writeHead(204), n.end();
			return;
		}
		let r = new URL(t.url || "/", `http://localhost:${e}`);
		if (t.method === "GET" && r.pathname === "/status") {
			n.writeHead(200), n.end(JSON.stringify({
				status: "ok",
				serverName: "QuantLib LAN Sync",
				port: we,
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			}));
			return;
		}
		if (t.method === "POST" && r.pathname === "/sync") {
			let e = "", r = 0;
			t.on("data", (i) => {
				if (r += i.length, r > 10485760) {
					t.destroy(), n.writeHead(413), n.end(JSON.stringify({
						success: !1,
						error: "Payload exceeds maximum allowed size of 10MB"
					}));
					return;
				}
				e += i;
			}), t.on("end", async () => {
				try {
					let r = e ? JSON.parse(e) : {}, i = t.headers["x-sync-passcode"], a = r.passcode || i;
					if (Z) {
						let e = Buffer.from(Z), t = Buffer.from(typeof a == "string" ? a : "");
						if (!(e.length === t.length && s.timingSafeEqual(e, t))) {
							n.writeHead(401), n.end(JSON.stringify({
								success: !1,
								error: "Invalid sync passcode"
							}));
							return;
						}
					}
					let o = se();
					if (!o) {
						n.writeHead(503), n.end(JSON.stringify({
							success: !1,
							error: "Database is locked on server machine"
						}));
						return;
					}
					let c = {};
					r.payload && (c = (await Y(o, r.payload)).mergedCounts);
					let l = await q(o);
					n.writeHead(200), n.end(JSON.stringify({
						success: !0,
						syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
						mergedCounts: c,
						payload: l
					}));
				} catch (e) {
					n.writeHead(500), n.end(JSON.stringify({
						success: !1,
						error: e instanceof Error ? e.message : String(e)
					}));
				}
			});
			return;
		}
		n.writeHead(404), n.end(JSON.stringify({
			success: !1,
			error: "Endpoint not found"
		}));
	}), X.listen(e, () => {
		console.log(`QuantLib LAN Sync server running on port ${e}`);
	});
}
function Q() {
	if (X) {
		try {
			X.close();
		} catch {}
		X = null;
	}
}
async function De(e, t = 8085, n) {
	let r = A();
	if (!e || !e.trim()) throw Error("Peer IP address is required");
	let i = await q(r), a = await fetch(`http://${e.trim()}:${t}/sync`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-sync-passcode": n || ""
		},
		body: JSON.stringify({
			passcode: n || "",
			payload: i
		})
	});
	if (!a.ok) {
		let e = await a.json().catch(() => ({}));
		throw Error(e.error || `LAN Sync failed with HTTP status ${a.status}`);
	}
	let o = await a.json();
	return o.payload && await Y(r, o.payload), o;
}
//#endregion
//#region electron/ipc/backup-lan.ts
function Oe(e) {
	if (!e || e.length === 0) return "";
	let t = Object.keys(e[0]);
	return [t.map((e) => `"${String(e).replace(/"/g, "\"\"")}"`).join(","), ...e.map((e) => t.map((t) => {
		let n = e[t];
		return n == null ? "\"\"" : n instanceof Date ? `"${n.toISOString()}"` : typeof n == "object" ? `"${JSON.stringify(n).replace(/"/g, "\"\"")}"` : `"${String(n).replace(/"/g, "\"\"")}"`;
	}).join(","))].join("\n");
}
function ke(e) {
	r.handle("export-entire-db-csv", async () => {
		try {
			let t = A(), r = e();
			if (!r) return {
				success: !1,
				error: "No active window available"
			};
			let { canceled: a, filePaths: o } = await n.showOpenDialog(r, {
				title: "Select Folder for CSV Database Export",
				properties: ["openDirectory", "createDirectory"]
			});
			if (a || !o || o.length === 0) return {
				success: !1,
				error: "Export cancelled"
			};
			let s = o[0], [l, u, d, f, p, m, h, g] = await Promise.all([
				t.subject.findMany({ orderBy: { id: "asc" } }),
				t.checkout.findMany({
					include: { subject: !0 },
					orderBy: { id: "asc" }
				}),
				t.incident.findMany({
					include: { subject: !0 },
					orderBy: { id: "asc" }
				}),
				t.borrowingRule.findMany({ orderBy: { id: "asc" } }),
				t.stockAudit.findMany({ orderBy: { id: "asc" } }),
				t.stockAuditItem.findMany({
					include: { subject: !0 },
					orderBy: { id: "asc" }
				}),
				t.auditLog.findMany({
					include: { subject: !0 },
					orderBy: { id: "asc" }
				}),
				t.school.findMany({ orderBy: { id: "asc" } })
			]), _ = u.map((e) => ({
				id: e.id,
				subjectId: e.subjectId,
				subjectName: e.subject?.name || "",
				studentName: e.studentName,
				studentClass: e.studentClass || "",
				checkoutDate: e.checkoutDate ? new Date(e.checkoutDate).toISOString() : "",
				dueDate: e.dueDate ? new Date(e.dueDate).toISOString() : "",
				returnDate: e.returnDate ? new Date(e.returnDate).toISOString() : "",
				status: e.status,
				conditionOut: e.conditionOut,
				conditionIn: e.conditionIn === null ? "" : e.conditionIn,
				createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : "",
				updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : ""
			})), v = d.map((e) => ({
				id: e.id,
				type: e.type,
				date: e.date ? new Date(e.date).toISOString() : "",
				subjectId: e.subjectId || "",
				subjectName: e.subject?.name || "",
				bookTitle: e.bookTitle,
				condition: e.condition || "",
				comment: e.comment || "",
				reportedBy: e.reportedBy || "",
				responsibleParty: e.responsibleParty || "",
				studentClass: e.studentClass || "",
				actionTaken: e.actionTaken || "",
				createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : ""
			})), y = m.map((e) => ({
				id: e.id,
				auditId: e.auditId,
				subjectId: e.subjectId,
				subjectName: e.subject?.name || "",
				expectedCount: e.expectedCount,
				actualCount: e.actualCount,
				discrepancy: e.discrepancy,
				notes: e.notes || ""
			})), b = h.map((e) => ({
				id: e.id,
				subjectId: e.subjectId,
				subjectName: e.subject?.name || "",
				field: e.field,
				oldValue: e.oldValue,
				newValue: e.newValue,
				changedBy: e.changedBy || "",
				changedAt: e.changedAt ? new Date(e.changedAt).toISOString() : ""
			})), x = [
				{
					filename: "quantlib_subjects.csv",
					data: l
				},
				{
					filename: "quantlib_checkouts.csv",
					data: _
				},
				{
					filename: "quantlib_incidents.csv",
					data: v
				},
				{
					filename: "quantlib_borrowing_rules.csv",
					data: f
				},
				{
					filename: "quantlib_stock_audits.csv",
					data: p
				},
				{
					filename: "quantlib_stock_audit_items.csv",
					data: y
				},
				{
					filename: "quantlib_audit_logs.csv",
					data: b
				},
				{
					filename: "quantlib_school_info.csv",
					data: g
				}
			], S = 0;
			for (let e of x) {
				let t = Oe(e.data), n = i.join(s, e.filename);
				c.writeFileSync(n, t, "utf-8"), S++;
			}
			return {
				success: !0,
				data: {
					targetDir: s,
					exportedCount: S,
					filenames: x.map((e) => e.filename)
				}
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("backup-database", async () => {
		try {
			A();
			let t = e();
			if (!t) return {
				success: !1,
				error: "No window available"
			};
			let { canceled: r, filePath: i } = await n.showSaveDialog(t, {
				title: "Backup Database",
				defaultPath: "quantlib_backup.db",
				filters: [{
					name: "SQLite Database",
					extensions: ["db"]
				}, {
					name: "All Files",
					extensions: ["*"]
				}]
			});
			if (r || !i) return {
				success: !1,
				error: "Backup cancelled"
			};
			let a = x();
			return c.copyFileSync(a, i), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-backup-config", async () => {
		try {
			return {
				success: !0,
				data: (await A().$queryRawUnsafe("SELECT autoBackupEnabled, autoBackupIntervalHours, autoBackupPath, lastAutoBackupAt FROM AppConfig WHERE id = 1"))[0] || {
					autoBackupEnabled: !1,
					autoBackupIntervalHours: 24,
					autoBackupPath: null,
					lastAutoBackupAt: null
				}
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("save-backup-config", async (e, t) => {
		try {
			let e = A(), { autoBackupEnabled: n, autoBackupPath: r, autoBackupIntervalHours: i } = t || {};
			return await e.$executeRawUnsafe("UPDATE AppConfig SET autoBackupEnabled = ?, autoBackupPath = ?, autoBackupIntervalHours = ?, updatedAt = ? WHERE id = 1", +!!n, typeof r == "string" ? r : null, typeof i == "number" ? i : 24, (/* @__PURE__ */ new Date()).toISOString()), n && Se(), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("trigger-auto-backup", async (e, t) => {
		try {
			let e = A(), n = await e.$queryRawUnsafe("SELECT autoBackupPath FROM AppConfig WHERE id = 1"), r = W(t || n[0]?.autoBackupPath || "");
			return r.success && await e.$executeRawUnsafe("UPDATE AppConfig SET lastAutoBackupAt = ? WHERE id = 1", (/* @__PURE__ */ new Date()).toISOString()), r;
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("list-backups", async () => {
		try {
			return {
				success: !0,
				data: await be((await A().$queryRawUnsafe("SELECT autoBackupPath FROM AppConfig WHERE id = 1"))[0]?.autoBackupPath || void 0)
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("restore-backup", async (e, n) => {
		try {
			if (A(), !n || typeof n != "string") throw Error("Invalid backup path");
			if (!c.existsSync(n)) throw Error("Selected backup file does not exist");
			let e = `${n}.meta`;
			if (!c.existsSync(e)) throw Error("Backup metadata file (.meta) is missing");
			let r = t.getPath("userData"), a = i.join(r, "quantlib.enc"), o = i.join(r, "quantlib.meta");
			return c.copyFileSync(n, a), c.copyFileSync(e, o), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-lan-sync-config", async () => {
		try {
			return {
				success: !0,
				data: (await A().$queryRawUnsafe("SELECT lanSyncEnabled, lanPort, lanPasscode, lastLanSyncAt FROM AppConfig WHERE id = 1"))[0] || {
					lanSyncEnabled: !1,
					lanPort: 8085,
					lanPasscode: "quantlib-sync",
					lastLanSyncAt: null
				}
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("save-lan-sync-config", async (e, t) => {
		try {
			let e = A(), { lanSyncEnabled: n, lanPort: r, lanPasscode: i } = t || {}, a = typeof r == "number" ? r : 8085, o = typeof i == "string" ? i : "quantlib-sync";
			return await e.$executeRawUnsafe("UPDATE AppConfig SET lanSyncEnabled = ?, lanPort = ?, lanPasscode = ?, updatedAt = ? WHERE id = 1", +!!n, a, o, (/* @__PURE__ */ new Date()).toISOString()), n ? Ee(a, o) : Q(), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("sync-with-lan-peer", async (e, { peerIp: t, peerPort: n, passcode: r }) => {
		try {
			return A(), {
				success: !0,
				data: await De(t, n, r)
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("get-lan-status", async () => {
		try {
			return A(), {
				success: !0,
				data: { localIp: Ce() }
			};
		} catch (e) {
			return {
				success: !1,
				error: j(e)
			};
		}
	}), r.handle("set-theme", (t, n) => {
		if (n !== "light" && n !== "dark") return {
			success: !1,
			error: "Invalid theme mode"
		};
		let r = e();
		if (r && typeof r.setTitleBarOverlay == "function") try {
			r.setTitleBarOverlay({
				color: n === "dark" ? "#0f172a" : "#ffffff",
				symbolColor: n === "dark" ? "#ffffff" : "#0f172a",
				height: 32
			});
		} catch {}
		return { success: !0 };
	});
}
//#endregion
//#region electron/main.ts
var Ae = i.dirname(a(import.meta.url));
process.env.DIST = i.join(Ae, "../dist"), process.env.VITE_PUBLIC = t.isPackaged ? process.env.DIST : i.join(process.env.DIST, "../public");
var $ = null;
t.requestSingleInstanceLock() ? t.on("second-instance", () => {
	$ && ($.isMinimized() && $.restore(), $.focus());
}) : (t.quit(), process.exit(0));
function je() {
	let t = process.env.VITE_PUBLIC || "", n = process.env.DIST || "";
	$ = new e({
		icon: i.join(t, "icon.png"),
		width: 1200,
		height: 800,
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#0f172a",
			symbolColor: "#ffffff",
			height: 32
		},
		webPreferences: {
			preload: i.join(Ae, "preload.mjs"),
			contextIsolation: !0,
			nodeIntegration: !1,
			sandbox: !0,
			webSecurity: !0
		}
	}), typeof $?.removeMenu == "function" && $.removeMenu(), typeof $?.webContents?.setWindowOpenHandler == "function" && $.webContents.setWindowOpenHandler(({ url: e }) => ((e.startsWith("https:") || e.startsWith("http:")) && import("electron").then(({ shell: t }) => t.openExternal(e)), { action: "deny" })), typeof $?.webContents?.on == "function" && $.webContents.on("will-navigate", (e, t) => {
		let n = new URL(t), r = n.protocol === "file:", i = process.env.VITE_DEV_SERVER_URL, a = i && n.origin === new URL(i).origin;
		!r && !a && e.preventDefault();
	});
	let r = process.env.VITE_DEV_SERVER_URL;
	r ? typeof $?.loadURL == "function" && $.loadURL(r) : typeof $?.loadFile == "function" && $.loadFile(i.join(n, "index.html")), typeof $?.on == "function" && $.on("closed", () => {
		K(), $ = null;
	});
}
de(), pe(), me(), he(), ve(), ke(() => $), t.on("window-all-closed", async () => {
	K(), Q(), await N(), process.platform !== "darwin" && (t.quit(), $ = null);
}), t.on("before-quit", (e) => {
	K(), Q(), e.preventDefault(), N().then(() => t.quit()).catch((e) => {
		console.error("Database cleanup failed:", e), t.quit();
	});
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && je();
}), t.whenReady().then(() => {
	import("electron").then(({ session: e }) => {
		e.defaultSession.webRequest.onHeadersReceived((e, t) => {
			let n = process.env.VITE_DEV_SERVER_URL ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'";
			t({ responseHeaders: {
				...e.responseHeaders,
				"Content-Security-Policy": [`default-src 'self'; ${n}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;`]
			} });
		});
	}), je();
});
//#endregion
export { _e as aggregateCirculationTrends, R as calculateClearance, V as calculateConditionDecay, ge as calculateReplacementCost, z as calculateStockAuditDiscrepancy, H as formatBackupTimestamp, Ce as getLocalIpAddress, L as getRuleForClass, ye as isBackupDue, be as listVaultBackups, xe as listVaultBackupsSync, Y as mergeLanSyncPayload, q as packageLanSyncPayload, W as performVaultBackup, Se as startAutoBackupScheduler, Ee as startLanSyncServer, K as stopAutoBackupScheduler, Q as stopLanSyncServer, De as syncWithLanPeer };
