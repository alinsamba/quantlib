import { PrismaClient } from '@prisma/client'
import { cleanupTempDatabase, getTempDbPath } from './crypto'

let prisma: PrismaClient | null = null
let databaseCleanupDone = false
let activeOperationsCount = 0
let isShuttingDown = false

export function getPrisma(): PrismaClient | null {
  return prisma
}

export function ensureDb(): PrismaClient {
  if (isShuttingDown) {
    throw new Error('Application is shutting down.')
  }
  if (!prisma) {
    throw new Error('Database is locked. Please authenticate first.')
  }
  return prisma
}

/**
 * Tracks async DB operations to prevent teardown race conditions.
 */
export async function withDbOp<T>(op: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = ensureDb()
  activeOperationsCount++
  try {
    return await op(client)
  } finally {
    activeOperationsCount--
  }
}

export function sanitizeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export async function initializeDatabase(client: PrismaClient) {
  await client.$executeRawUnsafe('PRAGMA foreign_keys = ON')

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
  `)

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
  `)

  await client.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Subject_name_key" ON "Subject"("name")')

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
  `)

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
  `)

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'LIBRARIAN',
      "pinHash" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

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
  `)

  await client.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Checkout_subjectId_idx" ON "Checkout"("subjectId")')

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
  `)

  await client.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "BorrowingRule_roleOrGrade_key" ON "BorrowingRule"("roleOrGrade")')

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
  `)

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
  `)

  await client.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "StockAuditItem_auditId_subjectId_key" ON "StockAuditItem"("auditId", "subjectId")')
  await client.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "StockAuditItem_auditId_idx" ON "StockAuditItem"("auditId")')
  await client.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "StockAuditItem_subjectId_idx" ON "StockAuditItem"("subjectId")')

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
  `)

  const configCountRes = await client.$queryRawUnsafe<{ count: number }[]>('SELECT COUNT(*) as count FROM "AppConfig"')
  const configCount = Number(configCountRes[0]?.count || 0)
  if (configCount === 0) {
    const now = new Date().toISOString()
    await client.$executeRawUnsafe(
      `INSERT INTO "AppConfig" ("id", "autoBackupEnabled", "autoBackupIntervalHours", "lanSyncEnabled", "lanPort", "lanPasscode", "updatedAt") VALUES (1, 0, 24, 0, 8085, 'quantlib-sync', ?)`,
      now
    )
  }

  const ruleCountRes = await client.$queryRawUnsafe<{ count: number }[]>('SELECT COUNT(*) as count FROM "BorrowingRule"')
  const count = Number(ruleCountRes[0]?.count || 0)
  if (count === 0) {
    const defaultRules = [
      { roleOrGrade: 'DEFAULT', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.0 },
      { roleOrGrade: 'S.1-S.4', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.0 },
      { roleOrGrade: 'S.5-S.6', maxBooksAllowed: 4, borrowDurationDays: 21, finePerDay: 0.0 },
      { roleOrGrade: 'TEACHER', maxBooksAllowed: 10, borrowDurationDays: 30, finePerDay: 0.0 }
    ]
    const now = new Date().toISOString()
    for (const rule of defaultRules) {
      await client.$executeRawUnsafe(
        `INSERT INTO "BorrowingRule" ("roleOrGrade", "maxBooksAllowed", "borrowDurationDays", "finePerDay", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
        rule.roleOrGrade, rule.maxBooksAllowed, rule.borrowDurationDays, rule.finePerDay, now
      )
    }
  }
}

export async function openPrismaDatabase(): Promise<PrismaClient> {
  const tempDb = getTempDbPath()
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${tempDb}?connection_limit=1`
      }
    }
  })
  await initializeDatabase(prisma)
  return prisma
}

export async function disconnectPrisma() {
  if (!prisma) return
  await prisma.$disconnect()
  prisma = null
}

export async function disconnectAndCleanupDatabase() {
  if (databaseCleanupDone) return
  isShuttingDown = true

  // Wait for all in-flight async operations to finish (up to 5 seconds)
  const startTime = Date.now()
  while (activeOperationsCount > 0 && Date.now() - startTime < 5000) {
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, 50)
    await promise
  }

  await disconnectPrisma()
  try {
    await cleanupTempDatabase()
  } finally {
    databaseCleanupDone = true
  }
}
