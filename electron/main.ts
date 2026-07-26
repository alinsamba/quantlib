import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { disconnectAndCleanupDatabase } from './database'
import { registerAuthHandlers } from './ipc/auth'
import { registerInventoryHandlers } from './ipc/inventory'
import { registerCheckoutHandlers } from './ipc/checkouts'
import { registerAuditHandlers } from './ipc/audits'
import { registerAnalyticsHandlers } from './ipc/analytics'
import { registerBackupAndLanHandlers } from './ipc/backup-lan'

// Re-export domain and utility functions for test compatibility
export { getRuleForClass, calculateClearance } from './ipc/checkouts'
export { calculateStockAuditDiscrepancy } from './ipc/audits'
export {
  calculateConditionDecay,
  calculateReplacementCost,
  aggregateCirculationTrends
} from './ipc/analytics'
export {
  formatBackupTimestamp,
  isBackupDue,
  performVaultBackup,
  listVaultBackups,
  listVaultBackupsSync,
  startAutoBackupScheduler,
  stopAutoBackupScheduler
} from './services/backup'
export {
  getLocalIpAddress,
  packageLanSyncPayload,
  mergeLanSyncPayload,
  startLanSyncServer,
  stopLanSyncServer,
  syncWithLanPeer
} from './services/lan-sync'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null = null

// 1. Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
} else {
  app.on('second-instance', () => {
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
      webSecurity: true
    }
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
    const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
    const isDevServer = VITE_DEV_SERVER_URL && parsedUrl.origin === new URL(VITE_DEV_SERVER_URL).origin

    if (!isLocalFile && !isDevServer) {
      event.preventDefault()
    }
  })

  const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

// Register all IPC Handlers
registerAuthHandlers()
registerInventoryHandlers()
registerCheckoutHandlers()
registerAuditHandlers()
registerAnalyticsHandlers()
registerBackupAndLanHandlers(() => win)

app.on('window-all-closed', async () => {
  await disconnectAndCleanupDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', (event) => {
  event.preventDefault()
  disconnectAndCleanupDatabase()
    .then(() => app.quit())
    .catch((err) => {
      console.error('Database cleanup failed:', err)
      app.quit()
    })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  // Content Security Policy (CSP)
  import('electron').then(({ session }) => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
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
