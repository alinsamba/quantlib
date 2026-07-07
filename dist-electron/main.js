import { BrowserWindow as e, app as t, ipcMain as n } from "electron";
import r from "node:path";
import { fileURLToPath as i } from "node:url";
import { PrismaClient as a } from "@prisma/client";
import o from "node:crypto";
import s from "node:fs";
//#region electron/crypto.ts
var c = t.getPath("userData"), l = r.join(c, "quantlib.meta"), u = r.join(c, "quantlib.enc"), d = r.join(c, "quantlib.enc.bak"), f = r.join(c, "quantlib.enc.tmp"), p = r.join(c, "quantlib_temp.db"), m = r.join(process.cwd(), "quantlib.db"), h = null;
function g() {
	return p;
}
function _() {
	return s.existsSync(l) && s.existsSync(u) ? "LOCKED" : "SETUP";
}
function v(e, t) {
	return o.pbkdf2Sync(e, t, 1e5, 32, "sha256");
}
function y(e) {
	try {
		if (_() !== "SETUP") return {
			success: !1,
			error: "Database is already set up"
		};
		if (s.existsSync(l) || s.existsSync(u)) return {
			success: !1,
			error: "Existing database state found. Unlock or recover the database instead."
		};
		let t = o.randomBytes(16), n = o.randomBytes(32), r = o.randomBytes(8).toString("hex").match(/.{1,4}/g)?.join("-").toUpperCase() || "", i = v(e, t), a = v(r, t), c = o.randomBytes(12), d = o.createCipheriv("aes-256-gcm", i, c), f = Buffer.concat([d.update(n), d.final()]), g = d.getAuthTag(), y = o.randomBytes(12), b = o.createCipheriv("aes-256-gcm", a, y), x = Buffer.concat([b.update(n), b.final()]), C = b.getAuthTag(), w = {
			salt: t.toString("base64"),
			password_payload: Buffer.concat([
				c,
				g,
				f
			]).toString("base64"),
			recovery_payload: Buffer.concat([
				y,
				C,
				x
			]).toString("base64")
		};
		if (s.writeFileSync(l, JSON.stringify(w)), s.existsSync(m)) {
			s.copyFileSync(m, p);
			try {
				s.renameSync(m, m + ".bak");
			} catch {}
		} else s.writeFileSync(p, "");
		return h = n, S(), {
			success: !0,
			recoveryKey: r
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message
		};
	}
}
function b(e, t) {
	try {
		let n = Buffer.from(e, "base64"), r = n.subarray(0, 12), i = n.subarray(12, 28), a = n.subarray(28), s = o.createDecipheriv("aes-256-gcm", t, r);
		return s.setAuthTag(i), Buffer.concat([s.update(a), s.final()]);
	} catch {
		return null;
	}
}
function x(e, t = !1) {
	try {
		let n = s.readFileSync(l, "utf-8"), r = JSON.parse(n), i = v(e, Buffer.from(r.salt, "base64")), a = b(t ? r.recovery_payload : r.password_payload, i);
		if (!a) return {
			success: !1,
			error: "Invalid password or recovery key"
		};
		h = a;
		let c = s.readFileSync(u);
		if (c.length > 0) {
			let e = c.subarray(0, 12), t = c.subarray(12, 28), n = c.subarray(28), r = o.createDecipheriv("aes-256-gcm", h, e);
			r.setAuthTag(t);
			let i = Buffer.concat([r.update(n), r.final()]);
			s.writeFileSync(p, i);
		} else s.writeFileSync(p, "");
		return { success: !0 };
	} catch (e) {
		return {
			success: !1,
			error: e.message || "Unlock failed"
		};
	}
}
function S() {
	if (!(!h || !s.existsSync(p))) try {
		let e = s.readFileSync(p), t = o.randomBytes(12), n = o.createCipheriv("aes-256-gcm", h, t), r = Buffer.concat([n.update(e), n.final()]), i = n.getAuthTag();
		s.writeFileSync(f, Buffer.concat([
			t,
			i,
			r
		])), s.existsSync(u) && s.copyFileSync(u, d), s.renameSync(f, u);
	} catch (e) {
		console.error("Failed to encrypt database:", e);
		try {
			s.existsSync(f) && s.unlinkSync(f);
		} catch {}
	}
}
function C() {
	try {
		s.existsSync(p) && (S(), s.unlinkSync(p));
	} catch (e) {
		console.error("Cleanup failed:", e);
	}
}
function w(e, t) {
	try {
		let n = s.readFileSync(l, "utf-8"), r = JSON.parse(n), i = v(e, Buffer.from(r.salt, "base64")), a = b(r.password_payload, i);
		if (!a) return {
			success: !1,
			error: "Incorrect current password"
		};
		let c = o.randomBytes(16), u = o.randomBytes(8).toString("hex").match(/.{1,4}/g)?.join("-").toUpperCase() || "", d = v(t, c), f = v(u, c), p = o.randomBytes(12), m = o.createCipheriv("aes-256-gcm", d, p), h = Buffer.concat([m.update(a), m.final()]), g = m.getAuthTag(), _ = o.randomBytes(12), y = o.createCipheriv("aes-256-gcm", f, _), x = Buffer.concat([y.update(a), y.final()]), S = y.getAuthTag(), C = {
			salt: c.toString("base64"),
			password_payload: Buffer.concat([
				p,
				g,
				h
			]).toString("base64"),
			recovery_payload: Buffer.concat([
				_,
				S,
				x
			]).toString("base64")
		};
		return s.writeFileSync(l, JSON.stringify(C)), {
			success: !0,
			recoveryKey: u
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message || "Failed to change password"
		};
	}
}
//#endregion
//#region src/lib/utils.ts
function T(e) {
	return e.openingCount + e.recovered - e.issued - e.damaged - e.lost;
}
var E = {
	DAMAGED: "DAMAGED",
	LOST: "LOST",
	NEW: "NEW",
	RECOVERED: "RECOVERED",
	DONATION: "DONATION"
}, D = r.dirname(i(import.meta.url));
process.env.DIST = r.join(D, "../dist"), process.env.VITE_PUBLIC = t.isPackaged ? process.env.DIST : r.join(process.env.DIST, "../public");
var O, k = process.env.VITE_DEV_SERVER_URL;
t.requestSingleInstanceLock() ? t.on("second-instance", () => {
	O && (O.isMinimized() && O.restore(), O.focus());
}) : (t.quit(), process.exit(0));
function A() {
	O = new e({
		icon: r.join(process.env.VITE_PUBLIC, "icon.png"),
		width: 1200,
		height: 800,
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#0f172a",
			symbolColor: "#ffffff",
			height: 32
		},
		webPreferences: {
			preload: r.join(D, "preload.mjs"),
			contextIsolation: !0,
			nodeIntegration: !1,
			sandbox: !0,
			webSecurity: !0
		}
	}), O.removeMenu(), O.webContents.setWindowOpenHandler(({ url: e }) => ((e.startsWith("https:") || e.startsWith("http:")) && import("electron").then(({ shell: t }) => t.openExternal(e)), { action: "deny" })), O.webContents.on("will-navigate", (e, t) => {
		let n = new URL(t), r = n.protocol === "file:", i = k && n.origin === new URL(k).origin;
		!r && !i && e.preventDefault();
	}), O.webContents.on("did-finish-load", () => {
		O?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), k ? O.loadURL(k) : O.loadFile(r.join(process.env.DIST, "index.html"));
}
async function j() {
	N &&= (await N.$disconnect(), null);
}
async function M() {
	if (!P) {
		await j();
		try {
			C();
		} finally {
			P = !0;
		}
	}
}
t.on("window-all-closed", async () => {
	await M(), process.platform !== "darwin" && (t.quit(), O = null);
}), t.on("before-quit", (e) => {
	P || (e.preventDefault(), M().then(() => t.quit()).catch((e) => {
		console.error("Database cleanup failed:", e), t.quit();
	}));
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && A();
}), t.whenReady().then(() => {
	import("electron").then(({ session: e }) => {
		e.defaultSession.webRequest.onHeadersReceived((e, t) => {
			let n = k ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'";
			t({ responseHeaders: {
				...e.responseHeaders,
				"Content-Security-Policy": [`default-src 'self'; ${n}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;`]
			} });
		});
	}), A();
});
var N = null, P = !1;
async function F(e) {
	await e.$executeRawUnsafe("PRAGMA foreign_keys = ON"), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"School\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"name\" TEXT NOT NULL,\n      \"motto\" TEXT,\n      \"logoPath\" TEXT,\n      \"address\" TEXT,\n      \"contactName\" TEXT,\n      \"contactPhone\" TEXT,\n      \"academicYear\" TEXT,\n      \"updatedAt\" DATETIME NOT NULL,\n      \"checkoutDuration\" INTEGER NOT NULL DEFAULT 14\n    )\n  "), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"Subject\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"name\" TEXT NOT NULL,\n      \"category\" TEXT,\n      \"openingCount\" INTEGER NOT NULL DEFAULT 0,\n      \"recovered\" INTEGER NOT NULL DEFAULT 0,\n      \"issued\" INTEGER NOT NULL DEFAULT 0,\n      \"damaged\" INTEGER NOT NULL DEFAULT 0,\n      \"lost\" INTEGER NOT NULL DEFAULT 0,\n      \"notes\" TEXT,\n      \"averageCondition\" REAL NOT NULL DEFAULT 3.0,\n      \"degradationRate\" REAL NOT NULL DEFAULT 0.0,\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      \"updatedAt\" DATETIME NOT NULL\n    )\n  "), await e.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"Subject_name_key\" ON \"Subject\"(\"name\")"), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"Incident\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"type\" TEXT NOT NULL,\n      \"date\" DATETIME NOT NULL,\n      \"subjectId\" INTEGER,\n      \"bookTitle\" TEXT NOT NULL,\n      \"condition\" TEXT,\n      \"comment\" TEXT,\n      \"reportedBy\" TEXT,\n      \"responsibleParty\" TEXT,\n      \"studentClass\" TEXT,\n      \"actionTaken\" TEXT,\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      CONSTRAINT \"Incident_subjectId_fkey\" FOREIGN KEY (\"subjectId\") REFERENCES \"Subject\" (\"id\") ON DELETE SET NULL ON UPDATE CASCADE\n    )\n  "), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"AuditLog\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"subjectId\" INTEGER NOT NULL,\n      \"field\" TEXT NOT NULL,\n      \"oldValue\" TEXT NOT NULL,\n      \"newValue\" TEXT NOT NULL,\n      \"changedBy\" TEXT,\n      \"changedAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      CONSTRAINT \"AuditLog_subjectId_fkey\" FOREIGN KEY (\"subjectId\") REFERENCES \"Subject\" (\"id\") ON DELETE RESTRICT ON UPDATE CASCADE\n    )\n  "), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"User\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"name\" TEXT NOT NULL,\n      \"role\" TEXT NOT NULL DEFAULT 'LIBRARIAN',\n      \"pinHash\" TEXT,\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n    )\n  "), await e.$executeRawUnsafe("\n    CREATE TABLE IF NOT EXISTS \"Checkout\" (\n      \"id\" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,\n      \"subjectId\" INTEGER NOT NULL,\n      \"studentName\" TEXT NOT NULL,\n      \"studentClass\" TEXT,\n      \"checkoutDate\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      \"dueDate\" DATETIME NOT NULL,\n      \"returnDate\" DATETIME,\n      \"status\" TEXT NOT NULL DEFAULT 'ACTIVE',\n      \"conditionOut\" INTEGER NOT NULL,\n      \"conditionIn\" INTEGER,\n      \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n      \"updatedAt\" DATETIME NOT NULL,\n      CONSTRAINT \"Checkout_subjectId_fkey\" FOREIGN KEY (\"subjectId\") REFERENCES \"Subject\" (\"id\") ON DELETE RESTRICT ON UPDATE CASCADE\n    )\n  "), await e.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"Checkout_subjectId_idx\" ON \"Checkout\"(\"subjectId\")");
}
async function I() {
	await j(), process.env.DATABASE_URL = `file:${g()}`, N = new a(), await F(N), S();
}
function L() {
	if (!N) throw Error("Database is locked. Please authenticate first.");
}
n.handle("check-db-status", () => _()), n.handle("setup-db", async (e, t) => {
	let n = y(t);
	if (n.success) try {
		await I();
	} catch (e) {
		return await j(), {
			success: !1,
			error: e.message || "Failed to initialize database"
		};
	}
	return n;
}), n.handle("unlock-db", async (e, { password: t, isRecovery: n = !1 }) => {
	let r = x(t, n);
	if (r.success) try {
		await I();
	} catch (e) {
		return await j(), {
			success: !1,
			error: e.message || "Failed to initialize database"
		};
	}
	return r;
}), n.handle("change-password", (e, { oldPassword: t, newPassword: n }) => w(t, n)), n.handle("get-subjects", async () => {
	try {
		return L(), {
			success: !0,
			data: await N.subject.findMany()
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message
		};
	}
}), n.handle("get-incidents", async () => {
	try {
		return L(), {
			success: !0,
			data: await N.incident.findMany({
				include: { subject: !0 },
				orderBy: { date: "desc" }
			})
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message
		};
	}
}), n.handle("get-summary", async () => {
	try {
		L();
		let e = await N.subject.findMany(), t = 0, n = 0, r = 0, i = 0;
		e.forEach((e) => {
			t += e.openingCount + e.recovered, r += e.issued, i += e.damaged + e.lost, n += T(e);
		});
		let a = await N.checkout.count({ where: {
			status: "ACTIVE",
			dueDate: { lt: /* @__PURE__ */ new Date() }
		} });
		return {
			success: !0,
			data: {
				totalBooks: t,
				available: n,
				issued: r,
				damagedLost: i,
				subjects: e,
				overdueCount: a
			}
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message
		};
	}
}), n.handle("add-subject", async (e, t) => {
	try {
		if (L(), !t.name || typeof t.name != "string") throw Error("Invalid subject name");
		let e = await N.subject.create({ data: {
			name: t.name,
			category: typeof t.category == "string" ? t.category : "General",
			openingCount: typeof t.openingCount == "number" ? t.openingCount : 0
		} });
		return S(), {
			success: !0,
			data: e
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message
		};
	}
});
var R = Object.values(E);
n.handle("add-incident", async (e, t) => {
	try {
		if (L(), !t.bookTitle || typeof t.bookTitle != "string") throw Error("Invalid book title");
		if (!R.includes(t.type)) throw Error("Invalid incident type");
		if (t.subjectId && typeof t.subjectId != "number") throw Error("Invalid subject ID");
		let e = await N.$transaction(async (e) => {
			if (t.subjectId && !await e.subject.findUnique({ where: { id: t.subjectId } })) throw Error("Referenced subject does not exist");
			let n = await e.incident.create({ data: {
				type: t.type,
				date: t.date ? new Date(t.date) : /* @__PURE__ */ new Date(),
				subjectId: t.subjectId || null,
				bookTitle: t.bookTitle,
				condition: t.condition || null,
				comment: t.comment || null,
				reportedBy: t.reportedBy || null,
				responsibleParty: t.responsibleParty || null,
				studentClass: t.studentClass || null,
				actionTaken: t.actionTaken || null
			} });
			if (t.subjectId) {
				let n = {};
				t.type === E.DAMAGED && (n.damaged = { increment: 1 }), t.type === E.LOST && (n.lost = { increment: 1 }), t.type === E.RECOVERED && (n.recovered = { increment: 1 }), Object.keys(n).length > 0 && await e.subject.update({
					where: { id: t.subjectId },
					data: n
				});
			}
			return n;
		});
		return S(), {
			success: !0,
			data: e
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message
		};
	}
}), n.handle("set-theme", (e, t) => {
	O && O.setTitleBarOverlay({
		color: t === "dark" ? "#0f172a" : "#f8fafc",
		symbolColor: t === "dark" ? "#ffffff" : "#000000"
	});
}), n.handle("add-checkout", async (e, t) => {
	try {
		if (L(), !t.subjectId || typeof t.subjectId != "number") throw Error("Invalid subject ID");
		if (!t.studentName || typeof t.studentName != "string") throw Error("Invalid student name");
		let e = await N.$transaction(async (e) => {
			let n = await e.subject.findUnique({ where: { id: t.subjectId } });
			if (!n) throw Error("Referenced subject does not exist");
			if (T(n) <= 0) throw Error("No available books for this subject");
			let r = await e.checkout.create({ data: {
				subjectId: t.subjectId,
				studentName: t.studentName,
				studentClass: t.studentClass || null,
				dueDate: t.dueDate ? new Date(t.dueDate) : /* @__PURE__ */ new Date(),
				conditionOut: typeof t.conditionOut == "number" ? t.conditionOut : 3,
				status: "ACTIVE"
			} });
			return await e.subject.update({
				where: { id: t.subjectId },
				data: { issued: { increment: 1 } }
			}), r;
		});
		return S(), {
			success: !0,
			data: e
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message
		};
	}
}), n.handle("return-checkout", async (e, { id: t, conditionIn: n }) => {
	try {
		if (L(), typeof t != "number") throw Error("Invalid checkout ID");
		let e = await N.$transaction(async (e) => {
			let r = await e.checkout.update({
				where: { id: t },
				data: {
					status: "RETURNED",
					returnDate: /* @__PURE__ */ new Date(),
					conditionIn: typeof n == "number" ? n : null
				}
			}), i = await e.subject.findUnique({
				where: { id: r.subjectId },
				include: { checkouts: !0 }
			});
			if (i) {
				let { totalDegradation: t, count: a } = i.checkouts.reduce((e, t) => (t.status === "RETURNED" && t.conditionIn !== null && (e.totalDegradation += t.conditionOut - (t.conditionIn || t.conditionOut), e.count++), e), {
					totalDegradation: 0,
					count: 0
				}), o = a > 0 ? t / a : 0, s = i.openingCount + i.recovered - i.lost - i.damaged, c = r.conditionOut - (n || r.conditionOut), l = s > 0 ? c / s : c, u = Math.max(1, i.averageCondition - l);
				await e.subject.update({
					where: { id: i.id },
					data: {
						issued: { decrement: 1 },
						degradationRate: o,
						averageCondition: u
					}
				});
			}
			return r;
		});
		return S(), {
			success: !0,
			data: e
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message
		};
	}
}), n.handle("get-overdue-checkouts", async () => {
	try {
		return L(), {
			success: !0,
			data: await N.checkout.findMany({
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
			error: e.message
		};
	}
}), n.handle("update-subject", async (e, t) => {
	try {
		if (L(), !t.id || typeof t.id != "number") throw Error("Invalid subject ID");
		let e = await N.subject.update({
			where: { id: t.id },
			data: {
				name: typeof t.data?.name == "string" ? t.data.name : void 0,
				category: typeof t.data?.category == "string" ? t.data.category : void 0,
				openingCount: typeof t.data?.openingCount == "number" ? t.data.openingCount : void 0
			}
		});
		return S(), {
			success: !0,
			data: e
		};
	} catch (e) {
		return {
			success: !1,
			error: e.message
		};
	}
});
//#endregion
export {};
