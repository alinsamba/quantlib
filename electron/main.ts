import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import http from 'node:http'


const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// 1. Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#ffffff',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  
  win.removeMenu()

  // 2. Window Open Handler (Deny new windows, route external)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      import('electron').then(({ shell }) => shell.openExternal(url))
    }
    return { action: 'deny' }
  })

  // 3. Navigation Handler (Block external origins)
  win.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url)
    const isLocalFile = parsedUrl.protocol === 'file:'
    const isDevServer = VITE_DEV_SERVER_URL && parsedUrl.origin === new URL(VITE_DEV_SERVER_URL).origin
    
    if (!isLocalFile && !isDevServer) {
      event.preventDefault()
    }
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
async function disconnectPrisma() {
  if (!prisma) return

  await prisma.$disconnect()
  prisma = null
}

async function disconnectAndCleanupDatabase() {
  if (databaseCleanupDone) return

  await disconnectPrisma()
  try {
    cleanupTempDatabase()
  } finally {
    databaseCleanupDone = true
  }
}

app.on('window-all-closed', async () => {
  await disconnectAndCleanupDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', (event) => {
  if (databaseCleanupDone) return

  event.preventDefault()
  disconnectAndCleanupDatabase()
    .then(() => app.quit())
    .catch((err) => {
      console.error('Database cleanup failed:', err)
      app.quit()
    })
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  // 4. Content Security Policy (CSP)
  import('electron').then(({ session }) => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const scriptSrc = VITE_DEV_SERVER_URL
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self'"

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;`
          ]
        }
      })
    })
  })

  createWindow()
})

import { PrismaClient } from '@prisma/client'
import { checkDbStatus, setupDatabase, unlockDatabase, encryptTempDatabase, cleanupTempDatabase, getTempDbPath, changePassword } from './crypto'
import { calculateAvailable, IncidentType, validateMasterPassword } from '../src/lib/utils'

let prisma: PrismaClient | null = null
let databaseCleanupDone = false

function sanitizeError(err: unknown): string {
  console.error('IPC Error:', err)
  if (err instanceof Error) {
    if (err.message.startsWith('Invalid ') || err.message === 'No available books for this subject' || err.message === 'Referenced subject does not exist') {
      return err.message
    }
  }
  return 'An unexpected database or server error occurred.'
}

async function initializeDatabase(client: PrismaClient) {
  // Canonical schema representation. Matches prisma/schema.prisma exactly.
  // We use this raw SQL instead of prisma db push so it works reliably in the packaged app.
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

  const configCountRes: any = await client.$queryRawUnsafe('SELECT COUNT(*) as count FROM "AppConfig"')
  const configCount = Number(configCountRes[0]?.count || 0)
  if (configCount === 0) {
    const now = new Date().toISOString()
    await client.$executeRawUnsafe(
      `INSERT INTO "AppConfig" ("id", "autoBackupEnabled", "autoBackupIntervalHours", "lanSyncEnabled", "lanPort", "lanPasscode", "updatedAt") VALUES (1, 0, 24, 0, 8085, 'quantlib-sync', ?)`,
      now
    )
  }

  const ruleCountRes: any = await client.$queryRawUnsafe('SELECT COUNT(*) as count FROM "BorrowingRule"')
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


async function openPrismaDatabase() {
  await disconnectPrisma()
  process.env.DATABASE_URL = `file:${getTempDbPath()}`
  prisma = new PrismaClient()
  await initializeDatabase(prisma)
  encryptTempDatabase()

  startAutoBackupScheduler()

  try {
    if (prisma && (prisma as any).appConfig) {
      const config: any = await (prisma as any).appConfig.findUnique({ where: { id: 1 } })
      if (config && config.lanSyncEnabled) {
        startLanSyncServer(config.lanPort || 8085, config.lanPasscode || 'quantlib-sync')
      }
    }
  } catch (err) {
    console.error('Failed to start LAN sync server on launch:', err)
  }
}

function ensureDb() {
  if (!prisma) throw new Error("Database is locked. Please authenticate first.")
}

// Auth Handlers
ipcMain.handle('check-db-status', () => {
  return checkDbStatus()
})

ipcMain.handle('setup-db', async (_, password) => {
  const pwdError = validateMasterPassword(password)
  if (pwdError) return { success: false, error: pwdError }

  const result = setupDatabase(password)
  if (result.success) {
    try {
      await openPrismaDatabase()
    } catch (err: unknown) {
      await disconnectPrisma()
      return { success: false, error: sanitizeError(err) }
    }
  }
  return result
})

const unlockAttempts = new Map<string, { attempts: number, nextAllowedTime: number }>()

ipcMain.handle('unlock-db', async (_, { password, isRecovery = false }) => {
  const key = isRecovery ? 'recovery' : 'password'
  const state = unlockAttempts.get(key) || { attempts: 0, nextAllowedTime: 0 }
  
  if (Date.now() < state.nextAllowedTime) {
    const waitTime = Math.ceil((state.nextAllowedTime - Date.now()) / 1000)
    return { success: false, error: `Too many failed attempts. Try again in ${waitTime} seconds.` }
  }

  const result = unlockDatabase(password, isRecovery)
  if (!result.success) {
    state.attempts++
    const backoffSeconds = Math.min(60, Math.pow(2, state.attempts - 1))
    state.nextAllowedTime = Date.now() + backoffSeconds * 1000
    unlockAttempts.set(key, state)
    return { success: false, error: 'Invalid password or recovery key' }
  }
  
  unlockAttempts.delete(key)

  if (result.success) {
    try {
      await openPrismaDatabase()
    } catch (err: unknown) {
      await disconnectPrisma()
      return { success: false, error: sanitizeError(err) }
    }
  }
  return result
})

ipcMain.handle('change-password', (_, { oldPassword, newPassword }) => {
  const pwdError = validateMasterPassword(newPassword)
  if (pwdError) return { success: false, error: pwdError }
  return changePassword(oldPassword, newPassword)
})

// IPC Handlers
ipcMain.handle('get-subjects', async () => {
  try {
    ensureDb(); return { success: true, data: await prisma!.subject.findMany() }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('get-incidents', async () => {
  try {
    ensureDb(); return { success: true, data: await prisma!.incident.findMany({ include: { subject: true }, orderBy: { date: 'desc' } }) }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('get-summary', async () => {
  try {
    ensureDb()

    const [subjects, overdueCount] = await Promise.all([
      prisma!.subject.findMany(),
      prisma!.checkout.count({
        where: { status: 'ACTIVE', dueDate: { lt: new Date() } }
      })
    ])

    const { totalBooks, available, issued, damagedLost } = subjects.reduce((acc, s) => {
      acc.totalBooks += s.openingCount + s.recovered
      acc.issued += s.issued
      acc.damagedLost += s.damaged + s.lost
      acc.available += calculateAvailable(s)
      return acc
    }, { totalBooks: 0, available: 0, issued: 0, damagedLost: 0 })

    return { success: true, data: { totalBooks, available, issued, damagedLost, subjects, overdueCount } }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('add-subject', async (_, data) => {
  try {
    ensureDb()
    if (!data.name || typeof data.name !== 'string') throw new Error('Invalid subject name')
    
    const res = await prisma!.subject.create({ 
      data: {
        name: data.name,
        category: typeof data.category === 'string' ? data.category : 'General',
        openingCount: typeof data.openingCount === 'number' ? data.openingCount : 0
      } 
    })
    encryptTempDatabase()
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

const ALLOWED_INCIDENT_TYPES = Object.values(IncidentType)

ipcMain.handle('add-incident', async (_, data) => {
  try {
    ensureDb()
    if (!data.bookTitle || typeof data.bookTitle !== 'string') throw new Error('Invalid book title')
    if (!ALLOWED_INCIDENT_TYPES.includes(data.type as IncidentType)) throw new Error('Invalid incident type')
    if (data.subjectId && typeof data.subjectId !== 'number') throw new Error('Invalid subject ID')
      
    // Simple transaction to update subject counts and log incident
    const res = await prisma!.$transaction(async (tx) => {
      if (data.subjectId) {
        const subject = await tx.subject.findUnique({ where: { id: data.subjectId } })
        if (!subject) throw new Error('Referenced subject does not exist')
      }

      const incident = await tx.incident.create({ 
        data: {
          type: data.type,
          date: data.date ? new Date(data.date) : new Date(),
          subjectId: data.subjectId || null,
          bookTitle: data.bookTitle,
          condition: data.condition || null,
          comment: data.comment || null,
          reportedBy: data.reportedBy || null,
          responsibleParty: data.responsibleParty || null,
          studentClass: data.studentClass || null,
          actionTaken: data.actionTaken || null
        } 
      })
      
      if (data.subjectId) {
        const updateData: any = {}
        if (data.type === IncidentType.DAMAGED) updateData.damaged = { increment: 1 }
        if (data.type === IncidentType.LOST) updateData.lost = { increment: 1 }
        if (data.type === IncidentType.RECOVERED) updateData.recovered = { increment: 1 }
        
        if (Object.keys(updateData).length > 0) {
          await tx.subject.update({
            where: { id: data.subjectId },
            data: updateData
          })
          
          const field = data.type === IncidentType.DAMAGED ? 'damaged' 
            : data.type === IncidentType.LOST ? 'lost'
            : data.type === IncidentType.RECOVERED ? 'recovered' : null
            
          if (field) {
            await tx.auditLog.create({
              data: {
                subjectId: data.subjectId,
                field: field,
                oldValue: subject[field as keyof typeof subject]!.toString(),
                newValue: (Number(subject[field as keyof typeof subject]) + 1).toString(),
                changedBy: 'LIBRARIAN'
              }
            })
          }
        }
      }
      return incident
    })
    encryptTempDatabase()
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('set-theme', (_, mode) => {
  if (mode !== 'light' && mode !== 'dark') return { success: false, error: 'Invalid theme mode' }
  if (win) {
    win.setTitleBarOverlay({
      color: mode === 'dark' ? '#0f172a' : '#f8fafc',
      symbolColor: mode === 'dark' ? '#ffffff' : '#000000'
    })
  }
})

export function getRuleForClass(
  studentClass: string | null | undefined,
  rules: { roleOrGrade: string; maxBooksAllowed: number; borrowDurationDays: number; finePerDay: number }[]
) {
  const defaultRule = rules.find(r => r.roleOrGrade.toUpperCase() === 'DEFAULT') || {
    roleOrGrade: 'DEFAULT',
    maxBooksAllowed: 2,
    borrowDurationDays: 14,
    finePerDay: 0.0
  }

  if (!studentClass || !studentClass.trim()) {
    return defaultRule
  }

  const normalizedClass = studentClass.trim().toUpperCase()

  // 1. Exact match (case insensitive)
  const exact = rules.find(r => r.roleOrGrade.toUpperCase() === normalizedClass)
  if (exact) return exact

  // 2. Pattern / Range match (e.g. S.1-S.4, S.5-S.6)
  for (const rule of rules) {
    const key = rule.roleOrGrade.toUpperCase()
    if (key.includes('-')) {
      const parts = key.split('-').map(p => p.trim())
      if (parts.length === 2) {
        const [start, end] = parts
        const startMatch = start.match(/^([A-Z.]+)(\d+)$/)
        const endMatch = end.match(/^([A-Z.]+)(\d+)$/)
        const classMatch = normalizedClass.match(/^([A-Z.]+)(\d+)$/)

        if (startMatch && endMatch && classMatch) {
          const [, startPrefix, startNumStr] = startMatch
          const [, endPrefix, endNumStr] = endMatch
          const [, classPrefix, classNumStr] = classMatch

          if (classPrefix === startPrefix && classPrefix === endPrefix) {
            const startNum = parseInt(startNumStr, 10)
            const endNum = parseInt(endNumStr, 10)
            const classNum = parseInt(classNumStr, 10)
            if (classNum >= startNum && classNum <= endNum) {
              return rule
            }
          }
        }
      }
    }
    if (key.split(',').map(s => s.trim()).includes(normalizedClass)) {
      return rule
    }
  }

  return defaultRule
}

export async function calculateClearance(studentName: string, studentClass?: string | null) {
  if (!studentName || typeof studentName !== 'string' || !studentName.trim()) {
    throw new Error('Invalid student name')
  }

  const sName = studentName.trim()
  const sClass = studentClass ? studentClass.trim() : null

  // Fetch active checkouts
  const allCheckouts = await prisma!.checkout.findMany({
    where: { status: 'ACTIVE' },
    include: { subject: true }
  })
  const activeCheckouts = allCheckouts.filter(c =>
    c.studentName.trim().toLowerCase() === sName.toLowerCase() &&
    (!sClass || (c.studentClass || '').trim().toLowerCase() === sClass.toLowerCase())
  )

  // Fetch incidents
  const allIncidents = await prisma!.incident.findMany({
    include: { subject: true }
  })
  const studentIncidents = allIncidents.filter(i =>
    i.responsibleParty && i.responsibleParty.trim().toLowerCase() === sName.toLowerCase() &&
    (!sClass || !i.studentClass || i.studentClass.trim().toLowerCase() === sClass.toLowerCase())
  )

  // Unresolved incidents: DAMAGED, LOST, or actionTaken not RESOLVED/PAID
  const unresolvedIncidents = studentIncidents.filter(i => {
    if (i.actionTaken === 'RESOLVED' || i.actionTaken === 'PAID') return false
    return true
  })

  // Get borrowing rules to calculate overdue fines
  const rules = await (prisma as any).borrowingRule.findMany()
  const rule = getRuleForClass(sClass, rules)

  const now = new Date()
  let overdueFines = 0
  for (const checkout of activeCheckouts) {
    if (checkout.dueDate < now) {
      const diffMs = now.getTime() - new Date(checkout.dueDate).getTime()
      const daysOverdue = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      overdueFines += daysOverdue * rule.finePerDay
    }
  }

  let incidentCharges = 0
  for (const incident of unresolvedIncidents) {
    if (incident.type === 'LOST') {
      incidentCharges += 25.0
    } else if (incident.type === 'DAMAGED') {
      incidentCharges += 10.0
    } else {
      incidentCharges += 5.0
    }
  }

  const totalReplacementCharges = overdueFines + incidentCharges
  const isCleared = activeCheckouts.length === 0 && unresolvedIncidents.length === 0
  const status: 'CLEARED' | 'HOLD' = isCleared ? 'CLEARED' : 'HOLD'

  return {
    studentName: sName,
    studentClass: sClass,
    status,
    activeCheckouts,
    incidents: studentIncidents,
    unresolvedIncidents,
    totalReplacementCharges
  }
}

// Checkouts & Overdue Features
ipcMain.handle('add-checkout', async (_, data) => {
  try {
    ensureDb()
    if (!data.subjectId || typeof data.subjectId !== 'number') throw new Error('Invalid subject ID')
    if (!data.studentName || typeof data.studentName !== 'string') throw new Error('Invalid student name')
    
    const studentName = data.studentName.trim()
    const studentClass = data.studentClass ? data.studentClass.trim() : null

    // Get all borrowing rules
    const rules = await (prisma as any).borrowingRule.findMany()
    const rule = getRuleForClass(studentClass, rules)

    const res = await prisma!.$transaction(async (tx) => {
      const subject = await tx.subject.findUnique({ where: { id: data.subjectId } })
      if (!subject) throw new Error('Referenced subject does not exist')
      if (calculateAvailable(subject) <= 0) throw new Error('No available books for this subject')

      // Check active checkout count for studentName & studentClass
      const activeCheckouts = await tx.checkout.count({
        where: {
          studentName: studentName,
          status: 'ACTIVE',
          ...(studentClass ? { studentClass: studentClass } : {})
        }
      })

      if (activeCheckouts >= rule.maxBooksAllowed) {
        throw new Error(`Borrowing limit exceeded: ${studentName} already has ${activeCheckouts} active book(s) checked out (max allowed for ${rule.roleOrGrade}: ${rule.maxBooksAllowed}).`)
      }

      let dueDate: Date
      if (data.dueDate) {
        dueDate = new Date(data.dueDate)
      } else {
        dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + rule.borrowDurationDays)
      }

      const checkout = await tx.checkout.create({ 
        data: {
          subjectId: data.subjectId,
          studentName: studentName,
          studentClass: studentClass,
          dueDate: dueDate,
          conditionOut: typeof data.conditionOut === 'number' ? data.conditionOut : 3,
          status: 'ACTIVE'
        } 
      })
      await tx.subject.update({
        where: { id: data.subjectId },
        data: { issued: { increment: 1 } }
      })
      await tx.auditLog.create({
        data: {
          subjectId: data.subjectId,
          field: 'issued',
          oldValue: subject.issued.toString(),
          newValue: (subject.issued + 1).toString(),
          changedBy: 'LIBRARIAN'
        }
      })
      return checkout
    })
    encryptTempDatabase()
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

// Borrowing Rules Handlers
ipcMain.handle('get-borrowing-rules', async () => {
  try {
    ensureDb()
    const rules = await (prisma as any).borrowingRule.findMany({ orderBy: { id: 'asc' } })
    return { success: true, data: rules }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('save-borrowing-rule', async (_, ruleData) => {
  try {
    ensureDb()
    if (!ruleData.roleOrGrade || typeof ruleData.roleOrGrade !== 'string') throw new Error('Invalid role or grade')
    
    const roleOrGrade = ruleData.roleOrGrade.trim().toUpperCase()
    const maxBooksAllowed = typeof ruleData.maxBooksAllowed === 'number' ? ruleData.maxBooksAllowed : Number(ruleData.maxBooksAllowed || 2)
    const borrowDurationDays = typeof ruleData.borrowDurationDays === 'number' ? ruleData.borrowDurationDays : Number(ruleData.borrowDurationDays || 14)
    const finePerDay = typeof ruleData.finePerDay === 'number' ? ruleData.finePerDay : Number(ruleData.finePerDay || 0.0)

    const res = await (prisma as any).borrowingRule.upsert({
      where: { roleOrGrade },
      update: { maxBooksAllowed, borrowDurationDays, finePerDay },
      create: { roleOrGrade, maxBooksAllowed, borrowDurationDays, finePerDay }
    })
    encryptTempDatabase()
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('delete-borrowing-rule', async (_, data) => {
  try {
    ensureDb()
    const id = typeof data === 'number' ? data : data?.id
    if (!id || typeof id !== 'number') throw new Error('Invalid rule ID')

    const rule = await (prisma as any).borrowingRule.findUnique({ where: { id } })
    if (rule?.roleOrGrade === 'DEFAULT') {
      throw new Error('Cannot delete the DEFAULT borrowing rule')
    }

    await (prisma as any).borrowingRule.delete({ where: { id } })
    encryptTempDatabase()
    return { success: true }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

// Student Clearance Handlers
ipcMain.handle('get-clearance-status', async (_, data) => {
  try {
    ensureDb()
    const { studentName, studentClass } = data || {}
    const result = await calculateClearance(studentName, studentClass)
    return { success: true, data: result }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('generate-clearance-slip', async (_, data) => {
  try {
    ensureDb()
    const { studentName, studentClass } = data || {}
    const clearance = await calculateClearance(studentName, studentClass)

    let school = await prisma!.school.findFirst()
    if (!school) {
      school = {
        id: 1,
        name: 'Mentor High School - Kitende',
        motto: 'Education is the Key',
        logoPath: null,
        address: 'P.O. Box 1234, Kampala',
        contactName: 'Library Dept',
        contactPhone: '+256 700 000 000',
        academicYear: '2026',
        updatedAt: new Date(),
        checkoutDuration: 14
      }
    }

    const decisionText = clearance.status === 'CLEARED'
      ? 'CLEARED - Student has returned all materials and cleared all outstanding obligations.'
      : 'HOLD - Clearance withheld due to outstanding checkouts or unaddressed incidents.'

    const slip = {
      timestamp: new Date().toISOString(),
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

    return { success: true, data: slip }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})


ipcMain.handle('return-checkout', async (_, { id, conditionIn }) => {
  try {
    ensureDb()
    if (typeof id !== 'number') throw new Error('Invalid checkout ID')
    
    const res = await prisma!.$transaction(async (tx) => {
      const checkout = await tx.checkout.update({
        where: { id },
        data: { status: 'RETURNED', returnDate: new Date(), conditionIn: typeof conditionIn === 'number' ? conditionIn : null }
      })
      
      const subject = await tx.subject.findUnique({ where: { id: checkout.subjectId } })
      if (subject) {
        const aggregateStats = await tx.checkout.aggregate({
          where: {
            subjectId: subject.id,
            status: 'RETURNED',
            conditionIn: { not: null }
          },
          _sum: {
            conditionOut: true,
            conditionIn: true
          },
          _count: {
            id: true
          }
        })

        const count = aggregateStats._count.id
        const totalConditionOut = aggregateStats._sum.conditionOut || 0
        const totalConditionIn = aggregateStats._sum.conditionIn || 0
        const totalDegradation = totalConditionOut - totalConditionIn

        const newDegradationRate = count > 0 ? totalDegradation / count : 0
        
        const totalBooks = subject.openingCount + subject.recovered - subject.lost - subject.damaged
        const conditionLoss = (checkout.conditionOut - (conditionIn || checkout.conditionOut))
        const conditionShift = totalBooks > 0 ? (conditionLoss / totalBooks) : conditionLoss
        const newAverageCondition = Math.max(1, subject.averageCondition - conditionShift)
        
        await tx.subject.update({
          where: { id: subject.id },
          data: {
            issued: { decrement: 1 },
            degradationRate: newDegradationRate,
            averageCondition: newAverageCondition
          }
        })
        await tx.auditLog.create({
          data: {
            subjectId: subject.id,
            field: 'issued',
            oldValue: subject.issued.toString(),
            newValue: (subject.issued - 1).toString(),
            changedBy: 'LIBRARIAN'
          }
        })
      }
      return checkout
    })
    encryptTempDatabase()
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('get-overdue-checkouts', async () => {
  try {
    ensureDb()
    const res = await prisma!.checkout.findMany({
      where: { status: 'ACTIVE', dueDate: { lt: new Date() } },
      include: { subject: true },
      orderBy: { dueDate: 'asc' }
    })
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('update-subject', async (_, data) => {
  try {
    ensureDb()
    if (!data.id || typeof data.id !== 'number') throw new Error('Invalid subject ID')
    
    const res = await prisma!.$transaction(async (tx) => {
      const oldSubject = await tx.subject.findUnique({ where: { id: data.id } })
      if (!oldSubject) throw new Error('Referenced subject does not exist')

      const updated = await tx.subject.update({ 
        where: { id: data.id }, 
        data: {
          name: typeof data.data?.name === 'string' ? data.data.name : undefined,
          category: typeof data.data?.category === 'string' ? data.data.category : undefined,
          openingCount: typeof data.data?.openingCount === 'number' ? data.data.openingCount : undefined
        } 
      })
      
      const logs = []
      if (data.data?.name && data.data.name !== oldSubject.name) logs.push({ field: 'name', oldValue: oldSubject.name, newValue: data.data.name })
      if (data.data?.category && data.data.category !== oldSubject.category) logs.push({ field: 'category', oldValue: oldSubject.category || '', newValue: data.data.category })
      if (typeof data.data?.openingCount === 'number' && data.data.openingCount !== oldSubject.openingCount) logs.push({ field: 'openingCount', oldValue: oldSubject.openingCount.toString(), newValue: data.data.openingCount.toString() })
      
      if (logs.length > 0) {
        await tx.auditLog.createMany({
          data: logs.map(l => ({ subjectId: data.id, changedBy: 'LIBRARIAN', ...l }))
        })
      }
      return updated
    })
    encryptTempDatabase()
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('get-audit-logs', async () => {
  try {
    ensureDb()
    const res = await prisma!.auditLog.findMany({
      include: { subject: true },
      orderBy: { changedAt: 'desc' },
      take: 100
    })
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

import fs from 'node:fs'

ipcMain.handle('backup-database', async () => {
  try {
    ensureDb()
    if (!win) return { success: false, error: 'No window available' }
    
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Backup Database',
      defaultPath: 'quantlib_backup.db',
      filters: [
        { name: 'SQLite Database', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (canceled || !filePath) return { success: false, error: 'Backup cancelled' }
    
    const sourceDb = getTempDbPath()
    fs.copyFileSync(sourceDb, filePath)
    
    return { success: true }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

// R2 Analytics & Inventory Control Helper Functions
export function calculateStockAuditDiscrepancy(expectedCount: number, actualCount: number) {
  const exp = Math.max(0, expectedCount)
  const act = Math.max(0, actualCount)
  const discrepancy = act - exp
  return {
    expectedCount: exp,
    actualCount: act,
    discrepancy,
    isMissing: discrepancy < 0,
    isMisplaced: discrepancy > 0,
    discrepancyAmount: Math.abs(discrepancy)
  }
}

export function calculateConditionDecay(averageCondition: number, degradationRate: number, futureCheckouts: number) {
  const currentCondition = Math.max(1.0, Math.min(3.0, averageCondition))
  const rate = degradationRate > 0 ? degradationRate : 0.02
  const projectedCondition = Math.max(1.0, Math.round((currentCondition - rate * futureCheckouts) * 100) / 100)
  const remainingCheckouts = Math.max(0, Math.floor((currentCondition - 1.0) / rate))

  return {
    currentCondition,
    degradationRate: rate,
    futureCheckouts,
    projectedCondition,
    remainingCheckouts
  }
}

export function calculateReplacementCost(
  subjects: Array<{
    id?: number
    name?: string
    category?: string | null
    averageCondition?: number
    degradationRate?: number
    openingCount?: number
    recovered?: number
    damaged?: number
    lost?: number
  }>,
  unitCost: number = 25.0
) {
  let totalCost = 0
  let totalDamaged = 0
  let totalNearEndLife = 0

  const items = subjects.map((sub) => {
    const totalBooks = Math.max(0, (sub.openingCount || 0) + (sub.recovered || 0))
    const damaged = Math.max(0, sub.damaged || 0)
    const lost = Math.max(0, sub.lost || 0)
    const activeAvailable = Math.max(0, totalBooks - damaged - lost)
    const cond = typeof sub.averageCondition === 'number' ? sub.averageCondition : 3.0

    let nearEndLife = 0
    if (cond <= 1.5) {
      nearEndLife = activeAvailable
    } else if (cond < 2.5) {
      const decayRatio = (2.5 - cond) / 1.5
      nearEndLife = Math.floor(activeAvailable * decayRatio)
    }

    const replaceCount = damaged + nearEndLife
    const estimatedCost = Math.round(replaceCount * unitCost * 100) / 100

    totalCost += estimatedCost
    totalDamaged += damaged
    totalNearEndLife += nearEndLife

    return {
      subjectId: sub.id,
      name: sub.name || 'Unknown',
      category: sub.category || 'General',
      totalBooks,
      damagedCount: damaged,
      nearEndLifeCount: nearEndLife,
      replacementCount: replaceCount,
      estimatedCost,
      averageCondition: cond
    }
  })

  const categoryMap = new Map<string, number>()
  for (const item of items) {
    const cat = item.category || 'General'
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + item.estimatedCost)
  }

  const categoryCosts = Array.from(categoryMap.entries()).map(([category, cost]) => ({
    category,
    cost: Math.round(cost * 100) / 100
  }))

  return {
    subjects: items,
    totalReplacementCost: Math.round(totalCost * 100) / 100,
    totalDamaged,
    totalNearEndLife,
    categoryCosts,
    unitCost
  }
}

export function aggregateCirculationTrends(
  checkouts: Array<{
    id?: number
    checkoutDate: Date | string
    returnDate?: Date | string | null
    status?: string
    studentName: string
    studentClass?: string | null
    subject?: { name?: string; category?: string | null } | null
  }>
) {
  const monthsMap = new Map<string, { month: string; checkouts: number; returns: number; timestamp: number }>()
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayMap = new Map<string, number>()
  dayNames.forEach((d) => dayMap.set(d, 0))

  const categoryMap = new Map<string, number>()
  const studentMap = new Map<string, { studentName: string; studentClass: string | null; totalCheckouts: number }>()

  for (const c of checkouts) {
    const cDate = new Date(c.checkoutDate)
    if (isNaN(cDate.getTime())) continue

    const monthKey = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`
    const monthLabel = cDate.toLocaleString('default', { month: 'short', year: 'numeric' })
    if (!monthsMap.has(monthKey)) {
      monthsMap.set(monthKey, {
        month: monthLabel,
        checkouts: 0,
        returns: 0,
        timestamp: new Date(cDate.getFullYear(), cDate.getMonth(), 1).getTime()
      })
    }
    monthsMap.get(monthKey)!.checkouts++

    if (c.returnDate) {
      const rDate = new Date(c.returnDate)
      if (!isNaN(rDate.getTime())) {
        const rMonthKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}`
        const rMonthLabel = rDate.toLocaleString('default', { month: 'short', year: 'numeric' })
        if (!monthsMap.has(rMonthKey)) {
          monthsMap.set(rMonthKey, {
            month: rMonthLabel,
            checkouts: 0,
            returns: 0,
            timestamp: new Date(rDate.getFullYear(), rDate.getMonth(), 1).getTime()
          })
        }
        monthsMap.get(rMonthKey)!.returns++
      }
    }

    const dayName = dayNames[cDate.getDay()]
    dayMap.set(dayName, (dayMap.get(dayName) || 0) + 1)

    const cat = c.subject?.category || 'General'
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1)

    const studentName = (c.studentName || '').trim()
    if (studentName) {
      const key = `${studentName.toLowerCase()}||${(c.studentClass || '').trim().toLowerCase()}`
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          studentName,
          studentClass: c.studentClass ? c.studentClass.trim() : null,
          totalCheckouts: 0
        })
      }
      studentMap.get(key)!.totalCheckouts++
    }
  }

  const monthlyTrends = Array.from(monthsMap.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(({ month, checkouts, returns }) => ({ month, checkouts, returns }))

  const peakDays = Array.from(dayMap.entries()).map(([day, count]) => ({ day, count }))

  const popularCategories = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const topReaders = Array.from(studentMap.values())
    .sort((a, b) => b.totalCheckouts - a.totalCheckouts)
    .slice(0, 10)

  return {
    monthlyTrends,
    peakDays,
    popularCategories,
    topReaders
  }
}

// R2 IPC Handlers
ipcMain.handle('create-stock-audit', async (_, data) => {
  try {
    ensureDb()
    const auditedBy = typeof data?.auditedBy === 'string' ? data.auditedBy : 'LIBRARIAN'
    const notes = typeof data?.notes === 'string' ? data.notes : null

    const subjects = await prisma!.subject.findMany()

    const audit = await prisma!.$transaction(async (tx) => {
      const createdAudit = await tx.stockAudit.create({
        data: {
          auditedBy,
          notes,
          status: 'IN_PROGRESS'
        }
      })

      if (subjects.length > 0) {
        const itemsData = subjects.map(s => {
          const exp = calculateAvailable(s)
          return {
            auditId: createdAudit.id,
            subjectId: s.id,
            expectedCount: exp,
            actualCount: exp,
            discrepancy: 0
          }
        })

        await tx.stockAuditItem.createMany({
          data: itemsData
        })
      }

      return tx.stockAudit.findUnique({
        where: { id: createdAudit.id },
        include: { items: { include: { subject: true } } }
      })
    })

    encryptTempDatabase()
    return { success: true, data: audit }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('save-stock-audit-item', async (_, data) => {
  try {
    ensureDb()
    const { auditId, subjectId, actualCount, notes } = data || {}
    if (!auditId || typeof auditId !== 'number') throw new Error('Invalid audit ID')
    if (!subjectId || typeof subjectId !== 'number') throw new Error('Invalid subject ID')
    if (typeof actualCount !== 'number') throw new Error('Invalid actual count')

    const res = await prisma!.$transaction(async (tx) => {
      const audit = await tx.stockAudit.findUnique({ where: { id: auditId } })
      if (!audit) throw new Error('Stock audit not found')
      if (audit.status === 'COMPLETED') throw new Error('Cannot edit a completed audit')

      const subject = await tx.subject.findUnique({ where: { id: subjectId } })
      if (!subject) throw new Error('Referenced subject does not exist')

      const expectedCount = calculateAvailable(subject)
      const discrepancyInfo = calculateStockAuditDiscrepancy(expectedCount, actualCount)

      const item = await tx.stockAuditItem.upsert({
        where: {
          auditId_subjectId: { auditId, subjectId }
        },
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
          notes: notes !== undefined ? notes : undefined
        },
        include: { subject: true }
      })

      return item
    })

    encryptTempDatabase()
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('complete-stock-audit', async (_, data) => {
  try {
    ensureDb()
    const { auditId, notes } = data || {}
    if (!auditId || typeof auditId !== 'number') throw new Error('Invalid audit ID')

    const res = await prisma!.$transaction(async (tx) => {
      const audit = await tx.stockAudit.findUnique({
        where: { id: auditId },
        include: { items: { include: { subject: true } } }
      })
      if (!audit) throw new Error('Stock audit not found')

      const updatedAudit = await tx.stockAudit.update({
        where: { id: auditId },
        data: {
          status: 'COMPLETED',
          notes: notes !== undefined ? notes : audit.notes,
          updatedAt: new Date()
        },
        include: { items: { include: { subject: true } } }
      })

      let totalExpected = 0
      let totalActual = 0
      let totalDiscrepancy = 0
      let missingItems = 0
      let misplacedItems = 0

      for (const item of updatedAudit.items) {
        totalExpected += item.expectedCount
        totalActual += item.actualCount
        totalDiscrepancy += item.discrepancy
        if (item.discrepancy < 0) missingItems += Math.abs(item.discrepancy)
        if (item.discrepancy > 0) misplacedItems += item.discrepancy
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
      }
    })

    encryptTempDatabase()
    return { success: true, data: res }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('get-stock-audits', async (_, data) => {
  try {
    ensureDb()
    const auditId = typeof data === 'number' ? data : data?.id
    if (auditId && typeof auditId === 'number') {
      const audit = await prisma!.stockAudit.findUnique({
        where: { id: auditId },
        include: { items: { include: { subject: true } } }
      })
      if (!audit) throw new Error('Stock audit not found')

      let totalExpected = 0
      let totalActual = 0
      let totalDiscrepancy = 0
      let missingItems = 0
      let misplacedItems = 0

      for (const item of audit.items) {
        totalExpected += item.expectedCount
        totalActual += item.actualCount
        totalDiscrepancy += item.discrepancy
        if (item.discrepancy < 0) missingItems += Math.abs(item.discrepancy)
        if (item.discrepancy > 0) misplacedItems += item.discrepancy
      }

      return {
        success: true,
        data: {
          ...audit,
          summary: {
            totalSubjects: audit.items.length,
            totalExpected,
            totalActual,
            totalDiscrepancy,
            missingItems,
            misplacedItems
          }
        }
      }
    }

    const audits = await prisma!.stockAudit.findMany({
      include: { items: { include: { subject: true } } },
      orderBy: { auditDate: 'desc' }
    })

    const dataWithSummaries = audits.map(audit => {
      let totalExpected = 0
      let totalActual = 0
      let totalDiscrepancy = 0
      let missingItems = 0
      let misplacedItems = 0

      for (const item of audit.items) {
        totalExpected += item.expectedCount
        totalActual += item.actualCount
        totalDiscrepancy += item.discrepancy
        if (item.discrepancy < 0) missingItems += Math.abs(item.discrepancy)
        if (item.discrepancy > 0) misplacedItems += item.discrepancy
      }

      return {
        ...audit,
        summary: {
          totalSubjects: audit.items.length,
          totalExpected,
          totalActual,
          totalDiscrepancy,
          missingItems,
          misplacedItems
        }
      }
    })

    return { success: true, data: dataWithSummaries }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('get-depreciation-analytics', async () => {
  try {
    ensureDb()
    const subjects = await prisma!.subject.findMany({
      include: { checkouts: true }
    })

    const decayProjections = subjects.map(s => {
      const projections = [0, 10, 25, 50, 100].map(checkouts =>
        calculateConditionDecay(s.averageCondition, s.degradationRate, checkouts)
      )
      const currentDecay = calculateConditionDecay(s.averageCondition, s.degradationRate, 0)

      return {
        subjectId: s.id,
        subjectName: s.name,
        category: s.category || 'General',
        averageCondition: s.averageCondition,
        degradationRate: currentDecay.degradationRate,
        remainingCheckouts: currentDecay.remainingCheckouts,
        projections
      }
    })

    const replacementCostAnalysis = calculateReplacementCost(subjects, 25.0)

    return {
      success: true,
      data: {
        decayProjections,
        replacementCostAnalysis
      }
    }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('get-circulation-insights', async () => {
  try {
    ensureDb()
    const checkouts = await prisma!.checkout.findMany({
      include: { subject: true },
      orderBy: { checkoutDate: 'asc' }
    })

    const insights = aggregateCirculationTrends(checkouts)

    return {
      success: true,
      data: insights
    }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})


// ==========================================
// R3: Auto-Scheduled Backup & LAN Sync Services
// ==========================================

export function formatBackupTimestamp(date: Date = new Date()): string {
  const YYYY = date.getFullYear()
  const MM = String(date.getMonth() + 1).padStart(2, '0')
  const DD = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`
}

export function isBackupDue(lastBackupAt: Date | string | null | undefined, intervalHours: number, now: Date = new Date()): boolean {
  if (!lastBackupAt) return true
  const lastTime = new Date(lastBackupAt).getTime()
  if (isNaN(lastTime)) return true
  const elapsedHours = (now.getTime() - lastTime) / (1000 * 60 * 60)
  return elapsedHours >= intervalHours
}

export function performVaultBackup(targetDir: string, customSourceFile?: string): { success: boolean; backupPath?: string; filename?: string; error?: string } {
  try {
    if (!targetDir || !targetDir.trim()) {
      return { success: false, error: 'Target directory is required' }
    }

    const dirPath = targetDir.trim()
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }

    try { encryptTempDatabase() } catch {}

    const userDataDir = app ? app.getPath('userData') : '/mock/userData'
    const encFile = customSourceFile || path.join(userDataDir, 'quantlib.enc')
    const tempDbFile = path.join(userDataDir, 'quantlib_temp.db')
    const sourceFile = fs.existsSync(encFile) ? encFile : (fs.existsSync(tempDbFile) ? tempDbFile : null)

    if (!sourceFile) {
      return { success: false, error: 'No vault file available to backup' }
    }

    const timestamp = formatBackupTimestamp()
    const ext = sourceFile.endsWith('.enc') ? '.enc' : '.db'
    const filename = `quantlib_backup_${timestamp}${ext}`
    const backupPath = path.join(dirPath, filename)

    fs.copyFileSync(sourceFile, backupPath)
    return { success: true, backupPath, filename }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function listVaultBackups(targetDir?: string): Array<{ filename: string; fullPath: string; sizeBytes: number; createdAt: string }> {
  try {
    const defaultDir = app ? path.join(app.getPath('userData'), 'backups') : '/mock/userData/backups'
    const dirPath = targetDir && targetDir.trim() ? targetDir.trim() : defaultDir
    if (!fs.existsSync(dirPath)) return []

    const files = fs.readdirSync(dirPath)
    const backupFiles = files
      .filter(f => f.startsWith('quantlib_backup_') || f.endsWith('.enc') || f.endsWith('.db'))
      .map(f => {
        const fullPath = path.join(dirPath, f)
        const stat = fs.statSync(fullPath)
        return {
          filename: f,
          fullPath,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString()
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return backupFiles
  } catch (err) {
    console.error('Failed to list backups:', err)
    return []
  }
}

let autoBackupIntervalTimer: NodeJS.Timeout | null = null

export function startAutoBackupScheduler() {
  if (autoBackupIntervalTimer) clearInterval(autoBackupIntervalTimer)

  autoBackupIntervalTimer = setInterval(async () => {
    try {
      if (!prisma || !(prisma as any).appConfig) return
      const config: any = await (prisma as any).appConfig.findUnique({ where: { id: 1 } })
      if (config && config.autoBackupEnabled && config.autoBackupPath) {
        if (isBackupDue(config.lastAutoBackupAt, config.autoBackupIntervalHours)) {
          const result = performVaultBackup(config.autoBackupPath)
          if (result.success) {
            await (prisma as any).appConfig.update({
              where: { id: 1 },
              data: { lastAutoBackupAt: new Date() }
            })
          }
        }
      }
    } catch (err) {
      console.error('Auto backup scheduler error:', err)
    }
  }, 60000)
}

export function stopAutoBackupScheduler() {
  if (autoBackupIntervalTimer) {
    clearInterval(autoBackupIntervalTimer)
    autoBackupIntervalTimer = null
  }
}

export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces()
  for (const devName in interfaces) {
    const iface = interfaces[devName]
    if (!iface) continue
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address
      }
    }
  }
  return '127.0.0.1'
}

export async function packageLanSyncPayload(client: PrismaClient) {
  const [school, subjects, checkouts, incidents, auditLogs, borrowingRules, stockAudits] = await Promise.all([
    client.school.findFirst(),
    client.subject.findMany(),
    client.checkout.findMany(),
    client.incident.findMany(),
    client.auditLog.findMany({ take: 100 }),
    client.borrowingRule.findMany(),
    client.stockAudit.findMany({ include: { items: true } })
  ])

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    school,
    subjects,
    checkouts,
    incidents,
    auditLogs,
    borrowingRules,
    stockAudits
  }
}

export async function mergeLanSyncPayload(client: PrismaClient, payload: any) {
  if (!payload) return { mergedCounts: { subjects: 0, checkouts: 0, incidents: 0, rules: 0 } }

  let subjectsMerged = 0
  let checkoutsMerged = 0
  let incidentsMerged = 0
  let rulesMerged = 0

  await client.$transaction(async (tx) => {
    if (Array.isArray(payload.borrowingRules)) {
      for (const rule of payload.borrowingRules) {
        if (rule.roleOrGrade) {
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
          })
          rulesMerged++
        }
      }
    }

    if (Array.isArray(payload.subjects)) {
      for (const sub of payload.subjects) {
        if (sub.name) {
          const existing = await tx.subject.findUnique({ where: { name: sub.name } })
          if (existing) {
            await tx.subject.update({
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
            })
          } else {
            await tx.subject.create({
              data: {
                name: sub.name,
                category: sub.category || 'General',
                openingCount: sub.openingCount || 0,
                recovered: sub.recovered || 0,
                issued: sub.issued || 0,
                damaged: sub.damaged || 0,
                lost: sub.lost || 0,
                notes: sub.notes || null,
                averageCondition: sub.averageCondition ?? 3.0,
                degradationRate: sub.degradationRate ?? 0.0
              }
            })
          }
          subjectsMerged++
        }
      }
    }

    if (Array.isArray(payload.checkouts)) {
      for (const c of payload.checkouts) {
        if (c.studentName && c.subjectId) {
          const existing = await tx.checkout.findFirst({
            where: {
              studentName: c.studentName,
              subjectId: c.subjectId,
              checkoutDate: new Date(c.checkoutDate)
            }
          })
          if (!existing) {
            await tx.checkout.create({
              data: {
                subjectId: c.subjectId,
                studentName: c.studentName,
                studentClass: c.studentClass || null,
                checkoutDate: new Date(c.checkoutDate),
                dueDate: new Date(c.dueDate),
                returnDate: c.returnDate ? new Date(c.returnDate) : null,
                status: c.status || 'ACTIVE',
                conditionOut: c.conditionOut ?? 3,
                conditionIn: c.conditionIn ?? null
              }
            })
            checkoutsMerged++
          }
        }
      }
    }

    if (Array.isArray(payload.incidents)) {
      for (const inc of payload.incidents) {
        if (inc.bookTitle) {
          const existing = await tx.incident.findFirst({
            where: {
              bookTitle: inc.bookTitle,
              date: new Date(inc.date)
            }
          })
          if (!existing) {
            await tx.incident.create({
              data: {
                type: inc.type,
                date: new Date(inc.date),
                subjectId: inc.subjectId || null,
                bookTitle: inc.bookTitle,
                condition: inc.condition || null,
                comment: inc.comment || null,
                reportedBy: inc.reportedBy || null,
                responsibleParty: inc.responsibleParty || null,
                studentClass: inc.studentClass || null,
                actionTaken: inc.actionTaken || null
              }
            })
            incidentsMerged++
          }
        }
      }
    }
  })

  try { encryptTempDatabase() } catch {}

  return {
    mergedCounts: {
      subjects: subjectsMerged,
      checkouts: checkoutsMerged,
      incidents: incidentsMerged,
      rules: rulesMerged
    }
  }
}

let lanServer: http.Server | null = null
let lanServerPort = 8085
let lanServerPasscode = 'quantlib-sync'

export function getLanServerInstance() {
  return lanServer
}

export function startLanSyncServer(port: number = 8085, passcode: string = 'quantlib-sync') {
  stopLanSyncServer()

  lanServerPort = port
  lanServerPasscode = passcode

  lanServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://localhost:${port}`)

    if (req.method === 'GET' && url.pathname === '/status') {
      res.writeHead(200)
      res.end(JSON.stringify({
        status: 'ok',
        serverName: 'QuantLib LAN Sync',
        port: lanServerPort,
        timestamp: new Date().toISOString()
      }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/sync') {
      let bodyStr = ''
      req.on('data', chunk => { bodyStr += chunk })
      req.on('end', async () => {
        try {
          const body = bodyStr ? JSON.parse(bodyStr) : {}
          const headerPasscode = req.headers['x-sync-passcode'] as string
          const providedPasscode = body.passcode || headerPasscode

          if (lanServerPasscode && providedPasscode !== lanServerPasscode) {
            res.writeHead(401)
            res.end(JSON.stringify({ success: false, error: 'Invalid sync passcode' }))
            return
          }

          if (!prisma) {
            res.writeHead(503)
            res.end(JSON.stringify({ success: false, error: 'Database is locked on server machine' }))
            return
          }

          let mergedCounts = {}
          if (body.payload) {
            const mergeRes = await mergeLanSyncPayload(prisma, body.payload)
            mergedCounts = mergeRes.mergedCounts
          }

          const localPayload = await packageLanSyncPayload(prisma)

          res.writeHead(200)
          res.end(JSON.stringify({
            success: true,
            syncedAt: new Date().toISOString(),
            mergedCounts,
            payload: localPayload
          }))
        } catch (err: unknown) {
          res.writeHead(500)
          res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }))
  })

  lanServer.listen(port, () => {
    console.log(`QuantLib LAN Sync server running on port ${port}`)
  })
}

export function stopLanSyncServer() {
  if (lanServer) {
    try {
      lanServer.close()
    } catch {}
    lanServer = null
  }
}

export async function syncWithLanPeer(peerIp: string, peerPort: number = 8085, passcode: string = 'quantlib-sync') {
  if (!prisma) throw new Error('Database is locked. Please unlock first.')
  if (!peerIp || !peerIp.trim()) throw new Error('Peer IP address is required')

  const cleanIp = peerIp.trim()
  const targetUrl = `http://${cleanIp}:${peerPort}/sync`

  const localPayload = await packageLanSyncPayload(prisma)

  const postData = JSON.stringify({
    passcode,
    payload: localPayload
  })

  return new Promise<{ success: boolean; syncedAt: string; mergedCounts?: any }>((resolve, reject) => {
    const req = http.request(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-sync-passcode': passcode
      },
      timeout: 10000
    }, (res) => {
      let responseText = ''
      res.on('data', chunk => { responseText += chunk })
      res.on('end', async () => {
        try {
          const data = JSON.parse(responseText)
          if (res.statusCode === 200 && data.success) {
            if (data.payload) {
              const mergeRes = await mergeLanSyncPayload(prisma!, data.payload)
              try {
                await (prisma as any).appConfig.update({
                  where: { id: 1 },
                  data: { lastLanSyncAt: new Date() }
                })
              } catch {}
              resolve({
                success: true,
                syncedAt: data.syncedAt || new Date().toISOString(),
                mergedCounts: mergeRes.mergedCounts
              })
            } else {
              resolve({ success: true, syncedAt: new Date().toISOString() })
            }
          } else {
            reject(new Error(data.error || `Sync failed with HTTP ${res.statusCode}`))
          }
        } catch (e: unknown) {
          reject(new Error('Invalid response from LAN peer: ' + (e instanceof Error ? e.message : String(e))))
        }
      })
    })

    req.on('error', (err) => {
      reject(new Error(`Failed to connect to peer at ${cleanIp}:${peerPort} - ${err.message}`))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`Connection to peer ${cleanIp}:${peerPort} timed out`))
    })

    req.write(postData)
    req.end()
  })
}

