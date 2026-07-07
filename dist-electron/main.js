import { BrowserWindow, app, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import fs from "node:fs";
//#region electron/crypto.ts
var DATA_DIR = app.getPath("userData");
var META_FILE = path.join(DATA_DIR, "quantlib.meta");
var ENC_FILE = path.join(DATA_DIR, "quantlib.enc");
var ENC_BACKUP_FILE = path.join(DATA_DIR, "quantlib.enc.bak");
var ENC_TEMP_FILE = path.join(DATA_DIR, "quantlib.enc.tmp");
var TEMP_DB = path.join(DATA_DIR, "quantlib_temp.db");
var LEGACY_DB = path.join(process.cwd(), "quantlib.db");
var currentMasterKey = null;
function getTempDbPath() {
	return TEMP_DB;
}
function checkDbStatus() {
	if (fs.existsSync(META_FILE) && fs.existsSync(ENC_FILE)) return "LOCKED";
	return "SETUP";
}
function deriveUserKey(password, salt, iterations = 6e5) {
	return crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
}
/**
* Generates a 12-byte initialization vector where the first byte is set to the provided domain identifier.
* This ensures distinct IV handling for different key streams, improving cryptographic hygiene.
*/
function generateDistinctIv(domain) {
	const iv = crypto.randomBytes(12);
	iv[0] = domain & 255;
	return iv;
}
function setupDatabase(password) {
	try {
		if (checkDbStatus() !== "SETUP") return {
			success: false,
			error: "Database is already set up"
		};
		if (fs.existsSync(META_FILE) || fs.existsSync(ENC_FILE)) return {
			success: false,
			error: "Existing database state found. Unlock or recover the database instead."
		};
		const salt = crypto.randomBytes(16);
		const masterKey = crypto.randomBytes(32);
		const recoveryKey = crypto.randomBytes(8).toString("hex").match(/.{1,4}/g)?.join("-").toUpperCase() || "";
		const userKey = deriveUserKey(password, salt);
		const recoveryUserKey = deriveUserKey(recoveryKey, salt);
		const iv1 = generateDistinctIv(0);
		const cipher1 = crypto.createCipheriv("aes-256-gcm", userKey, iv1);
		const passPayload = Buffer.concat([cipher1.update(masterKey), cipher1.final()]);
		const tag1 = cipher1.getAuthTag();
		const iv2 = generateDistinctIv(1);
		const cipher2 = crypto.createCipheriv("aes-256-gcm", recoveryUserKey, iv2);
		const recPayload = Buffer.concat([cipher2.update(masterKey), cipher2.final()]);
		const tag2 = cipher2.getAuthTag();
		const meta = {
			salt: salt.toString("base64"),
			iterations: 6e5,
			password_payload: Buffer.concat([
				iv1,
				tag1,
				passPayload
			]).toString("base64"),
			recovery_payload: Buffer.concat([
				iv2,
				tag2,
				recPayload
			]).toString("base64")
		};
		fs.writeFileSync(META_FILE, JSON.stringify(meta));
		if (fs.existsSync(LEGACY_DB)) {
			fs.copyFileSync(LEGACY_DB, TEMP_DB);
			try {
				fs.renameSync(LEGACY_DB, LEGACY_DB + ".bak");
			} catch {}
		} else fs.writeFileSync(TEMP_DB, "");
		currentMasterKey = masterKey;
		encryptTempDatabase();
		return {
			success: true,
			recoveryKey
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
function decryptPayload(payloadBase64, key) {
	try {
		const buf = Buffer.from(payloadBase64, "base64");
		const iv = buf.subarray(0, 12);
		const tag = buf.subarray(12, 28);
		const encrypted = buf.subarray(28);
		const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(encrypted), decipher.final()]);
	} catch {
		return null;
	}
}
function unlockDatabase(password, isRecovery = false) {
	try {
		const metaStr = fs.readFileSync(META_FILE, "utf-8");
		const meta = JSON.parse(metaStr);
		const userKey = deriveUserKey(password, Buffer.from(meta.salt, "base64"), meta.iterations || 1e5);
		const masterKey = decryptPayload(isRecovery ? meta.recovery_payload : meta.password_payload, userKey);
		if (!masterKey) return {
			success: false,
			error: "Invalid password or recovery key"
		};
		currentMasterKey = masterKey;
		const encData = fs.readFileSync(ENC_FILE);
		if (encData.length > 0) {
			const iv = encData.subarray(0, 12);
			const tag = encData.subarray(12, 28);
			const encrypted = encData.subarray(28);
			const decipher = crypto.createDecipheriv("aes-256-gcm", currentMasterKey, iv);
			decipher.setAuthTag(tag);
			const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
			fs.writeFileSync(TEMP_DB, decrypted);
		} else fs.writeFileSync(TEMP_DB, "");
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : "Unlock failed"
		};
	}
}
function encryptTempDatabase() {
	if (!currentMasterKey || !fs.existsSync(TEMP_DB)) return;
	try {
		const dbData = fs.readFileSync(TEMP_DB);
		const iv = generateDistinctIv(2);
		const cipher = crypto.createCipheriv("aes-256-gcm", currentMasterKey, iv);
		const encrypted = Buffer.concat([cipher.update(dbData), cipher.final()]);
		const tag = cipher.getAuthTag();
		fs.writeFileSync(ENC_TEMP_FILE, Buffer.concat([
			iv,
			tag,
			encrypted
		]));
		if (fs.existsSync(ENC_FILE)) fs.copyFileSync(ENC_FILE, ENC_BACKUP_FILE);
		fs.renameSync(ENC_TEMP_FILE, ENC_FILE);
	} catch (err) {
		console.error("Failed to encrypt database:", err);
		try {
			if (fs.existsSync(ENC_TEMP_FILE)) fs.unlinkSync(ENC_TEMP_FILE);
		} catch {}
	}
}
function secureWipe(filePath) {
	if (!fs.existsSync(filePath)) return;
	let fd = null;
	try {
		const stats = fs.statSync(filePath);
		fd = fs.openSync(filePath, "r+");
		const bufferSize = 4096;
		const zeroBuffer = Buffer.alloc(bufferSize, 0);
		let bytesWrittenTotal = 0;
		while (bytesWrittenTotal < stats.size) {
			const bytesToWrite = Math.min(bufferSize, stats.size - bytesWrittenTotal);
			const written = fs.writeSync(fd, zeroBuffer, 0, bytesToWrite, bytesWrittenTotal);
			bytesWrittenTotal += written;
		}
		fs.fsyncSync(fd);
	} catch (err) {
		console.error(`Failed to securely wipe ${filePath}:`, err);
	} finally {
		if (fd !== null) try {
			fs.closeSync(fd);
		} catch (err) {}
		try {
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
		} catch (err) {
			console.error(`Failed to delete ${filePath}:`, err);
		}
	}
}
function cleanupTempDatabase() {
	try {
		if (fs.existsSync(TEMP_DB)) {
			encryptTempDatabase();
			secureWipe(TEMP_DB);
		}
	} catch (e) {
		console.error("Cleanup failed:", e);
	}
}
function changePassword(oldPassword, newPassword) {
	try {
		const metaStr = fs.readFileSync(META_FILE, "utf-8");
		const meta = JSON.parse(metaStr);
		const oldUserKey = deriveUserKey(oldPassword, Buffer.from(meta.salt, "base64"), meta.iterations || 1e5);
		const masterKey = decryptPayload(meta.password_payload, oldUserKey);
		if (!masterKey) return {
			success: false,
			error: "Incorrect current password"
		};
		const newSalt = crypto.randomBytes(16);
		const recoveryKey = crypto.randomBytes(8).toString("hex").match(/.{1,4}/g)?.join("-").toUpperCase() || "";
		const newUserKey = deriveUserKey(newPassword, newSalt);
		const newRecoveryUserKey = deriveUserKey(recoveryKey, newSalt);
		const iv1 = generateDistinctIv(0);
		const cipher1 = crypto.createCipheriv("aes-256-gcm", newUserKey, iv1);
		const passPayload = Buffer.concat([cipher1.update(masterKey), cipher1.final()]);
		const tag1 = cipher1.getAuthTag();
		const iv2 = generateDistinctIv(1);
		const cipher2 = crypto.createCipheriv("aes-256-gcm", newRecoveryUserKey, iv2);
		const recPayload = Buffer.concat([cipher2.update(masterKey), cipher2.final()]);
		const tag2 = cipher2.getAuthTag();
		const newMeta = {
			salt: newSalt.toString("base64"),
			iterations: 6e5,
			password_payload: Buffer.concat([
				iv1,
				tag1,
				passPayload
			]).toString("base64"),
			recovery_payload: Buffer.concat([
				iv2,
				tag2,
				recPayload
			]).toString("base64")
		};
		fs.writeFileSync(META_FILE, JSON.stringify(newMeta));
		return {
			success: true,
			recoveryKey
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : "Failed to change password"
		};
	}
}
//#endregion
//#region src/lib/utils.ts
function calculateAvailable(subject) {
	return subject.openingCount + subject.recovered - subject.issued - subject.damaged - subject.lost;
}
var IncidentType = {
	DAMAGED: "DAMAGED",
	LOST: "LOST",
	NEW: "NEW",
	RECOVERED: "RECOVERED",
	DONATION: "DONATION"
};
//#endregion
//#region electron/main.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
var win;
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
if (!app.requestSingleInstanceLock()) {
	app.quit();
	process.exit(0);
} else app.on("second-instance", () => {
	if (win) {
		if (win.isMinimized()) win.restore();
		win.focus();
	}
});
function createWindow() {
	win = new BrowserWindow({
		icon: path.join(process.env.VITE_PUBLIC, "icon.png"),
		width: 1200,
		height: 800,
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#0f172a",
			symbolColor: "#ffffff",
			height: 32
		},
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true
		}
	});
	win.removeMenu();
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("https:") || url.startsWith("http:")) import("electron").then(({ shell }) => shell.openExternal(url));
		return { action: "deny" };
	});
	win.webContents.on("will-navigate", (event, url) => {
		const parsedUrl = new URL(url);
		const isLocalFile = parsedUrl.protocol === "file:";
		const isDevServer = VITE_DEV_SERVER_URL && parsedUrl.origin === new URL(VITE_DEV_SERVER_URL).origin;
		if (!isLocalFile && !isDevServer) event.preventDefault();
	});
	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	});
	if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
	else win.loadFile(path.join(process.env.DIST, "index.html"));
}
async function disconnectPrisma() {
	if (!prisma) return;
	await prisma.$disconnect();
	prisma = null;
}
async function disconnectAndCleanupDatabase() {
	if (databaseCleanupDone) return;
	await disconnectPrisma();
	try {
		cleanupTempDatabase();
	} finally {
		databaseCleanupDone = true;
	}
}
app.on("window-all-closed", async () => {
	await disconnectAndCleanupDatabase();
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});
app.on("before-quit", (event) => {
	if (databaseCleanupDone) return;
	event.preventDefault();
	disconnectAndCleanupDatabase().then(() => app.quit()).catch((err) => {
		console.error("Database cleanup failed:", err);
		app.quit();
	});
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(() => {
	import("electron").then(({ session }) => {
		session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
			const scriptSrc = VITE_DEV_SERVER_URL ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'";
			callback({ responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [`default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;`]
			} });
		});
	});
	createWindow();
});
var prisma = null;
var databaseCleanupDone = false;
async function initializeDatabase(client) {
	await client.$executeRawUnsafe("PRAGMA foreign_keys = ON");
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "School" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "motto" TEXT,
      "logoPath" TEXT,
      "address" TEXT,
      "contactName" TEXT,
      "contactPhone" TEXT,
      "academicYear" TEXT,
      "updatedAt" DATETIME NOT NULL,
      "checkoutDuration" INTEGER NOT NULL DEFAULT 14
    )
  `);
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Subject" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "category" TEXT,
      "openingCount" INTEGER NOT NULL DEFAULT 0,
      "recovered" INTEGER NOT NULL DEFAULT 0,
      "issued" INTEGER NOT NULL DEFAULT 0,
      "damaged" INTEGER NOT NULL DEFAULT 0,
      "lost" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT,
      "averageCondition" REAL NOT NULL DEFAULT 3.0,
      "degradationRate" REAL NOT NULL DEFAULT 0.0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
	await client.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"Subject_name_key\" ON \"Subject\"(\"name\")");
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Incident" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "type" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "subjectId" INTEGER,
      "bookTitle" TEXT NOT NULL,
      "condition" TEXT,
      "comment" TEXT,
      "reportedBy" TEXT,
      "responsibleParty" TEXT,
      "studentClass" TEXT,
      "actionTaken" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Incident_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "subjectId" INTEGER NOT NULL,
      "field" TEXT NOT NULL,
      "oldValue" TEXT NOT NULL,
      "newValue" TEXT NOT NULL,
      "changedBy" TEXT,
      "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuditLog_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'LIBRARIAN',
      "pinHash" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Checkout" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "subjectId" INTEGER NOT NULL,
      "studentName" TEXT NOT NULL,
      "studentClass" TEXT,
      "checkoutDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "dueDate" DATETIME NOT NULL,
      "returnDate" DATETIME,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "conditionOut" INTEGER NOT NULL,
      "conditionIn" INTEGER,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Checkout_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
	await client.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"Checkout_subjectId_idx\" ON \"Checkout\"(\"subjectId\")");
}
async function openPrismaDatabase() {
	await disconnectPrisma();
	process.env.DATABASE_URL = `file:${getTempDbPath()}`;
	prisma = new PrismaClient();
	await initializeDatabase(prisma);
	encryptTempDatabase();
}
function ensureDb() {
	if (!prisma) throw new Error("Database is locked. Please authenticate first.");
}
ipcMain.handle("check-db-status", () => {
	return checkDbStatus();
});
ipcMain.handle("setup-db", async (_, password) => {
	const result = setupDatabase(password);
	if (result.success) try {
		await openPrismaDatabase();
	} catch (err) {
		await disconnectPrisma();
		return {
			success: false,
			error: err instanceof Error ? err.message : "Failed to initialize database"
		};
	}
	return result;
});
ipcMain.handle("unlock-db", async (_, { password, isRecovery = false }) => {
	const result = unlockDatabase(password, isRecovery);
	if (result.success) try {
		await openPrismaDatabase();
	} catch (err) {
		await disconnectPrisma();
		return {
			success: false,
			error: err instanceof Error ? err.message : "Failed to initialize database"
		};
	}
	return result;
});
ipcMain.handle("change-password", (_, { oldPassword, newPassword }) => {
	return changePassword(oldPassword, newPassword);
});
ipcMain.handle("get-subjects", async () => {
	try {
		ensureDb();
		return {
			success: true,
			data: await prisma.subject.findMany()
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
ipcMain.handle("get-incidents", async () => {
	try {
		ensureDb();
		return {
			success: true,
			data: await prisma.incident.findMany({
				include: { subject: true },
				orderBy: { date: "desc" }
			})
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
ipcMain.handle("get-summary", async () => {
	try {
		ensureDb();
		const [subjects, overdueCount] = await Promise.all([prisma.subject.findMany(), prisma.checkout.count({ where: {
			status: "ACTIVE",
			dueDate: { lt: /* @__PURE__ */ new Date() }
		} })]);
		const { totalBooks, available, issued, damagedLost } = subjects.reduce((acc, s) => {
			acc.totalBooks += s.openingCount + s.recovered;
			acc.issued += s.issued;
			acc.damagedLost += s.damaged + s.lost;
			acc.available += calculateAvailable(s);
			return acc;
		}, {
			totalBooks: 0,
			available: 0,
			issued: 0,
			damagedLost: 0
		});
		return {
			success: true,
			data: {
				totalBooks,
				available,
				issued,
				damagedLost,
				subjects,
				overdueCount
			}
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
ipcMain.handle("add-subject", async (_, data) => {
	try {
		ensureDb();
		if (!data.name || typeof data.name !== "string") throw new Error("Invalid subject name");
		const res = await prisma.subject.create({ data: {
			name: data.name,
			category: typeof data.category === "string" ? data.category : "General",
			openingCount: typeof data.openingCount === "number" ? data.openingCount : 0
		} });
		encryptTempDatabase();
		return {
			success: true,
			data: res
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var ALLOWED_INCIDENT_TYPES = Object.values(IncidentType);
ipcMain.handle("add-incident", async (_, data) => {
	try {
		ensureDb();
		if (!data.bookTitle || typeof data.bookTitle !== "string") throw new Error("Invalid book title");
		if (!ALLOWED_INCIDENT_TYPES.includes(data.type)) throw new Error("Invalid incident type");
		if (data.subjectId && typeof data.subjectId !== "number") throw new Error("Invalid subject ID");
		const res = await prisma.$transaction(async (tx) => {
			if (data.subjectId) {
				if (!await tx.subject.findUnique({ where: { id: data.subjectId } })) throw new Error("Referenced subject does not exist");
			}
			const incident = await tx.incident.create({ data: {
				type: data.type,
				date: data.date ? new Date(data.date) : /* @__PURE__ */ new Date(),
				subjectId: data.subjectId || null,
				bookTitle: data.bookTitle,
				condition: data.condition || null,
				comment: data.comment || null,
				reportedBy: data.reportedBy || null,
				responsibleParty: data.responsibleParty || null,
				studentClass: data.studentClass || null,
				actionTaken: data.actionTaken || null
			} });
			if (data.subjectId) {
				const updateData = {};
				if (data.type === IncidentType.DAMAGED) updateData.damaged = { increment: 1 };
				if (data.type === IncidentType.LOST) updateData.lost = { increment: 1 };
				if (data.type === IncidentType.RECOVERED) updateData.recovered = { increment: 1 };
				if (Object.keys(updateData).length > 0) await tx.subject.update({
					where: { id: data.subjectId },
					data: updateData
				});
			}
			return incident;
		});
		encryptTempDatabase();
		return {
			success: true,
			data: res
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
ipcMain.handle("set-theme", (_, mode) => {
	if (win) win.setTitleBarOverlay({
		color: mode === "dark" ? "#0f172a" : "#f8fafc",
		symbolColor: mode === "dark" ? "#ffffff" : "#000000"
	});
});
ipcMain.handle("add-checkout", async (_, data) => {
	try {
		ensureDb();
		if (!data.subjectId || typeof data.subjectId !== "number") throw new Error("Invalid subject ID");
		if (!data.studentName || typeof data.studentName !== "string") throw new Error("Invalid student name");
		const res = await prisma.$transaction(async (tx) => {
			const subject = await tx.subject.findUnique({ where: { id: data.subjectId } });
			if (!subject) throw new Error("Referenced subject does not exist");
			if (calculateAvailable(subject) <= 0) throw new Error("No available books for this subject");
			const checkout = await tx.checkout.create({ data: {
				subjectId: data.subjectId,
				studentName: data.studentName,
				studentClass: data.studentClass || null,
				dueDate: data.dueDate ? new Date(data.dueDate) : /* @__PURE__ */ new Date(),
				conditionOut: typeof data.conditionOut === "number" ? data.conditionOut : 3,
				status: "ACTIVE"
			} });
			await tx.subject.update({
				where: { id: data.subjectId },
				data: { issued: { increment: 1 } }
			});
			return checkout;
		});
		encryptTempDatabase();
		return {
			success: true,
			data: res
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
ipcMain.handle("return-checkout", async (_, { id, conditionIn }) => {
	try {
		ensureDb();
		if (typeof id !== "number") throw new Error("Invalid checkout ID");
		const res = await prisma.$transaction(async (tx) => {
			const checkout = await tx.checkout.update({
				where: { id },
				data: {
					status: "RETURNED",
					returnDate: /* @__PURE__ */ new Date(),
					conditionIn: typeof conditionIn === "number" ? conditionIn : null
				}
			});
			const subject = await tx.subject.findUnique({
				where: { id: checkout.subjectId },
				include: { checkouts: true }
			});
			if (subject) {
				const { totalDegradation, count } = subject.checkouts.reduce((acc, c) => {
					if (c.status === "RETURNED" && c.conditionIn !== null) {
						acc.totalDegradation += c.conditionOut - (c.conditionIn || c.conditionOut);
						acc.count++;
					}
					return acc;
				}, {
					totalDegradation: 0,
					count: 0
				});
				const newDegradationRate = count > 0 ? totalDegradation / count : 0;
				const totalBooks = subject.openingCount + subject.recovered - subject.lost - subject.damaged;
				const conditionLoss = checkout.conditionOut - (conditionIn || checkout.conditionOut);
				const conditionShift = totalBooks > 0 ? conditionLoss / totalBooks : conditionLoss;
				const newAverageCondition = Math.max(1, subject.averageCondition - conditionShift);
				await tx.subject.update({
					where: { id: subject.id },
					data: {
						issued: { decrement: 1 },
						degradationRate: newDegradationRate,
						averageCondition: newAverageCondition
					}
				});
			}
			return checkout;
		});
		encryptTempDatabase();
		return {
			success: true,
			data: res
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
ipcMain.handle("get-overdue-checkouts", async () => {
	try {
		ensureDb();
		return {
			success: true,
			data: await prisma.checkout.findMany({
				where: {
					status: "ACTIVE",
					dueDate: { lt: /* @__PURE__ */ new Date() }
				},
				include: { subject: true },
				orderBy: { dueDate: "asc" }
			})
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
ipcMain.handle("update-subject", async (_, data) => {
	try {
		ensureDb();
		if (!data.id || typeof data.id !== "number") throw new Error("Invalid subject ID");
		const res = await prisma.subject.update({
			where: { id: data.id },
			data: {
				name: typeof data.data?.name === "string" ? data.data.name : void 0,
				category: typeof data.data?.category === "string" ? data.data.category : void 0,
				openingCount: typeof data.data?.openingCount === "number" ? data.data.openingCount : void 0
			}
		});
		encryptTempDatabase();
		return {
			success: true,
			data: res
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
//#endregion
export {};
