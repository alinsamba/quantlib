import { BrowserWindow, app, dialog, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
//#region electron/crypto.ts
var DATA_DIR = app.getPath("userData");
var META_FILE = path.join(DATA_DIR, "quantlib.meta");
var ENC_FILE = path.join(DATA_DIR, "quantlib.enc");
var ENC_BACKUP_FILE = path.join(DATA_DIR, "quantlib.enc.bak");
var ENC_TEMP_FILE = path.join(DATA_DIR, "quantlib.enc.tmp");
var TEMP_DB = path.join(DATA_DIR, "quantlib_temp.db");
var LEGACY_DB = path.join(process.cwd(), "quantlib.db");
var currentMasterKey = null;
var activePrismaClient = null;
function runWalCheckpoint(prisma) {
	const client = prisma || activePrismaClient;
	if (client && typeof client.$executeRawUnsafe === "function") try {
		client.$executeRawUnsafe("PRAGMA wal_checkpoint(FULL)").catch(() => {});
	} catch {}
}
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
* Generates a 12-byte (96-bit) initialization vector where the first byte is set to the provided domain identifier.
* This ensures distinct IV handling for different key streams, improving cryptographic hygiene.
*/
function generateDistinctIv(_domain) {
	return crypto.randomBytes(12);
}
function setupDatabase(password) {
	let userKey = null;
	let recoveryUserKey = null;
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
		const recoveryKey = crypto.randomBytes(16).toString("hex").match(/.{1,4}/g)?.join("-").toUpperCase() || "";
		userKey = deriveUserKey(password, salt);
		recoveryUserKey = deriveUserKey(recoveryKey, salt);
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
				secureWipe(LEGACY_DB);
			} catch {}
			try {
				secureWipe(LEGACY_DB + ".bak");
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
	} finally {
		if (userKey) userKey.fill(0);
		if (recoveryUserKey) recoveryUserKey.fill(0);
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
	let userKey = null;
	let newUserKey = null;
	try {
		const metaStr = fs.readFileSync(META_FILE, "utf-8");
		const meta = JSON.parse(metaStr);
		const salt = Buffer.from(meta.salt, "base64");
		const iterations = meta.iterations || 1e5;
		userKey = deriveUserKey(password, salt, iterations);
		const masterKey = decryptPayload(isRecovery ? meta.recovery_payload : meta.password_payload, userKey);
		if (!masterKey) return {
			success: false,
			error: "Invalid password or recovery key"
		};
		if (iterations < 6e5 && !isRecovery) {
			newUserKey = deriveUserKey(password, salt, 6e5);
			const iv1 = generateDistinctIv(0);
			const cipher1 = crypto.createCipheriv("aes-256-gcm", newUserKey, iv1);
			const passPayload = Buffer.concat([cipher1.update(masterKey), cipher1.final()]);
			const tag1 = cipher1.getAuthTag();
			meta.iterations = 6e5;
			meta.password_payload = Buffer.concat([
				iv1,
				tag1,
				passPayload
			]).toString("base64");
			fs.writeFileSync(META_FILE, JSON.stringify(meta));
		}
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
	} finally {
		if (userKey) userKey.fill(0);
		if (newUserKey) newUserKey.fill(0);
	}
}
async function encryptTempDatabase(prisma) {
	if (!currentMasterKey || !fs.existsSync(TEMP_DB)) return;
	try {
		runWalCheckpoint(prisma);
		const dbData = await fs.promises.readFile(TEMP_DB);
		const iv = generateDistinctIv(2);
		const cipher = crypto.createCipheriv("aes-256-gcm", currentMasterKey, iv);
		const encrypted = Buffer.concat([cipher.update(dbData), cipher.final()]);
		const tag = cipher.getAuthTag();
		await fs.promises.writeFile(ENC_TEMP_FILE, Buffer.concat([
			iv,
			tag,
			encrypted
		]));
		if (fs.existsSync(ENC_FILE)) await fs.promises.copyFile(ENC_FILE, ENC_BACKUP_FILE);
		await fs.promises.rename(ENC_TEMP_FILE, ENC_FILE);
	} catch (err) {
		console.error("Failed to encrypt database:", err);
		try {
			if (fs.existsSync(ENC_TEMP_FILE)) await fs.promises.unlink(ENC_TEMP_FILE);
		} catch {}
	}
}
function encryptTempDatabaseSync(prisma) {
	if (!currentMasterKey || !fs.existsSync(TEMP_DB)) return;
	try {
		runWalCheckpoint(prisma);
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
		console.error("Failed to encrypt database sync:", err);
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
		} catch (err) {
			console.error(`Failed to close ${filePath}:`, err);
		}
		try {
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
		} catch (err) {
			console.error(`Failed to delete ${filePath}:`, err);
		}
	}
}
function cleanupTempDatabase(prisma) {
	try {
		if (fs.existsSync(TEMP_DB)) {
			runWalCheckpoint(prisma);
			encryptTempDatabaseSync(prisma);
			secureWipe(TEMP_DB);
			secureWipe(`${TEMP_DB}-wal`);
			secureWipe(`${TEMP_DB}-shm`);
		}
	} catch (e) {
		console.error("Cleanup failed:", e);
	} finally {
		if (currentMasterKey) {
			currentMasterKey.fill(0);
			currentMasterKey = null;
		}
	}
}
function changePassword(oldPassword, newPassword) {
	let oldUserKey = null;
	let newUserKey = null;
	let newRecoveryUserKey = null;
	try {
		const metaStr = fs.readFileSync(META_FILE, "utf-8");
		const meta = JSON.parse(metaStr);
		oldUserKey = deriveUserKey(oldPassword, Buffer.from(meta.salt, "base64"), meta.iterations || 1e5);
		const masterKey = decryptPayload(meta.password_payload, oldUserKey);
		if (!masterKey) return {
			success: false,
			error: "Incorrect current password"
		};
		const newSalt = crypto.randomBytes(16);
		const recoveryKey = crypto.randomBytes(16).toString("hex").match(/.{1,4}/g)?.join("-").toUpperCase() || "";
		newUserKey = deriveUserKey(newPassword, newSalt);
		newRecoveryUserKey = deriveUserKey(recoveryKey, newSalt);
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
	} finally {
		if (oldUserKey) oldUserKey.fill(0);
		if (newUserKey) newUserKey.fill(0);
		if (newRecoveryUserKey) newRecoveryUserKey.fill(0);
	}
}
//#endregion
//#region electron/database.ts
var prisma = null;
var databaseCleanupDone = false;
var activeOperationsCount = 0;
var isShuttingDown = false;
function getPrisma() {
	return prisma;
}
function ensureDb() {
	if (isShuttingDown) throw new Error("Application is shutting down.");
	if (!prisma) throw new Error("Database is locked. Please authenticate first.");
	return prisma;
}
function sanitizeError(err) {
	if (err instanceof Error) return err.message;
	return String(err);
}
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
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BorrowingRule" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "roleOrGrade" TEXT NOT NULL,
      "maxBooksAllowed" INTEGER NOT NULL DEFAULT 2,
      "borrowDurationDays" INTEGER NOT NULL DEFAULT 14,
      "finePerDay" REAL NOT NULL DEFAULT 0.0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
	await client.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"BorrowingRule_roleOrGrade_key\" ON \"BorrowingRule\"(\"roleOrGrade\")");
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StockAudit" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "auditDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "auditedBy" TEXT,
      "notes" TEXT,
      "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StockAuditItem" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "auditId" INTEGER NOT NULL,
      "subjectId" INTEGER NOT NULL,
      "expectedCount" INTEGER NOT NULL,
      "actualCount" INTEGER NOT NULL,
      "discrepancy" INTEGER NOT NULL,
      "notes" TEXT,
      CONSTRAINT "StockAuditItem_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "StockAudit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "StockAuditItem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
	await client.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS \"StockAuditItem_auditId_subjectId_key\" ON \"StockAuditItem\"(\"auditId\", \"subjectId\")");
	await client.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"StockAuditItem_auditId_idx\" ON \"StockAuditItem\"(\"auditId\")");
	await client.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS \"StockAuditItem_subjectId_idx\" ON \"StockAuditItem\"(\"subjectId\")");
	await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppConfig" (
      "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
      "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT 0,
      "autoBackupPath" TEXT,
      "autoBackupIntervalHours" INTEGER NOT NULL DEFAULT 24,
      "lastAutoBackupAt" DATETIME,
      "lanSyncEnabled" BOOLEAN NOT NULL DEFAULT 0,
      "lanPort" INTEGER NOT NULL DEFAULT 8085,
      "lanPasscode" TEXT DEFAULT 'quantlib-sync',
      "lastLanSyncAt" DATETIME,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
	const configCountRes = await client.$queryRawUnsafe("SELECT COUNT(*) as count FROM \"AppConfig\"");
	if (Number(configCountRes[0]?.count || 0) === 0) {
		const now = (/* @__PURE__ */ new Date()).toISOString();
		await client.$executeRawUnsafe(`INSERT INTO "AppConfig" ("id", "autoBackupEnabled", "autoBackupIntervalHours", "lanSyncEnabled", "lanPort", "lanPasscode", "updatedAt") VALUES (1, 0, 24, 0, 8085, 'quantlib-sync', ?)`, now);
	}
	const ruleCountRes = await client.$queryRawUnsafe("SELECT COUNT(*) as count FROM \"BorrowingRule\"");
	if (Number(ruleCountRes[0]?.count || 0) === 0) {
		const defaultRules = [
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
		];
		const now = (/* @__PURE__ */ new Date()).toISOString();
		for (const rule of defaultRules) await client.$executeRawUnsafe(`INSERT INTO "BorrowingRule" ("roleOrGrade", "maxBooksAllowed", "borrowDurationDays", "finePerDay", "updatedAt") VALUES (?, ?, ?, ?, ?)`, rule.roleOrGrade, rule.maxBooksAllowed, rule.borrowDurationDays, rule.finePerDay, now);
	}
}
async function openPrismaDatabase() {
	prisma = new PrismaClient({ datasources: { db: { url: `file:${getTempDbPath()}?connection_limit=1` } } });
	await initializeDatabase(prisma);
	return prisma;
}
async function disconnectPrisma() {
	if (!prisma) return;
	await prisma.$disconnect();
	prisma = null;
}
async function disconnectAndCleanupDatabase() {
	if (databaseCleanupDone) return;
	isShuttingDown = true;
	const startTime = Date.now();
	while (activeOperationsCount > 0 && Date.now() - startTime < 5e3) await new Promise((resolve) => setTimeout(resolve, 50));
	await disconnectPrisma();
	try {
		await cleanupTempDatabase();
	} finally {
		databaseCleanupDone = true;
	}
}
//#endregion
//#region src/lib/utils.ts
/**
* Calculates current available book copies in stock ready for circulation.
*
* Invariant: Available stock represents physical copies currently on shelves.
* Formula: Available = max(0, Opening Stock + Recovered - Issued - Damaged - Lost)
* Clamped to 0 to prevent negative inventory rendering anomalies.
*
* @param subject - Stock count metrics for a given subject catalog entry
* @param subject.openingCount - Baseline physical count at start of academic period (copies)
* @param subject.recovered - Damaged or lost books returned to circulating pool (copies)
* @param subject.issued - Active loans currently borrowed by students (copies)
* @param subject.damaged - Non-circulating damaged copies awaiting repair/write-off (copies)
* @param subject.lost - Unrecovered lost copies written off from stock (copies)
* @returns Net count of available physical copies ready for checkout (integer >= 0)
*/
function calculateAvailable(subject) {
	const net = subject.openingCount + subject.recovered - subject.issued - subject.damaged - subject.lost;
	return Math.max(0, net);
}
/**
* Validates master password strength against enterprise vault security standards.
*
* Requirements:
* - Minimum 12 characters
* - At least one lowercase letter [a-z]
* - At least one uppercase letter [A-Z]
* - At least one numerical digit [0-9]
* - At least one special symbol [!@#$%^&*()_+-=[]{};':"\\|,.<>/?]
*
* @param password - Candidate master vault password string
* @returns Error message string if invalid, or empty string if valid
*/
function validateMasterPassword(password) {
	if (password.length < 12) return "Password must be at least 12 characters long";
	if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter";
	if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter";
	if (!/\d/.test(password)) return "Password must include at least one number";
	if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return "Password must include at least one special character";
	return "";
}
var IncidentType = {
	DAMAGED: "DAMAGED",
	LOST: "LOST",
	NEW: "NEW",
	RECOVERED: "RECOVERED",
	DONATION: "DONATION"
};
//#endregion
//#region electron/ipc/auth.ts
var unlockAttempts = /* @__PURE__ */ new Map();
function registerAuthHandlers() {
	ipcMain.handle("check-db-status", () => {
		return checkDbStatus();
	});
	ipcMain.handle("setup-db", async (_, password) => {
		const pwdError = validateMasterPassword(password);
		if (pwdError) return {
			success: false,
			error: pwdError
		};
		const result = setupDatabase(password);
		if (result.success) try {
			await openPrismaDatabase();
		} catch (err) {
			await disconnectPrisma();
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
		return result;
	});
	ipcMain.handle("unlock-db", async (_, { password, isRecovery = false }) => {
		const key = isRecovery ? "recovery" : "password";
		const state = unlockAttempts.get(key) || {
			attempts: 0,
			nextAllowedTime: 0
		};
		if (Date.now() < state.nextAllowedTime) return {
			success: false,
			error: `Too many failed attempts. Try again in ${Math.ceil((state.nextAllowedTime - Date.now()) / 1e3)} seconds.`
		};
		const result = unlockDatabase(password, isRecovery);
		if (!result.success) {
			state.attempts++;
			const backoffSeconds = Math.min(60, Math.pow(2, state.attempts - 1));
			state.nextAllowedTime = Date.now() + backoffSeconds * 1e3;
			unlockAttempts.set(key, state);
			return {
				success: false,
				error: "Invalid password or recovery key"
			};
		}
		unlockAttempts.delete(key);
		if (result.success) try {
			await openPrismaDatabase();
		} catch (err) {
			await disconnectPrisma();
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
		return result;
	});
	ipcMain.handle("change-password", (_, { oldPassword, newPassword }) => {
		const pwdError = validateMasterPassword(newPassword);
		if (pwdError) return {
			success: false,
			error: pwdError
		};
		return changePassword(oldPassword, newPassword);
	});
}
//#endregion
//#region electron/ipc/inventory.ts
var ALLOWED_INCIDENT_TYPES = Object.values(IncidentType);
function registerInventoryHandlers() {
	ipcMain.handle("get-subjects", async () => {
		try {
			return {
				success: true,
				data: await ensureDb().subject.findMany()
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-incidents", async () => {
		try {
			return {
				success: true,
				data: await ensureDb().incident.findMany({
					include: { subject: true },
					orderBy: { date: "desc" }
				})
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-summary", async () => {
		try {
			const prisma = ensureDb();
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
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("add-subject", async (_, data) => {
		try {
			const prisma = ensureDb();
			if (!data.name || typeof data.name !== "string") throw new Error("Invalid subject name");
			const res = await prisma.subject.create({ data: {
				name: data.name,
				category: typeof data.category === "string" ? data.category : "General",
				openingCount: typeof data.openingCount === "number" ? data.openingCount : 0
			} });
			await encryptTempDatabase();
			return {
				success: true,
				data: res
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("add-incident", async (_, data) => {
		try {
			const prisma = ensureDb();
			if (!data.bookTitle || typeof data.bookTitle !== "string") throw new Error("Invalid book title");
			if (!ALLOWED_INCIDENT_TYPES.includes(data.type)) throw new Error("Invalid incident type");
			if (data.subjectId && typeof data.subjectId !== "number") throw new Error("Invalid subject ID");
			const res = await prisma.$transaction(async (tx) => {
				let subject = null;
				if (data.subjectId) {
					subject = await tx.subject.findUnique({ where: { id: data.subjectId } });
					if (!subject) throw new Error("Referenced subject does not exist");
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
				if (data.subjectId && subject) {
					const updateData = {};
					if (data.type === IncidentType.DAMAGED) updateData.damaged = { increment: 1 };
					if (data.type === IncidentType.LOST) updateData.lost = { increment: 1 };
					if (data.type === IncidentType.RECOVERED) updateData.recovered = { increment: 1 };
					if (Object.keys(updateData).length > 0) {
						await tx.subject.update({
							where: { id: data.subjectId },
							data: updateData
						});
						const field = data.type === IncidentType.DAMAGED ? "damaged" : data.type === IncidentType.LOST ? "lost" : data.type === IncidentType.RECOVERED ? "recovered" : null;
						if (field) {
							const oldValueStr = String(subject[field] ?? 0);
							const newValueStr = String(Number(subject[field] ?? 0) + 1);
							await tx.auditLog.create({ data: {
								subjectId: data.subjectId,
								field,
								oldValue: oldValueStr,
								newValue: newValueStr,
								changedBy: "LIBRARIAN"
							} });
						}
					}
				}
				return incident;
			});
			await encryptTempDatabase();
			return {
				success: true,
				data: res
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("update-subject", async (_, data) => {
		try {
			const prisma = ensureDb();
			if (!data.id || typeof data.id !== "number") throw new Error("Invalid subject ID");
			const res = await prisma.$transaction(async (tx) => {
				const oldSubject = await tx.subject.findUnique({ where: { id: data.id } });
				if (!oldSubject) throw new Error("Referenced subject does not exist");
				const updated = await tx.subject.update({
					where: { id: data.id },
					data: {
						name: typeof data.data?.name === "string" ? data.data.name : void 0,
						category: typeof data.data?.category === "string" ? data.data.category : void 0,
						openingCount: typeof data.data?.openingCount === "number" ? data.data.openingCount : void 0
					}
				});
				const logs = [];
				if (data.data?.name && data.data.name !== oldSubject.name) logs.push({
					field: "name",
					oldValue: oldSubject.name,
					newValue: data.data.name
				});
				if (data.data?.category && data.data.category !== oldSubject.category) logs.push({
					field: "category",
					oldValue: oldSubject.category || "",
					newValue: data.data.category
				});
				if (typeof data.data?.openingCount === "number" && data.data.openingCount !== oldSubject.openingCount) logs.push({
					field: "openingCount",
					oldValue: oldSubject.openingCount.toString(),
					newValue: data.data.openingCount.toString()
				});
				if (logs.length > 0) await tx.auditLog.createMany({ data: logs.map((l) => ({
					subjectId: data.id,
					changedBy: "LIBRARIAN",
					...l
				})) });
				return updated;
			});
			await encryptTempDatabase();
			return {
				success: true,
				data: res
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-audit-logs", async () => {
		try {
			return {
				success: true,
				data: await ensureDb().auditLog.findMany({
					include: { subject: true },
					orderBy: { changedAt: "desc" },
					take: 100
				})
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-school-info", async () => {
		try {
			return {
				success: true,
				data: await ensureDb().school.findFirst() || {
					name: "Mentor High School - Kitende",
					motto: "Education is the Key",
					academicYear: "2026"
				}
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("save-school-info", async (_event, data) => {
		try {
			const prisma = ensureDb();
			const existing = await prisma.school.findFirst();
			let updated;
			if (existing) updated = await prisma.school.update({
				where: { id: existing.id },
				data: {
					name: data.name,
					motto: data.motto,
					academicYear: data.academicYear
				}
			});
			else updated = await prisma.school.create({ data: {
				name: data.name,
				motto: data.motto,
				academicYear: data.academicYear
			} });
			await encryptTempDatabase();
			return {
				success: true,
				data: updated
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
}
//#endregion
//#region electron/ipc/checkouts.ts
function getRuleForClass(studentClass, rules) {
	if (!rules || rules.length === 0) return {
		roleOrGrade: "DEFAULT",
		maxBooksAllowed: 2,
		borrowDurationDays: 14,
		finePerDay: 0
	};
	const defaultRule = rules.find((r) => r.roleOrGrade === "DEFAULT") || {
		roleOrGrade: "DEFAULT",
		maxBooksAllowed: 2,
		borrowDurationDays: 14,
		finePerDay: 0
	};
	if (!studentClass || !studentClass.trim()) return defaultRule;
	const sClass = studentClass.trim().toUpperCase();
	const exactMatch = rules.find((r) => r.roleOrGrade.trim().toUpperCase() === sClass);
	if (exactMatch) return exactMatch;
	if (sClass.startsWith("S.1") || sClass.startsWith("S.2") || sClass.startsWith("S.3") || sClass.startsWith("S.4")) {
		const oLevel = rules.find((r) => r.roleOrGrade === "S.1-S.4");
		if (oLevel) return oLevel;
	}
	if (sClass.startsWith("S.5") || sClass.startsWith("S.6")) {
		const aLevel = rules.find((r) => r.roleOrGrade === "S.5-S.6");
		if (aLevel) return aLevel;
	}
	if (sClass.includes("TEACHER") || sClass.includes("STAFF")) {
		const teacher = rules.find((r) => r.roleOrGrade === "TEACHER");
		if (teacher) return teacher;
	}
	return defaultRule;
}
async function calculateClearance(studentName, studentClass) {
	if (!studentName || typeof studentName !== "string" || !studentName.trim()) throw new Error("Invalid student name");
	const prisma = ensureDb();
	const sName = studentName.trim();
	const sClass = studentClass ? studentClass.trim() : null;
	const activeCheckouts = (await prisma.checkout.findMany({
		where: { status: "ACTIVE" },
		include: { subject: true }
	})).filter((c) => c.studentName.trim().toLowerCase() === sName.toLowerCase() && (!sClass || (c.studentClass || "").trim().toLowerCase() === sClass.toLowerCase()));
	const studentIncidents = (await prisma.incident.findMany({ include: { subject: true } })).filter((i) => i.responsibleParty && i.responsibleParty.trim().toLowerCase() === sName.toLowerCase() && (!sClass || !i.studentClass || i.studentClass.trim().toLowerCase() === sClass.toLowerCase()));
	const unresolvedIncidents = studentIncidents.filter((i) => {
		if (i.actionTaken === "RESOLVED" || i.actionTaken === "PAID") return false;
		return true;
	});
	const rule = getRuleForClass(sClass, await prisma.borrowingRule.findMany());
	const now = /* @__PURE__ */ new Date();
	let overdueFines = 0;
	for (const checkout of activeCheckouts) if (checkout.dueDate < now) {
		const diffMs = now.getTime() - new Date(checkout.dueDate).getTime();
		const daysOverdue = Math.ceil(diffMs / (1e3 * 60 * 60 * 24));
		overdueFines += daysOverdue * rule.finePerDay;
	}
	let incidentCharges = 0;
	for (const incident of unresolvedIncidents) if (incident.type === "LOST") incidentCharges += 25;
	else if (incident.type === "DAMAGED") incidentCharges += 10;
	else incidentCharges += 5;
	const totalReplacementCharges = overdueFines + incidentCharges;
	return {
		studentName: sName,
		studentClass: sClass,
		status: activeCheckouts.length === 0 && unresolvedIncidents.length === 0 ? "CLEARED" : "HOLD",
		activeCheckouts,
		incidents: studentIncidents,
		unresolvedIncidents,
		totalReplacementCharges
	};
}
function registerCheckoutHandlers() {
	ipcMain.handle("add-checkout", async (_, data) => {
		try {
			const prisma = ensureDb();
			if (!data.subjectId || typeof data.subjectId !== "number") throw new Error("Invalid subject ID");
			if (!data.studentName || typeof data.studentName !== "string") throw new Error("Invalid student name");
			const studentName = data.studentName.trim();
			const studentClass = data.studentClass ? data.studentClass.trim() : null;
			const rule = getRuleForClass(studentClass, await prisma.borrowingRule.findMany());
			const res = await prisma.$transaction(async (tx) => {
				const subject = await tx.subject.findUnique({ where: { id: data.subjectId } });
				if (!subject) throw new Error("Referenced subject does not exist");
				if (calculateAvailable(subject) <= 0) throw new Error("No available books for this subject");
				const activeCheckouts = await tx.checkout.count({ where: {
					studentName,
					status: "ACTIVE",
					...studentClass ? { studentClass } : {}
				} });
				if (activeCheckouts >= rule.maxBooksAllowed) throw new Error(`Borrowing limit exceeded: ${studentName} already has ${activeCheckouts} active book(s) checked out (max allowed for ${rule.roleOrGrade}: ${rule.maxBooksAllowed}).`);
				let dueDate;
				if (data.dueDate) dueDate = new Date(data.dueDate);
				else {
					dueDate = /* @__PURE__ */ new Date();
					dueDate.setDate(dueDate.getDate() + rule.borrowDurationDays);
				}
				const checkout = await tx.checkout.create({ data: {
					subjectId: data.subjectId,
					studentName,
					studentClass,
					dueDate,
					conditionOut: typeof data.conditionOut === "number" ? data.conditionOut : 3,
					status: "ACTIVE"
				} });
				await tx.subject.update({
					where: { id: data.subjectId },
					data: { issued: { increment: 1 } }
				});
				await tx.auditLog.create({ data: {
					subjectId: data.subjectId,
					field: "issued",
					oldValue: subject.issued.toString(),
					newValue: (subject.issued + 1).toString(),
					changedBy: "LIBRARIAN"
				} });
				return checkout;
			});
			await encryptTempDatabase();
			return {
				success: true,
				data: res
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("return-checkout", async (_, { id, conditionIn }) => {
		try {
			const prisma = ensureDb();
			if (typeof id !== "number") throw new Error("Invalid checkout ID");
			const res = await prisma.$transaction(async (tx) => {
				const existingCheckout = await tx.checkout.findUnique({ where: { id } });
				if (!existingCheckout) throw new Error("Checkout record not found");
				if (existingCheckout.status !== "ACTIVE") throw new Error("Checkout is not active");
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
							acc.totalDegradation += c.conditionOut - (c.conditionIn ?? c.conditionOut);
							acc.count++;
						}
						return acc;
					}, {
						totalDegradation: 0,
						count: 0
					});
					const newDegradationRate = count > 0 ? totalDegradation / count : 0;
					const totalBooks = subject.openingCount + subject.recovered - subject.lost - subject.damaged;
					const conditionLoss = checkout.conditionOut - (conditionIn ?? checkout.conditionOut);
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
					await tx.auditLog.create({ data: {
						subjectId: subject.id,
						field: "issued",
						oldValue: subject.issued.toString(),
						newValue: (subject.issued - 1).toString(),
						changedBy: "LIBRARIAN"
					} });
				}
				return checkout;
			});
			await encryptTempDatabase();
			return {
				success: true,
				data: res
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-active-checkouts", async (_, subjectId) => {
		try {
			const prisma = ensureDb();
			const whereClause = { status: "ACTIVE" };
			if (typeof subjectId === "number" && subjectId > 0) whereClause.subjectId = subjectId;
			return {
				success: true,
				data: await prisma.checkout.findMany({
					where: whereClause,
					include: { subject: true },
					orderBy: { checkoutDate: "desc" }
				})
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("record-fine-payment", async (_, data) => {
		try {
			const prisma = ensureDb();
			const { studentName, studentClass, amount, paymentMethod, notes } = data || {};
			if (!studentName || typeof studentName !== "string" || !studentName.trim()) throw new Error("Invalid student name");
			const amt = Number(amount);
			if (isNaN(amt) || amt < 0) throw new Error("Invalid payment amount");
			const sName = studentName.trim();
			const sClass = studentClass ? studentClass.trim() : null;
			const method = paymentMethod || "Cash";
			const dateStr = (/* @__PURE__ */ new Date()).toLocaleDateString();
			const studentIncidents = (await prisma.incident.findMany()).filter((i) => i.responsibleParty && i.responsibleParty.trim().toLowerCase() === sName.toLowerCase() && (!sClass || !i.studentClass || i.studentClass.trim().toLowerCase() === sClass.toLowerCase()) && (!i.actionTaken || !i.actionTaken.toUpperCase().includes("PAID") && !i.actionTaken.toUpperCase().includes("WAIVED") && !i.actionTaken.toUpperCase().includes("RESOLVED")));
			for (const inc of studentIncidents) await prisma.incident.update({
				where: { id: inc.id },
				data: { actionTaken: `PAID (${method} - $${amt.toFixed(2)}${notes ? " - " + notes : ""}) on ${dateStr}` }
			});
			const updatedClearance = await calculateClearance(sName, sClass);
			await encryptTempDatabase();
			return {
				success: true,
				data: updatedClearance
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("waive-fine", async (_, data) => {
		try {
			const prisma = ensureDb();
			const { studentName, studentClass, reason, approvedBy } = data || {};
			if (!studentName || typeof studentName !== "string" || !studentName.trim()) throw new Error("Invalid student name");
			if (!reason || typeof reason !== "string" || !reason.trim()) throw new Error("Waiver reason is required");
			const sName = studentName.trim();
			const sClass = studentClass ? studentClass.trim() : null;
			const approver = approvedBy ? approvedBy.trim() : "LIBRARIAN";
			const dateStr = (/* @__PURE__ */ new Date()).toLocaleDateString();
			const studentIncidents = (await prisma.incident.findMany()).filter((i) => i.responsibleParty && i.responsibleParty.trim().toLowerCase() === sName.toLowerCase() && (!sClass || !i.studentClass || i.studentClass.trim().toLowerCase() === sClass.toLowerCase()) && (!i.actionTaken || !i.actionTaken.toUpperCase().includes("PAID") && !i.actionTaken.toUpperCase().includes("WAIVED") && !i.actionTaken.toUpperCase().includes("RESOLVED")));
			for (const inc of studentIncidents) await prisma.incident.update({
				where: { id: inc.id },
				data: { actionTaken: `WAIVED (Reason: ${reason.trim()} by ${approver}) on ${dateStr}` }
			});
			const updatedClearance = await calculateClearance(sName, sClass);
			await encryptTempDatabase();
			return {
				success: true,
				data: updatedClearance
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-overdue-checkouts", async () => {
		try {
			return {
				success: true,
				data: await ensureDb().checkout.findMany({
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
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-borrowing-rules", async () => {
		try {
			return {
				success: true,
				data: await ensureDb().borrowingRule.findMany({ orderBy: { id: "asc" } })
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("save-borrowing-rule", async (_, ruleData) => {
		try {
			const prisma = ensureDb();
			if (!ruleData.roleOrGrade || typeof ruleData.roleOrGrade !== "string") throw new Error("Invalid role or grade");
			const roleOrGrade = ruleData.roleOrGrade.trim().toUpperCase();
			const maxBooksAllowed = typeof ruleData.maxBooksAllowed === "number" ? ruleData.maxBooksAllowed : Number(ruleData.maxBooksAllowed || 2);
			const borrowDurationDays = typeof ruleData.borrowDurationDays === "number" ? ruleData.borrowDurationDays : Number(ruleData.borrowDurationDays || 14);
			const finePerDay = typeof ruleData.finePerDay === "number" ? ruleData.finePerDay : Number(ruleData.finePerDay || 0);
			const res = await prisma.borrowingRule.upsert({
				where: { roleOrGrade },
				update: {
					maxBooksAllowed,
					borrowDurationDays,
					finePerDay
				},
				create: {
					roleOrGrade,
					maxBooksAllowed,
					borrowDurationDays,
					finePerDay
				}
			});
			await encryptTempDatabase();
			return {
				success: true,
				data: res
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("delete-borrowing-rule", async (_, data) => {
		try {
			const prisma = ensureDb();
			const id = typeof data === "number" ? data : data?.id;
			if (!id || typeof id !== "number") throw new Error("Invalid rule ID");
			if ((await prisma.borrowingRule.findUnique({ where: { id } }))?.roleOrGrade === "DEFAULT") throw new Error("Cannot delete the DEFAULT borrowing rule");
			await prisma.borrowingRule.delete({ where: { id } });
			await encryptTempDatabase();
			return { success: true };
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-clearance-status", async (_, data) => {
		try {
			ensureDb();
			const { studentName, studentClass } = data || {};
			return {
				success: true,
				data: await calculateClearance(studentName, studentClass)
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("generate-clearance-slip", async (_, data) => {
		try {
			const prisma = ensureDb();
			const { studentName, studentClass } = data || {};
			const clearance = await calculateClearance(studentName, studentClass);
			let school = await prisma.school.findFirst();
			if (!school) school = {
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
			const decisionText = clearance.status === "CLEARED" ? "CLEARED - Student has returned all materials and cleared all outstanding obligations." : "HOLD - Clearance withheld due to outstanding checkouts or unaddressed incidents.";
			return {
				success: true,
				data: {
					timestamp: (/* @__PURE__ */ new Date()).toISOString(),
					school: {
						name: school.name,
						motto: school.motto,
						logoPath: school.logoPath,
						address: school.address,
						contactPhone: school.contactPhone,
						academicYear: school.academicYear
					},
					student: {
						studentName: clearance.studentName,
						studentClass: clearance.studentClass
					},
					status: clearance.status,
					activeCheckouts: clearance.activeCheckouts,
					incidents: clearance.incidents,
					unresolvedIncidents: clearance.unresolvedIncidents,
					totalReplacementCharges: clearance.totalReplacementCharges,
					clearanceDecision: decisionText
				}
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
}
//#endregion
//#region electron/ipc/audits.ts
function calculateStockAuditDiscrepancy(expectedCount, actualCount) {
	const exp = typeof expectedCount === "number" && !isNaN(expectedCount) ? Math.max(0, expectedCount) : 0;
	const act = typeof actualCount === "number" && !isNaN(actualCount) ? Math.max(0, actualCount) : 0;
	const discrepancy = act - exp;
	return {
		expectedCount: exp,
		actualCount: act,
		discrepancy,
		hasDiscrepancy: discrepancy !== 0,
		isMissing: discrepancy < 0,
		isMisplaced: discrepancy > 0,
		discrepancyAmount: Math.abs(discrepancy)
	};
}
function registerAuditHandlers() {
	ipcMain.handle("create-stock-audit", async (_, data) => {
		try {
			const prisma = ensureDb();
			const auditedBy = typeof data?.auditedBy === "string" ? data.auditedBy : "LIBRARIAN";
			const notes = typeof data?.notes === "string" ? data.notes : null;
			const subjects = await prisma.subject.findMany();
			const audit = await prisma.$transaction(async (tx) => {
				const createdAudit = await tx.stockAudit.create({ data: {
					auditedBy,
					notes,
					status: "IN_PROGRESS"
				} });
				if (subjects.length > 0) {
					const itemsData = subjects.map((s) => {
						const exp = calculateAvailable(s);
						return {
							auditId: createdAudit.id,
							subjectId: s.id,
							expectedCount: exp,
							actualCount: exp,
							discrepancy: 0
						};
					});
					await tx.stockAuditItem.createMany({ data: itemsData });
				}
				return tx.stockAudit.findUnique({
					where: { id: createdAudit.id },
					include: { items: { include: { subject: true } } }
				});
			});
			await encryptTempDatabase();
			return {
				success: true,
				data: audit
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("save-stock-audit-item", async (_, data) => {
		try {
			const prisma = ensureDb();
			const { auditId, subjectId, actualCount, notes } = data || {};
			if (!auditId || typeof auditId !== "number") throw new Error("Invalid audit ID");
			if (!subjectId || typeof subjectId !== "number") throw new Error("Invalid subject ID");
			if (typeof actualCount !== "number") throw new Error("Invalid actual count");
			const res = await prisma.$transaction(async (tx) => {
				const audit = await tx.stockAudit.findUnique({ where: { id: auditId } });
				if (!audit) throw new Error("Stock audit not found");
				if (audit.status === "COMPLETED") throw new Error("Cannot edit a completed audit");
				const subject = await tx.subject.findUnique({ where: { id: subjectId } });
				if (!subject) throw new Error("Referenced subject does not exist");
				const expectedCount = calculateAvailable(subject);
				const discrepancyInfo = calculateStockAuditDiscrepancy(expectedCount, actualCount);
				return await tx.stockAuditItem.upsert({
					where: { auditId_subjectId: {
						auditId,
						subjectId
					} },
					create: {
						auditId,
						subjectId,
						expectedCount,
						actualCount: discrepancyInfo.actualCount,
						discrepancy: discrepancyInfo.discrepancy,
						notes: notes || null
					},
					update: {
						expectedCount,
						actualCount: discrepancyInfo.actualCount,
						discrepancy: discrepancyInfo.discrepancy,
						notes: notes !== void 0 ? notes : void 0
					},
					include: { subject: true }
				});
			});
			await encryptTempDatabase();
			return {
				success: true,
				data: res
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("complete-stock-audit", async (_, data) => {
		try {
			const prisma = ensureDb();
			const { auditId, notes } = data || {};
			if (!auditId || typeof auditId !== "number") throw new Error("Invalid audit ID");
			const res = await prisma.$transaction(async (tx) => {
				const audit = await tx.stockAudit.findUnique({
					where: { id: auditId },
					include: { items: { include: { subject: true } } }
				});
				if (!audit) throw new Error("Stock audit not found");
				if (audit.status === "COMPLETED") throw new Error("Stock audit is already completed");
				const updatedAudit = await tx.stockAudit.update({
					where: { id: auditId },
					data: {
						status: "COMPLETED",
						notes: notes !== void 0 ? notes : audit.notes,
						updatedAt: /* @__PURE__ */ new Date()
					},
					include: { items: { include: { subject: true } } }
				});
				let totalExpected = 0;
				let totalActual = 0;
				let totalDiscrepancy = 0;
				let missingItems = 0;
				let misplacedItems = 0;
				for (const item of updatedAudit.items) {
					totalExpected += item.expectedCount;
					totalActual += item.actualCount;
					totalDiscrepancy += item.discrepancy;
					if (item.discrepancy < 0) missingItems += Math.abs(item.discrepancy);
					if (item.discrepancy > 0) misplacedItems += item.discrepancy;
					if (item.discrepancy < 0 && item.subject) {
						const lostQty = Math.abs(item.discrepancy);
						await tx.subject.update({
							where: { id: item.subjectId },
							data: { lost: { increment: lostQty } }
						});
						await tx.auditLog.create({ data: {
							subjectId: item.subjectId,
							field: "lost",
							oldValue: item.subject.lost.toString(),
							newValue: (item.subject.lost + lostQty).toString(),
							changedBy: "AUDIT_AUTO"
						} });
					}
				}
				return {
					...updatedAudit,
					summary: {
						totalSubjects: updatedAudit.items.length,
						totalExpected,
						totalActual,
						totalDiscrepancy,
						missingItems,
						misplacedItems
					}
				};
			});
			await encryptTempDatabase();
			return {
				success: true,
				data: res
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-stock-audits", async (_, data) => {
		try {
			const prisma = ensureDb();
			const id = typeof data === "number" ? data : data?.id;
			if (id) return {
				success: true,
				data: await prisma.stockAudit.findUnique({
					where: { id },
					include: { items: { include: { subject: true } } }
				})
			};
			return {
				success: true,
				data: await prisma.stockAudit.findMany({
					orderBy: { auditDate: "desc" },
					include: { items: true }
				})
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
}
//#endregion
//#region electron/ipc/analytics.ts
function calculateConditionDecay(averageCondition, degradationRate, futureCheckouts) {
	const currentCondition = Math.max(1, Math.min(3, averageCondition));
	const rate = degradationRate > 0 ? degradationRate : .02;
	return {
		currentCondition,
		degradationRate: rate,
		futureCheckouts,
		projectedCondition: Math.max(1, Math.round((currentCondition - rate * futureCheckouts) * 100) / 100),
		remainingCheckouts: Math.max(0, Math.floor((currentCondition - 1) / rate))
	};
}
function calculateReplacementCost(subjects, unitCost = 25) {
	let totalCost = 0;
	let totalDamaged = 0;
	let totalNearEndLife = 0;
	const items = subjects.map((sub) => {
		const totalBooks = Math.max(0, (sub.openingCount || 0) + (sub.recovered || 0));
		const damaged = Math.max(0, sub.damaged || 0);
		const lost = Math.max(0, sub.lost || 0);
		const activeAvailable = Math.max(0, totalBooks - damaged - lost);
		const cond = typeof sub.averageCondition === "number" ? sub.averageCondition : 3;
		let nearEndLife = 0;
		if (cond <= 1.5) nearEndLife = activeAvailable;
		else if (cond < 2.5) {
			const decayRatio = (2.5 - cond) / 1.5;
			nearEndLife = Math.floor(activeAvailable * decayRatio);
		}
		const replaceCount = damaged + nearEndLife;
		const estimatedCost = Math.round(replaceCount * unitCost * 100) / 100;
		totalCost += estimatedCost;
		totalDamaged += damaged;
		totalNearEndLife += nearEndLife;
		return {
			subjectId: sub.id,
			name: sub.name || "Unknown",
			category: sub.category || "General",
			totalBooks,
			damagedCount: damaged,
			nearEndLifeCount: nearEndLife,
			replacementCount: replaceCount,
			estimatedCost,
			averageCondition: cond
		};
	});
	const categoryMap = /* @__PURE__ */ new Map();
	for (const item of items) {
		const cat = item.category || "General";
		categoryMap.set(cat, (categoryMap.get(cat) || 0) + item.estimatedCost);
	}
	const categoryCosts = Array.from(categoryMap.entries()).map(([category, cost]) => ({
		category,
		cost: Math.round(cost * 100) / 100
	}));
	return {
		subjects: items,
		totalReplacementCost: Math.round(totalCost * 100) / 100,
		totalDamaged,
		totalNearEndLife,
		categoryCosts,
		unitCost
	};
}
function aggregateCirculationTrends(checkouts) {
	const monthsMap = /* @__PURE__ */ new Map();
	const dayNames = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday"
	];
	const dayMap = /* @__PURE__ */ new Map();
	dayNames.forEach((d) => dayMap.set(d, 0));
	const categoryMap = /* @__PURE__ */ new Map();
	const studentMap = /* @__PURE__ */ new Map();
	for (const c of checkouts) {
		const cDate = new Date(c.checkoutDate);
		if (isNaN(cDate.getTime())) continue;
		const monthKey = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, "0")}`;
		const monthLabel = cDate.toLocaleString("default", {
			month: "short",
			year: "numeric"
		});
		if (!monthsMap.has(monthKey)) monthsMap.set(monthKey, {
			month: monthLabel,
			checkouts: 0,
			returns: 0,
			timestamp: new Date(cDate.getFullYear(), cDate.getMonth(), 1).getTime()
		});
		monthsMap.get(monthKey).checkouts++;
		if (c.returnDate) {
			const rDate = new Date(c.returnDate);
			if (!isNaN(rDate.getTime())) {
				const rMonthKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, "0")}`;
				const rMonthLabel = rDate.toLocaleString("default", {
					month: "short",
					year: "numeric"
				});
				if (!monthsMap.has(rMonthKey)) monthsMap.set(rMonthKey, {
					month: rMonthLabel,
					checkouts: 0,
					returns: 0,
					timestamp: new Date(rDate.getFullYear(), rDate.getMonth(), 1).getTime()
				});
				monthsMap.get(rMonthKey).returns++;
			}
		}
		const dayName = dayNames[cDate.getDay()];
		dayMap.set(dayName, (dayMap.get(dayName) || 0) + 1);
		const cat = c.subject?.category || "General";
		categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
		const studentName = (c.studentName || "").trim();
		if (studentName) {
			const key = `${studentName.toLowerCase()}||${(c.studentClass || "").trim().toLowerCase()}`;
			if (!studentMap.has(key)) studentMap.set(key, {
				studentName,
				studentClass: c.studentClass ? c.studentClass.trim() : null,
				totalCheckouts: 0
			});
			studentMap.get(key).totalCheckouts++;
		}
	}
	return {
		monthlyTrends: Array.from(monthsMap.values()).sort((a, b) => a.timestamp - b.timestamp).map(({ month, checkouts, returns }) => ({
			month,
			checkouts,
			returns
		})),
		peakDays: Array.from(dayMap.entries()).map(([day, count]) => ({
			day,
			count
		})),
		popularCategories: Array.from(categoryMap.entries()).map(([category, count]) => ({
			category,
			count
		})).sort((a, b) => b.count - a.count),
		topReaders: Array.from(studentMap.values()).sort((a, b) => b.totalCheckouts - a.totalCheckouts).slice(0, 10)
	};
}
function registerAnalyticsHandlers() {
	ipcMain.handle("get-depreciation-analytics", async () => {
		try {
			const subjects = await ensureDb().subject.findMany({ include: { checkouts: true } });
			return {
				success: true,
				data: {
					decayProjections: subjects.map((s) => {
						const projections = [
							0,
							10,
							25,
							50,
							100
						].map((checkouts) => calculateConditionDecay(s.averageCondition, s.degradationRate, checkouts));
						const currentDecay = calculateConditionDecay(s.averageCondition, s.degradationRate, 0);
						return {
							subjectId: s.id,
							subjectName: s.name,
							category: s.category || "General",
							averageCondition: s.averageCondition,
							degradationRate: currentDecay.degradationRate,
							remainingCheckouts: currentDecay.remainingCheckouts,
							projections
						};
					}),
					replacementCostAnalysis: calculateReplacementCost(subjects, 25)
				}
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-circulation-insights", async () => {
		try {
			return {
				success: true,
				data: aggregateCirculationTrends(await ensureDb().checkout.findMany({
					include: { subject: true },
					orderBy: { checkoutDate: "asc" }
				}))
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
}
//#endregion
//#region electron/services/backup.ts
function formatBackupTimestamp(date = /* @__PURE__ */ new Date()) {
	const d = !(date instanceof Date) || isNaN(date.getTime()) ? /* @__PURE__ */ new Date() : date;
	return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
}
function isBackupDue(lastBackupAt, intervalHours, now = /* @__PURE__ */ new Date()) {
	if (!lastBackupAt) return true;
	const lastDate = lastBackupAt instanceof Date ? lastBackupAt : new Date(lastBackupAt);
	if (!(lastDate instanceof Date) || isNaN(lastDate.getTime())) return true;
	if (lastDate.getTime() > now.getTime()) return true;
	return (now.getTime() - lastDate.getTime()) / (1e3 * 60 * 60) >= intervalHours;
}
/**
* Sanitizes and validates the target backup directory path to prevent path traversal attacks.
*/
function sanitizeBackupPath(targetDir) {
	const resolved = path.resolve(targetDir);
	const root = path.parse(resolved).root;
	if (resolved === root || resolved === path.join(root, "Windows") || resolved === path.join(root, "System32")) throw new Error("Invalid or restricted backup directory path.");
	return resolved;
}
function performVaultBackup(targetDir, customSourceFile) {
	try {
		if (!targetDir || !targetDir.trim()) return {
			success: false,
			error: "Target directory is required"
		};
		const safeTargetDir = sanitizeBackupPath(targetDir);
		const dataDir = app.getPath("userData");
		const sourceEncFile = customSourceFile || path.join(dataDir, "quantlib.enc");
		if (!fs.existsSync(sourceEncFile)) return {
			success: false,
			error: "Source vault file (quantlib.enc) does not exist."
		};
		if (!fs.existsSync(safeTargetDir)) fs.mkdirSync(safeTargetDir, { recursive: true });
		const filename = `quantlib_backup_${formatBackupTimestamp()}.enc`;
		const backupPath = path.join(safeTargetDir, filename);
		fs.copyFileSync(sourceEncFile, backupPath);
		return {
			success: true,
			backupPath,
			filename
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
async function listVaultBackups(targetDir) {
	try {
		const safeTargetDir = sanitizeBackupPath(targetDir || path.join(app.getPath("userData"), "backups"));
		if (!fs.existsSync(safeTargetDir)) return [];
		const backupFiles = (await fs.promises.readdir(safeTargetDir)).filter((f) => f.startsWith("quantlib_backup_") && f.endsWith(".enc"));
		return (await Promise.all(backupFiles.map(async (filename) => {
			const fullPath = path.join(safeTargetDir, filename);
			const stats = await fs.promises.stat(fullPath);
			return {
				filename,
				fullPath,
				sizeBytes: stats.size,
				createdAt: stats.birthtime ? stats.birthtime.toISOString() : stats.mtime.toISOString()
			};
		}))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	} catch {
		return [];
	}
}
/**
* Synchronous version of listVaultBackups maintained for compatibility with tests expecting synchronous return.
*/
function listVaultBackupsSync(targetDir) {
	try {
		const safeTargetDir = sanitizeBackupPath(targetDir || path.join(app.getPath("userData"), "backups"));
		if (!fs.existsSync(safeTargetDir)) return [];
		return fs.readdirSync(safeTargetDir).filter((f) => f.startsWith("quantlib_backup_") && f.endsWith(".enc")).map((filename) => {
			const fullPath = path.join(safeTargetDir, filename);
			const stats = fs.statSync(fullPath);
			return {
				filename,
				fullPath,
				sizeBytes: stats.size,
				createdAt: stats.birthtime ? stats.birthtime.toISOString() : stats.mtime.toISOString()
			};
		}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	} catch {
		return [];
	}
}
var autoBackupIntervalTimer = null;
function startAutoBackupScheduler() {
	stopAutoBackupScheduler();
	autoBackupIntervalTimer = setInterval(async () => {
		try {
			const prisma = getPrisma();
			if (!prisma) return;
			const config = (await prisma.$queryRawUnsafe("SELECT autoBackupEnabled, autoBackupIntervalHours, autoBackupPath, lastAutoBackupAt FROM AppConfig WHERE id = 1"))[0];
			if (!config || !config.autoBackupEnabled) return;
			if (isBackupDue(config.lastAutoBackupAt, config.autoBackupIntervalHours)) {
				if (performVaultBackup(config.autoBackupPath || path.join(app.getPath("userData"), "backups")).success) {
					const now = (/* @__PURE__ */ new Date()).toISOString();
					await prisma.$executeRawUnsafe("UPDATE AppConfig SET lastAutoBackupAt = ? WHERE id = 1", now);
				}
			}
		} catch (err) {
			console.error("Auto backup scheduler error:", err);
		}
	}, 3600 * 1e3);
}
function stopAutoBackupScheduler() {
	if (autoBackupIntervalTimer) {
		clearInterval(autoBackupIntervalTimer);
		autoBackupIntervalTimer = null;
	}
}
//#endregion
//#region electron/services/lan-sync.ts
function getLocalIpAddress() {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) for (const iface of interfaces[name] || []) if (iface.family === "IPv4" && !iface.internal) return iface.address;
	return "127.0.0.1";
}
async function packageLanSyncPayload(client) {
	const [subjects, checkouts, incidents, borrowingRules] = await Promise.all([
		client.subject.findMany(),
		client.checkout.findMany({ include: { subject: { select: { name: true } } } }),
		client.incident.findMany({ include: { subject: { select: { name: true } } } }),
		client.borrowingRule.findMany()
	]);
	return {
		version: 1,
		exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
		subjects,
		checkouts: checkouts.map((c) => ({
			...c,
			subjectName: c.subject?.name
		})),
		incidents: incidents.map((i) => ({
			...i,
			subjectName: i.subject?.name
		})),
		borrowingRules
	};
}
function safeDate(val, fallback = /* @__PURE__ */ new Date()) {
	if (!val) return fallback;
	const d = val instanceof Date ? val : new Date(val);
	return isNaN(d.getTime()) ? fallback : d;
}
async function mergeLanSyncPayload(client, payload) {
	const p = payload && typeof payload === "object" ? payload : null;
	if (!p) return { mergedCounts: {
		subjects: 0,
		checkouts: 0,
		incidents: 0,
		rules: 0
	} };
	const hasRules = Array.isArray(p.borrowingRules) && p.borrowingRules.length > 0;
	const hasSubjects = Array.isArray(p.subjects) && p.subjects.length > 0;
	const hasCheckouts = Array.isArray(p.checkouts) && p.checkouts.length > 0;
	const hasIncidents = Array.isArray(p.incidents) && p.incidents.length > 0;
	if (!hasRules && !hasSubjects && !hasCheckouts && !hasIncidents) return { mergedCounts: {
		subjects: 0,
		checkouts: 0,
		incidents: 0,
		rules: 0
	} };
	let subjectsMerged = 0;
	let checkoutsMerged = 0;
	let incidentsMerged = 0;
	let rulesMerged = 0;
	await client.$transaction(async (tx) => {
		if (Array.isArray(p.borrowingRules)) {
			for (const rule of p.borrowingRules) if (rule.roleOrGrade) {
				await tx.borrowingRule.upsert({
					where: { roleOrGrade: rule.roleOrGrade },
					update: {
						maxBooksAllowed: rule.maxBooksAllowed,
						borrowDurationDays: rule.borrowDurationDays,
						finePerDay: rule.finePerDay
					},
					create: {
						roleOrGrade: rule.roleOrGrade,
						maxBooksAllowed: rule.maxBooksAllowed,
						borrowDurationDays: rule.borrowDurationDays,
						finePerDay: rule.finePerDay
					}
				});
				rulesMerged++;
			}
		}
		const peerToLocalSubjectIdMap = /* @__PURE__ */ new Map();
		if (Array.isArray(p.subjects)) {
			for (const sub of p.subjects) if (sub.name) {
				const existing = await tx.subject.findUnique({ where: { name: sub.name } });
				let localSubjectId;
				if (existing) {
					localSubjectId = existing.id;
					localSubjectId = (await tx.subject.update({
						where: { id: existing.id },
						data: {
							category: sub.category ?? existing.category,
							openingCount: Math.max(existing.openingCount, sub.openingCount || 0),
							recovered: Math.max(existing.recovered, sub.recovered || 0),
							issued: Math.max(existing.issued, sub.issued || 0),
							damaged: Math.max(existing.damaged, sub.damaged || 0),
							lost: Math.max(existing.lost, sub.lost || 0),
							notes: sub.notes ?? existing.notes
						}
					})).id;
				} else localSubjectId = (await tx.subject.create({ data: {
					name: sub.name,
					category: sub.category || "General",
					openingCount: sub.openingCount || 0,
					recovered: sub.recovered || 0,
					issued: sub.issued || 0,
					damaged: sub.damaged || 0,
					lost: sub.lost || 0,
					notes: sub.notes || null,
					averageCondition: sub.averageCondition ?? 3,
					degradationRate: sub.degradationRate ?? 0
				} })).id;
				if (typeof sub.id === "number") peerToLocalSubjectIdMap.set(sub.id, localSubjectId);
				subjectsMerged++;
			}
		}
		if (Array.isArray(p.checkouts)) for (const c of p.checkouts) {
			let mappedSubjectId = null;
			if (c.subjectId && peerToLocalSubjectIdMap.has(c.subjectId)) mappedSubjectId = peerToLocalSubjectIdMap.get(c.subjectId);
			else if (c.subjectName) {
				const s = await tx.subject.findUnique({ where: { name: c.subjectName } });
				if (s) mappedSubjectId = s.id;
			} else if (c.subjectId) mappedSubjectId = c.subjectId;
			if (c.studentName && mappedSubjectId !== null) {
				const parsedCheckoutDate = safeDate(c.checkoutDate);
				const parsedDueDate = safeDate(c.dueDate);
				const parsedReturnDate = c.returnDate ? safeDate(c.returnDate) : null;
				const existing = await tx.checkout.findFirst({ where: {
					studentName: c.studentName,
					subjectId: mappedSubjectId,
					checkoutDate: parsedCheckoutDate
				} });
				if (!existing) {
					await tx.checkout.create({ data: {
						subjectId: mappedSubjectId,
						studentName: c.studentName,
						studentClass: c.studentClass || null,
						checkoutDate: parsedCheckoutDate,
						dueDate: parsedDueDate,
						returnDate: parsedReturnDate,
						status: c.status || "ACTIVE",
						conditionOut: c.conditionOut ?? 3,
						conditionIn: c.conditionIn ?? null
					} });
					checkoutsMerged++;
				} else if (existing.status !== "RETURNED" && c.status === "RETURNED") {
					await tx.checkout.update({
						where: { id: existing.id },
						data: {
							returnDate: parsedReturnDate || /* @__PURE__ */ new Date(),
							status: "RETURNED",
							conditionIn: c.conditionIn ?? existing.conditionIn ?? 3
						}
					});
					checkoutsMerged++;
				}
			}
		}
		if (Array.isArray(p.incidents)) for (const inc of p.incidents) {
			let mappedSubjectId = null;
			if (inc.subjectId && peerToLocalSubjectIdMap.has(inc.subjectId)) mappedSubjectId = peerToLocalSubjectIdMap.get(inc.subjectId);
			else if (inc.subjectName) {
				const s = await tx.subject.findUnique({ where: { name: inc.subjectName } });
				if (s) mappedSubjectId = s.id;
			}
			if (inc.bookTitle) {
				const parsedDate = safeDate(inc.date);
				if (!await tx.incident.findFirst({ where: {
					bookTitle: inc.bookTitle,
					date: parsedDate
				} })) {
					await tx.incident.create({ data: {
						type: inc.type || "DAMAGED",
						date: parsedDate,
						subjectId: mappedSubjectId,
						bookTitle: inc.bookTitle,
						condition: inc.condition || null,
						comment: inc.comment || null,
						reportedBy: inc.reportedBy || null,
						responsibleParty: inc.responsibleParty || null,
						studentClass: inc.studentClass || null,
						actionTaken: inc.actionTaken || null
					} });
					incidentsMerged++;
				}
			}
		}
	});
	try {
		await encryptTempDatabase();
	} catch {}
	return { mergedCounts: {
		subjects: subjectsMerged,
		checkouts: checkoutsMerged,
		incidents: incidentsMerged,
		rules: rulesMerged
	} };
}
var lanServer = null;
var lanServerPort = 8085;
var lanServerPasscode = "";
function generateSecurePasscode() {
	return crypto.randomBytes(8).toString("hex");
}
function startLanSyncServer(port = 8085, passcode) {
	stopLanSyncServer();
	lanServerPort = port;
	lanServerPasscode = passcode || generateSecurePasscode();
	lanServer = http.createServer((req, res) => {
		res.setHeader("Content-Type", "application/json");
		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}
		const url = new URL(req.url || "/", `http://localhost:${port}`);
		if (req.method === "GET" && url.pathname === "/status") {
			res.writeHead(200);
			res.end(JSON.stringify({
				status: "ok",
				serverName: "QuantLib LAN Sync",
				port: lanServerPort,
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			}));
			return;
		}
		if (req.method === "POST" && url.pathname === "/sync") {
			let bodyStr = "";
			let bodyLength = 0;
			const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
			req.on("data", (chunk) => {
				bodyLength += chunk.length;
				if (bodyLength > MAX_PAYLOAD_BYTES) {
					req.destroy();
					res.writeHead(413);
					res.end(JSON.stringify({
						success: false,
						error: "Payload exceeds maximum allowed size of 10MB"
					}));
					return;
				}
				bodyStr += chunk;
			});
			req.on("end", async () => {
				try {
					const body = bodyStr ? JSON.parse(bodyStr) : {};
					const headerPasscode = req.headers["x-sync-passcode"];
					const providedPasscode = body.passcode || headerPasscode;
					if (lanServerPasscode) {
						const expectedBuf = Buffer.from(lanServerPasscode);
						const providedBuf = Buffer.from(typeof providedPasscode === "string" ? providedPasscode : "");
						if (!(expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf))) {
							res.writeHead(401);
							res.end(JSON.stringify({
								success: false,
								error: "Invalid sync passcode"
							}));
							return;
						}
					}
					const prisma = getPrisma();
					if (!prisma) {
						res.writeHead(503);
						res.end(JSON.stringify({
							success: false,
							error: "Database is locked on server machine"
						}));
						return;
					}
					let mergedCounts = {};
					if (body.payload) mergedCounts = (await mergeLanSyncPayload(prisma, body.payload)).mergedCounts;
					const localPayload = await packageLanSyncPayload(prisma);
					res.writeHead(200);
					res.end(JSON.stringify({
						success: true,
						syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
						mergedCounts,
						payload: localPayload
					}));
				} catch (err) {
					res.writeHead(500);
					res.end(JSON.stringify({
						success: false,
						error: err instanceof Error ? err.message : String(err)
					}));
				}
			});
			return;
		}
		res.writeHead(404);
		res.end(JSON.stringify({
			success: false,
			error: "Endpoint not found"
		}));
	});
	lanServer.listen(port, () => {
		console.log(`QuantLib LAN Sync server running on port ${port}`);
	});
}
function stopLanSyncServer() {
	if (lanServer) {
		try {
			lanServer.close();
		} catch {}
		lanServer = null;
	}
}
async function syncWithLanPeer(peerIp, peerPort = 8085, passcode) {
	const prisma = ensureDb();
	if (!peerIp || !peerIp.trim()) throw new Error("Peer IP address is required");
	const localPayload = await packageLanSyncPayload(prisma);
	const response = await fetch(`http://${peerIp.trim()}:${peerPort}/sync`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-sync-passcode": passcode || ""
		},
		body: JSON.stringify({
			passcode: passcode || "",
			payload: localPayload
		})
	});
	if (!response.ok) {
		const errorJson = await response.json().catch(() => ({}));
		throw new Error(errorJson.error || `LAN Sync failed with HTTP status ${response.status}`);
	}
	const data = await response.json();
	if (data.payload) await mergeLanSyncPayload(prisma, data.payload);
	return data;
}
//#endregion
//#region electron/ipc/backup-lan.ts
function objectsToCsv(rows) {
	if (!rows || rows.length === 0) return "";
	const headers = Object.keys(rows[0]);
	return [headers.map((h) => `"${String(h).replace(/"/g, "\"\"")}"`).join(","), ...rows.map((row) => {
		return headers.map((header) => {
			const val = row[header];
			if (val === null || val === void 0) return "\"\"";
			if (val instanceof Date) return `"${val.toISOString()}"`;
			if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, "\"\"")}"`;
			return `"${String(val).replace(/"/g, "\"\"")}"`;
		}).join(",");
	})].join("\n");
}
function registerBackupAndLanHandlers(getMainWindow) {
	ipcMain.handle("export-entire-db-csv", async () => {
		try {
			const prisma = ensureDb();
			const win = getMainWindow();
			if (!win) return {
				success: false,
				error: "No active window available"
			};
			const { canceled, filePaths } = await dialog.showOpenDialog(win, {
				title: "Select Folder for CSV Database Export",
				properties: ["openDirectory", "createDirectory"]
			});
			if (canceled || !filePaths || filePaths.length === 0) return {
				success: false,
				error: "Export cancelled"
			};
			const targetDir = filePaths[0];
			const [subjects, checkouts, incidents, rules, audits, auditItems, auditLogs, schools] = await Promise.all([
				prisma.subject.findMany({ orderBy: { id: "asc" } }),
				prisma.checkout.findMany({
					include: { subject: true },
					orderBy: { id: "asc" }
				}),
				prisma.incident.findMany({
					include: { subject: true },
					orderBy: { id: "asc" }
				}),
				prisma.borrowingRule.findMany({ orderBy: { id: "asc" } }),
				prisma.stockAudit.findMany({ orderBy: { id: "asc" } }),
				prisma.stockAuditItem.findMany({
					include: { subject: true },
					orderBy: { id: "asc" }
				}),
				prisma.auditLog.findMany({
					include: { subject: true },
					orderBy: { id: "asc" }
				}),
				prisma.school.findMany({ orderBy: { id: "asc" } })
			]);
			const flatCheckouts = checkouts.map((c) => ({
				id: c.id,
				subjectId: c.subjectId,
				subjectName: c.subject?.name || "",
				studentName: c.studentName,
				studentClass: c.studentClass || "",
				checkoutDate: c.checkoutDate ? new Date(c.checkoutDate).toISOString() : "",
				dueDate: c.dueDate ? new Date(c.dueDate).toISOString() : "",
				returnDate: c.returnDate ? new Date(c.returnDate).toISOString() : "",
				status: c.status,
				conditionOut: c.conditionOut,
				conditionIn: c.conditionIn !== null ? c.conditionIn : "",
				createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : "",
				updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : ""
			}));
			const flatIncidents = incidents.map((i) => ({
				id: i.id,
				type: i.type,
				date: i.date ? new Date(i.date).toISOString() : "",
				subjectId: i.subjectId || "",
				subjectName: i.subject?.name || "",
				bookTitle: i.bookTitle,
				condition: i.condition || "",
				comment: i.comment || "",
				reportedBy: i.reportedBy || "",
				responsibleParty: i.responsibleParty || "",
				studentClass: i.studentClass || "",
				actionTaken: i.actionTaken || "",
				createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : ""
			}));
			const flatAuditItems = auditItems.map((item) => ({
				id: item.id,
				auditId: item.auditId,
				subjectId: item.subjectId,
				subjectName: item.subject?.name || "",
				expectedCount: item.expectedCount,
				actualCount: item.actualCount,
				discrepancy: item.discrepancy,
				notes: item.notes || ""
			}));
			const flatAuditLogs = auditLogs.map((l) => ({
				id: l.id,
				subjectId: l.subjectId,
				subjectName: l.subject?.name || "",
				field: l.field,
				oldValue: l.oldValue,
				newValue: l.newValue,
				changedBy: l.changedBy || "",
				changedAt: l.changedAt ? new Date(l.changedAt).toISOString() : ""
			}));
			const tables = [
				{
					filename: "quantlib_subjects.csv",
					data: subjects
				},
				{
					filename: "quantlib_checkouts.csv",
					data: flatCheckouts
				},
				{
					filename: "quantlib_incidents.csv",
					data: flatIncidents
				},
				{
					filename: "quantlib_borrowing_rules.csv",
					data: rules
				},
				{
					filename: "quantlib_stock_audits.csv",
					data: audits
				},
				{
					filename: "quantlib_stock_audit_items.csv",
					data: flatAuditItems
				},
				{
					filename: "quantlib_audit_logs.csv",
					data: flatAuditLogs
				},
				{
					filename: "quantlib_school_info.csv",
					data: schools
				}
			];
			let exportedCount = 0;
			for (const t of tables) {
				const csvContent = objectsToCsv(t.data);
				const outPath = path.join(targetDir, t.filename);
				fs.writeFileSync(outPath, csvContent, "utf-8");
				exportedCount++;
			}
			return {
				success: true,
				data: {
					targetDir,
					exportedCount,
					filenames: tables.map((t) => t.filename)
				}
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("backup-database", async () => {
		try {
			ensureDb();
			const win = getMainWindow();
			if (!win) return {
				success: false,
				error: "No window available"
			};
			const { canceled, filePath } = await dialog.showSaveDialog(win, {
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
			if (canceled || !filePath) return {
				success: false,
				error: "Backup cancelled"
			};
			const sourceDb = getTempDbPath();
			fs.copyFileSync(sourceDb, filePath);
			return { success: true };
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-backup-config", async () => {
		try {
			return {
				success: true,
				data: (await ensureDb().$queryRawUnsafe("SELECT autoBackupEnabled, autoBackupIntervalHours, autoBackupPath, lastAutoBackupAt FROM AppConfig WHERE id = 1"))[0] || {
					autoBackupEnabled: false,
					autoBackupIntervalHours: 24,
					autoBackupPath: null,
					lastAutoBackupAt: null
				}
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("save-backup-config", async (_, data) => {
		try {
			const prisma = ensureDb();
			const { autoBackupEnabled, autoBackupPath, autoBackupIntervalHours } = data || {};
			await prisma.$executeRawUnsafe("UPDATE AppConfig SET autoBackupEnabled = ?, autoBackupPath = ?, autoBackupIntervalHours = ?, updatedAt = ? WHERE id = 1", autoBackupEnabled ? 1 : 0, typeof autoBackupPath === "string" ? autoBackupPath : null, typeof autoBackupIntervalHours === "number" ? autoBackupIntervalHours : 24, (/* @__PURE__ */ new Date()).toISOString());
			if (autoBackupEnabled) startAutoBackupScheduler();
			return { success: true };
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("trigger-auto-backup", async (_, customPath) => {
		try {
			const prisma = ensureDb();
			const configRes = await prisma.$queryRawUnsafe("SELECT autoBackupPath FROM AppConfig WHERE id = 1");
			const result = performVaultBackup(customPath || configRes[0]?.autoBackupPath || "");
			if (result.success) await prisma.$executeRawUnsafe("UPDATE AppConfig SET lastAutoBackupAt = ? WHERE id = 1", (/* @__PURE__ */ new Date()).toISOString());
			return result;
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("list-backups", async () => {
		try {
			return {
				success: true,
				data: await listVaultBackups((await ensureDb().$queryRawUnsafe("SELECT autoBackupPath FROM AppConfig WHERE id = 1"))[0]?.autoBackupPath || void 0)
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-lan-sync-config", async () => {
		try {
			return {
				success: true,
				data: (await ensureDb().$queryRawUnsafe("SELECT lanSyncEnabled, lanPort, lanPasscode, lastLanSyncAt FROM AppConfig WHERE id = 1"))[0] || {
					lanSyncEnabled: false,
					lanPort: 8085,
					lanPasscode: "quantlib-sync",
					lastLanSyncAt: null
				}
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("save-lan-sync-config", async (_, data) => {
		try {
			const prisma = ensureDb();
			const { lanSyncEnabled, lanPort, lanPasscode } = data || {};
			const port = typeof lanPort === "number" ? lanPort : 8085;
			const passcode = typeof lanPasscode === "string" ? lanPasscode : "quantlib-sync";
			await prisma.$executeRawUnsafe("UPDATE AppConfig SET lanSyncEnabled = ?, lanPort = ?, lanPasscode = ?, updatedAt = ? WHERE id = 1", lanSyncEnabled ? 1 : 0, port, passcode, (/* @__PURE__ */ new Date()).toISOString());
			if (lanSyncEnabled) startLanSyncServer(port, passcode);
			else stopLanSyncServer();
			return { success: true };
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("sync-with-lan-peer", async (_, { peerIp, peerPort, passcode }) => {
		try {
			ensureDb();
			return {
				success: true,
				data: await syncWithLanPeer(peerIp, peerPort, passcode)
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("get-lan-status", async () => {
		try {
			ensureDb();
			return {
				success: true,
				data: { localIp: getLocalIpAddress() }
			};
		} catch (err) {
			return {
				success: false,
				error: sanitizeError(err)
			};
		}
	});
	ipcMain.handle("set-theme", (_, mode) => {
		if (mode !== "light" && mode !== "dark") return {
			success: false,
			error: "Invalid theme mode"
		};
		const win = getMainWindow();
		if (win && typeof win.setTitleBarOverlay === "function") try {
			win.setTitleBarOverlay({
				color: mode === "dark" ? "#0f172a" : "#ffffff",
				symbolColor: mode === "dark" ? "#ffffff" : "#0f172a",
				height: 32
			});
		} catch {}
		return { success: true };
	});
}
//#endregion
//#region electron/main.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
var win = null;
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
	const publicDir = process.env.VITE_PUBLIC || "";
	const distDir = process.env.DIST || "";
	win = new BrowserWindow({
		icon: path.join(publicDir, "icon.png"),
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
	if (typeof win?.removeMenu === "function") win.removeMenu();
	if (typeof win?.webContents?.setWindowOpenHandler === "function") win.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("https:") || url.startsWith("http:")) import("electron").then(({ shell }) => shell.openExternal(url));
		return { action: "deny" };
	});
	if (typeof win?.webContents?.on === "function") win.webContents.on("will-navigate", (event, url) => {
		const parsedUrl = new URL(url);
		const isLocalFile = parsedUrl.protocol === "file:";
		const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
		const isDevServer = VITE_DEV_SERVER_URL && parsedUrl.origin === new URL(VITE_DEV_SERVER_URL).origin;
		if (!isLocalFile && !isDevServer) event.preventDefault();
	});
	const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
	if (VITE_DEV_SERVER_URL) {
		if (typeof win?.loadURL === "function") win.loadURL(VITE_DEV_SERVER_URL);
	} else if (typeof win?.loadFile === "function") win.loadFile(path.join(distDir, "index.html"));
	if (typeof win?.on === "function") win.on("closed", () => {
		stopAutoBackupScheduler();
		win = null;
	});
}
registerAuthHandlers();
registerInventoryHandlers();
registerCheckoutHandlers();
registerAuditHandlers();
registerAnalyticsHandlers();
registerBackupAndLanHandlers(() => win);
app.on("window-all-closed", async () => {
	stopAutoBackupScheduler();
	stopLanSyncServer();
	await disconnectAndCleanupDatabase();
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});
app.on("before-quit", (event) => {
	stopAutoBackupScheduler();
	stopLanSyncServer();
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
			const scriptSrc = process.env["VITE_DEV_SERVER_URL"] ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'";
			callback({ responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [`default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;`]
			} });
		});
	});
	createWindow();
});
//#endregion
export { aggregateCirculationTrends, calculateClearance, calculateConditionDecay, calculateReplacementCost, calculateStockAuditDiscrepancy, formatBackupTimestamp, getLocalIpAddress, getRuleForClass, isBackupDue, listVaultBackups, listVaultBackupsSync, mergeLanSyncPayload, packageLanSyncPayload, performVaultBackup, startAutoBackupScheduler, startLanSyncServer, stopAutoBackupScheduler, stopLanSyncServer, syncWithLanPeer };
