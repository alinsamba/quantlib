import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
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

export function registerBackupAndLanHandlers(getMainWindow: () => BrowserWindow | null) {
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
    return { success: true }
  })
}