// IPC Handlers for Auto-Backup & LAN Sync
ipcMain.handle('get-backup-config', async () => {
  try {
    ensureDb()
    const config = await (prisma as any).appConfig.findUnique({ where: { id: 1 } })
    return { success: true, data: config }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('save-backup-config', async (_, data) => {
  try {
    ensureDb()
    const updated = await (prisma as any).appConfig.update({
      where: { id: 1 },
      data: {
        autoBackupEnabled: typeof data.autoBackupEnabled === 'boolean' ? data.autoBackupEnabled : undefined,
        autoBackupPath: typeof data.autoBackupPath === 'string' ? data.autoBackupPath : undefined,
        autoBackupIntervalHours: typeof data.autoBackupIntervalHours === 'number' ? data.autoBackupIntervalHours : undefined
      }
    })
    return { success: true, data: updated }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('trigger-auto-backup', async (_, customPath) => {
  try {
    ensureDb()
    const config = await (prisma as any).appConfig.findUnique({ where: { id: 1 } })
    const targetPath = customPath || config?.autoBackupPath || path.join(app.getPath('userData'), 'backups')
    const result = performVaultBackup(targetPath)
    if (result.success) {
      await (prisma as any).appConfig.update({
        where: { id: 1 },
        data: { lastAutoBackupAt: new Date() }
      })
    }
    return result
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('list-backups', async () => {
  try {
    ensureDb()
    const config = await (prisma as any).appConfig.findUnique({ where: { id: 1 } })
    const targetDir = config?.autoBackupPath || path.join(app.getPath('userData'), 'backups')
    const list = listVaultBackups(targetDir)
    return { success: true, data: list }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('get-lan-sync-config', async () => {
  try {
    ensureDb()
    const config = await (prisma as any).appConfig.findUnique({ where: { id: 1 } })
    const localIp = getLocalIpAddress()
    return {
      success: true,
      data: {
        lanSyncEnabled: config?.lanSyncEnabled ?? false,
        lanPort: config?.lanPort ?? 8085,
        lanPasscode: config?.lanPasscode ?? 'quantlib-sync',
        lastLanSyncAt: config?.lastLanSyncAt ?? null,
        localIp,
        isServerRunning: !!lanServer
      }
    }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('save-lan-sync-config', async (_, data) => {
  try {
    ensureDb()
    const updated = await (prisma as any).appConfig.update({
      where: { id: 1 },
      data: {
        lanSyncEnabled: typeof data.lanSyncEnabled === 'boolean' ? data.lanSyncEnabled : undefined,
        lanPort: typeof data.lanPort === 'number' ? data.lanPort : undefined,
        lanPasscode: typeof data.lanPasscode === 'string' ? data.lanPasscode : undefined
      }
    })

    if (updated.lanSyncEnabled) {
      startLanSyncServer(updated.lanPort, updated.lanPasscode || 'quantlib-sync')
    } else {
      stopLanSyncServer()
    }

    return { success: true, data: updated }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('sync-with-lan-peer', async (_, { peerIp, peerPort, passcode }) => {
  try {
    ensureDb()
    const config = await (prisma as any).appConfig.findUnique({ where: { id: 1 } })
    const port = peerPort || config?.lanPort || 8085
    const code = passcode || config?.lanPasscode || 'quantlib-sync'
    const result = await syncWithLanPeer(peerIp, port, code)
    return { success: true, data: result }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})

ipcMain.handle('get-lan-status', async () => {
  try {
    ensureDb()
    const config = await (prisma as any).appConfig.findUnique({ where: { id: 1 } })
    const localIp = getLocalIpAddress()
    return {
      success: true,
      data: {
        isServerRunning: !!lanServer,
        localIp,
        port: config?.lanPort || 8085,
        lanSyncEnabled: config?.lanSyncEnabled || false,
        lastLanSyncAt: config?.lastLanSyncAt || null
      }
    }
  } catch (err: unknown) { return { success: false, error: sanitizeError(err) } }
})


