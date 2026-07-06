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
    },
  })
  
  win.removeMenu()

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
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()
})

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// IPC Handlers
ipcMain.handle('get-subjects', async () => {
  return await prisma.subject.findMany()
})

ipcMain.handle('get-incidents', async () => {
  return await prisma.incident.findMany({ include: { subject: true }, orderBy: { date: 'desc' } })
})

ipcMain.handle('get-summary', async () => {
  const subjects = await prisma.subject.findMany()
  let totalBooks = 0
  let available = 0
  let issued = 0
  let damagedLost = 0

  subjects.forEach(s => {
    totalBooks += s.openingCount + s.recovered
    issued += s.issued
    damagedLost += s.damaged + s.lost
    available += s.openingCount + s.recovered - s.issued - s.damaged - s.lost
  })

  return { totalBooks, available, issued, damagedLost, subjects }
})

ipcMain.handle('add-subject', async (_, data) => {
  return await prisma.subject.create({ data })
})

ipcMain.handle('add-incident', async (_, data) => {
  // Simple transaction to update subject counts and log incident
  return await prisma.$transaction(async (tx) => {
    const incident = await tx.incident.create({ data })
    if (data.subjectId) {
      const updateData: any = {}
      if (data.type === 'DAMAGED') updateData.damaged = { increment: 1 }
      if (data.type === 'LOST') updateData.lost = { increment: 1 }
      if (data.type === 'RECOVERED') updateData.recovered = { increment: 1 }
      
      if (Object.keys(updateData).length > 0) {
        await tx.subject.update({
          where: { id: data.subjectId },
          data: updateData
        })
      }
    }
    return incident
  })
})
