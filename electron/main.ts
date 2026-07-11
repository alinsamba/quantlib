import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
}

async function openPrismaDatabase() {
  await disconnectPrisma()
  process.env.DATABASE_URL = `file:${getTempDbPath()}`
  prisma = new PrismaClient()
  await initializeDatabase(prisma)
  encryptTempDatabase()
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

// Checkouts & Overdue Features
ipcMain.handle('add-checkout', async (_, data) => {
  try {
    ensureDb()
    if (!data.subjectId || typeof data.subjectId !== 'number') throw new Error('Invalid subject ID')
    if (!data.studentName || typeof data.studentName !== 'string') throw new Error('Invalid student name')
    
    const res = await prisma!.$transaction(async (tx) => {
      const subject = await tx.subject.findUnique({ where: { id: data.subjectId } })
      if (!subject) throw new Error('Referenced subject does not exist')
      if (calculateAvailable(subject) <= 0) throw new Error('No available books for this subject')

      const checkout = await tx.checkout.create({ 
        data: {
          subjectId: data.subjectId,
          studentName: data.studentName,
          studentClass: data.studentClass || null,
          dueDate: data.dueDate ? new Date(data.dueDate) : new Date(),
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

ipcMain.handle('return-checkout', async (_, { id, conditionIn }) => {
  try {
    ensureDb()
    if (typeof id !== 'number') throw new Error('Invalid checkout ID')
    
    const res = await prisma!.$transaction(async (tx) => {
      const checkout = await tx.checkout.update({
        where: { id },
        data: { status: 'RETURNED', returnDate: new Date(), conditionIn: typeof conditionIn === 'number' ? conditionIn : null }
      })
      
      const subject = await tx.subject.findUnique({ where: { id: checkout.subjectId }, include: { checkouts: true } })
      if (subject) {
        const { totalDegradation, count } = subject.checkouts.reduce((acc: any, c: any) => {
          if (c.status === 'RETURNED' && c.conditionIn !== null) {
            acc.totalDegradation += (c.conditionOut - (c.conditionIn || c.conditionOut))
            acc.count++
          }
          return acc
        }, { totalDegradation: 0, count: 0 })
        
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
