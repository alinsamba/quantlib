import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { ensureDb, sanitizeError } from '../database'
import { getTempDbPath } from '../crypto'
import {
  performVaultBackup,
  listVaultBackups,
  startAutoBackupScheduler
} from '../services/backup'
import {
  startLanSyncServer,
  stopLanSyncServer,
  syncWithLanPeer,
  getLocalIpAddress
} from '../services/lan-sync'

function objectsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const headerLine = headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',')
  
  const lines = rows.map(row => {
    return headers.map(header => {
      const val = row[header]
      if (val === null || val === undefined) return '""'
      if (val instanceof Date) return `"${val.toISOString()}"`
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  })
  
  return [headerLine, ...lines].join('\n')
}

export function registerBackupAndLanHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('export-entire-db-csv', async () => {
    try {
      const prisma = ensureDb()
      const win = getMainWindow()
      if (!win) return { success: false, error: 'No active window available' }

      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Select Folder for CSV Database Export',
        properties: ['openDirectory', 'createDirectory']
      })

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, error: 'Export cancelled' }
      }

      const targetDir = filePaths[0]

      const [subjects, checkouts, incidents, rules, audits, auditItems, auditLogs, schools] = await Promise.all([
        prisma.subject.findMany({ orderBy: { id: 'asc' } }),
        prisma.checkout.findMany({ include: { subject: true }, orderBy: { id: 'asc' } }),
        prisma.incident.findMany({ include: { subject: true }, orderBy: { id: 'asc' } }),
        prisma.borrowingRule.findMany({ orderBy: { id: 'asc' } }),
        prisma.stockAudit.findMany({ orderBy: { id: 'asc' } }),
        prisma.stockAuditItem.findMany({ include: { subject: true }, orderBy: { id: 'asc' } }),
        prisma.auditLog.findMany({ include: { subject: true }, orderBy: { id: 'asc' } }),
        prisma.school.findMany({ orderBy: { id: 'asc' } })
      ])

      const flatCheckouts = checkouts.map(c => ({
        id: c.id,
        subjectId: c.subjectId,
        subjectName: c.subject?.name || '',
        studentName: c.studentName,
        studentClass: c.studentClass || '',
        checkoutDate: c.checkoutDate ? new Date(c.checkoutDate).toISOString() : '',
        dueDate: c.dueDate ? new Date(c.dueDate).toISOString() : '',
        returnDate: c.returnDate ? new Date(c.returnDate).toISOString() : '',
        status: c.status,
        conditionOut: c.conditionOut,
        conditionIn: c.conditionIn !== null ? c.conditionIn : '',
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : '',
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : ''
      }))

      const flatIncidents = incidents.map(i => ({
        id: i.id,
        type: i.type,
        date: i.date ? new Date(i.date).toISOString() : '',
        subjectId: i.subjectId || '',
        subjectName: i.subject?.name || '',
        bookTitle: i.bookTitle,
        condition: i.condition || '',
        comment: i.comment || '',
        reportedBy: i.reportedBy || '',
        responsibleParty: i.responsibleParty || '',
        studentClass: i.studentClass || '',
        actionTaken: i.actionTaken || '',
        createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : ''
      }))

      const flatAuditItems = auditItems.map(item => ({
        id: item.id,
        auditId: item.auditId,
        subjectId: item.subjectId,
        subjectName: item.subject?.name || '',
        expectedCount: item.expectedCount,
        actualCount: item.actualCount,
        discrepancy: item.discrepancy,
        notes: item.notes || ''
      }))

      const flatAuditLogs = auditLogs.map(l => ({
        id: l.id,
        subjectId: l.subjectId,
        subjectName: l.subject?.name || '',
        field: l.field,
        oldValue: l.oldValue,
        newValue: l.newValue,
        changedBy: l.changedBy || '',
        changedAt: l.changedAt ? new Date(l.changedAt).toISOString() : ''
      }))

      const tables = [
        { filename: 'quantlib_subjects.csv', data: subjects },
        { filename: 'quantlib_checkouts.csv', data: flatCheckouts },
        { filename: 'quantlib_incidents.csv', data: flatIncidents },
        { filename: 'quantlib_borrowing_rules.csv', data: rules },
        { filename: 'quantlib_stock_audits.csv', data: audits },
        { filename: 'quantlib_stock_audit_items.csv', data: flatAuditItems },
        { filename: 'quantlib_audit_logs.csv', data: flatAuditLogs },
        { filename: 'quantlib_school_info.csv', data: schools }
      ]

      let exportedCount = 0
      for (const t of tables) {
        const csvContent = objectsToCsv(t.data as Record<string, unknown>[])
        const outPath = path.join(targetDir, t.filename)
        fs.writeFileSync(outPath, csvContent, 'utf-8')
        exportedCount++
      }

      return { 
        success: true, 
        data: { 
          targetDir, 
          exportedCount, 
          filenames: tables.map(t => t.filename) 
        } 
      }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('backup-database', async () => {
    try {
      ensureDb()
      const win = getMainWindow()
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
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-backup-config', async () => {
    try {
      const prisma = ensureDb()
      const configRes = await prisma.$queryRawUnsafe<Array<{ autoBackupEnabled: number; autoBackupIntervalHours: number; autoBackupPath: string | null; lastAutoBackupAt: string | null }>>('SELECT autoBackupEnabled, autoBackupIntervalHours, autoBackupPath, lastAutoBackupAt FROM AppConfig WHERE id = 1')
      const config = configRes[0] || {
        autoBackupEnabled: false,
        autoBackupIntervalHours: 24,
        autoBackupPath: null,
        lastAutoBackupAt: null
      }
      return { success: true, data: config }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('save-backup-config', async (_, data) => {
    try {
      const prisma = ensureDb()
      const { autoBackupEnabled, autoBackupPath, autoBackupIntervalHours } = data || {}

      await prisma.$executeRawUnsafe(
        'UPDATE AppConfig SET autoBackupEnabled = ?, autoBackupPath = ?, autoBackupIntervalHours = ?, updatedAt = ? WHERE id = 1',
        autoBackupEnabled ? 1 : 0,
        typeof autoBackupPath === 'string' ? autoBackupPath : null,
        typeof autoBackupIntervalHours === 'number' ? autoBackupIntervalHours : 24,
        new Date().toISOString()
      )

      if (autoBackupEnabled) {
        startAutoBackupScheduler()
      }

      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('trigger-auto-backup', async (_, customPath) => {
    try {
      const prisma = ensureDb()
      const configRes = await prisma.$queryRawUnsafe<Array<{ autoBackupPath: string | null }>>('SELECT autoBackupPath FROM AppConfig WHERE id = 1')
      const targetPath = customPath || configRes[0]?.autoBackupPath || undefined
      const result = performVaultBackup(targetPath || '')
      if (result.success) {
        await prisma.$executeRawUnsafe('UPDATE AppConfig SET lastAutoBackupAt = ? WHERE id = 1', new Date().toISOString())
      }
      return result
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('list-backups', async () => {
    try {
      const prisma = ensureDb()
      const configRes = await prisma.$queryRawUnsafe<Array<{ autoBackupPath: string | null }>>('SELECT autoBackupPath FROM AppConfig WHERE id = 1')
      const targetDir = configRes[0]?.autoBackupPath || undefined
      const list = await listVaultBackups(targetDir || undefined)
      return { success: true, data: list }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-lan-sync-config', async () => {
    try {
      const prisma = ensureDb()
      const configRes = await prisma.$queryRawUnsafe<Array<{ lanSyncEnabled: number; lanPort: number; lanPasscode: string | null; lastLanSyncAt: string | null }>>('SELECT lanSyncEnabled, lanPort, lanPasscode, lastLanSyncAt FROM AppConfig WHERE id = 1')
      const config = configRes[0] || {
        lanSyncEnabled: false,
        lanPort: 8085,
        lanPasscode: 'quantlib-sync',
        lastLanSyncAt: null
      }
      return { success: true, data: config }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('save-lan-sync-config', async (_, data) => {
    try {
      const prisma = ensureDb()
      const { lanSyncEnabled, lanPort, lanPasscode } = data || {}
      const port = typeof lanPort === 'number' ? lanPort : 8085
      const passcode = typeof lanPasscode === 'string' ? lanPasscode : 'quantlib-sync'

      await prisma.$executeRawUnsafe(
        'UPDATE AppConfig SET lanSyncEnabled = ?, lanPort = ?, lanPasscode = ?, updatedAt = ? WHERE id = 1',
        lanSyncEnabled ? 1 : 0,
        port,
        passcode,
        new Date().toISOString()
      )

      if (lanSyncEnabled) {
        startLanSyncServer(port, passcode)
      } else {
        stopLanSyncServer()
      }

      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('sync-with-lan-peer', async (_, { peerIp, peerPort, passcode }) => {
    try {
      ensureDb()
      const res = await syncWithLanPeer(peerIp, peerPort, passcode)
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-lan-status', async () => {
    try {
      ensureDb()
      const localIp = getLocalIpAddress()
      return { success: true, data: { localIp } }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('set-theme', (_, mode) => {
    if (mode !== 'light' && mode !== 'dark') return { success: false, error: 'Invalid theme mode' }
    const win = getMainWindow()
    if (win && typeof win.setTitleBarOverlay === 'function') {
      try {
        win.setTitleBarOverlay({
          color: mode === 'dark' ? '#0f172a' : '#ffffff',
          symbolColor: mode === 'dark' ? '#ffffff' : '#0f172a',
          height: 32
        })
      } catch {}
    }
    return { success: true }
  })
}
