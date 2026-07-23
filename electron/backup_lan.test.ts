import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), 'quantlib_test_userdata')),
    requestSingleInstanceLock: vi.fn(() => true),
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn().mockReturnValue(Promise.resolve())
  },
  BrowserWindow: vi.fn().mockImplementation(function (this: any) {
    this.removeMenu = vi.fn()
    this.setTitleBarOverlay = vi.fn()
    this.loadURL = vi.fn()
    this.loadFile = vi.fn()
    this.webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      send: vi.fn()
    }
  }),
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: vi.fn()
      }
    }
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  dialog: {
    showSaveDialog: vi.fn()
  }
}))

vi.mock('./crypto', () => ({
  checkDbStatus: vi.fn(),
  setupDatabase: vi.fn(),
  unlockDatabase: vi.fn().mockResolvedValue({ success: true }),
  encryptTempDatabase: vi.fn(),
  cleanupTempDatabase: vi.fn(),
  getTempDbPath: vi.fn(() => path.join(os.tmpdir(), 'quantlib_test_temp.db')),
  changePassword: vi.fn()
}))

import {
  formatBackupTimestamp,
  isBackupDue,
  performVaultBackup,
  listVaultBackups,
  packageLanSyncPayload,
  mergeLanSyncPayload,
  getLocalIpAddress
} from './main'

describe('R3: Vault Backups & LAN Sync Unit & Integration Tests', () => {
  const tempTestDir = path.join(os.tmpdir(), 'quantlib_backup_lan_test_' + Date.now())
  const sourceVaultFile = path.join(tempTestDir, 'source_quantlib.enc')
  const backupTargetDir = path.join(tempTestDir, 'usb_backup_dir')

  beforeEach(() => {
    vi.clearAllMocks()
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true })
    }
    // Create dummy source vault file
    fs.writeFileSync(sourceVaultFile, 'ENCRYPTED_VAULT_DATA_CONTENT_12345')
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true })
      }
    } catch {}
  })

  describe('1. Timestamp Formatting & Backup Interval Checking', () => {
    it('should format date into YYYYMMDD_HHMMSS timestamp string', () => {
      const fixedDate = new Date(2026, 6, 23, 15, 30, 45) // July 23, 2026 15:30:45
      const formatted = formatBackupTimestamp(fixedDate)
      expect(formatted).toBe('20260723_153045')
    })

    it('should return true for isBackupDue if lastAutoBackupAt is null or undefined', () => {
      expect(isBackupDue(null, 24)).toBe(true)
      expect(isBackupDue(undefined, 6)).toBe(true)
    })

    it('should return false if elapsed time is less than specified interval hours', () => {
      const now = new Date('2026-07-23T15:00:00Z')
      const lastBackup = new Date('2026-07-23T10:00:00Z') // 5 hours ago
      expect(isBackupDue(lastBackup, 24, now)).toBe(false)
      expect(isBackupDue(lastBackup, 6, now)).toBe(false)
    })

    it('should return true if elapsed time equals or exceeds specified interval hours', () => {
      const now = new Date('2026-07-23T15:00:00Z')
      const lastBackup = new Date('2026-07-22T14:00:00Z') // 25 hours ago
      expect(isBackupDue(lastBackup, 24, now)).toBe(true)
      expect(isBackupDue(lastBackup, 6, now)).toBe(true)
    })
  })

  describe('2. Vault File Backup & Recent Backup Listing', () => {
    it('should copy encrypted vault file to target path and create directory if missing', () => {
      const res = performVaultBackup(backupTargetDir, sourceVaultFile)
      expect(res.success).toBe(true)
      expect(res.backupPath).toBeDefined()
      expect(fs.existsSync(backupTargetDir)).toBe(true)
      expect(fs.existsSync(res.backupPath!)).toBe(true)
      expect(fs.readFileSync(res.backupPath!, 'utf-8')).toBe('ENCRYPTED_VAULT_DATA_CONTENT_12345')
    })

    it('should return error if target directory is empty or invalid', () => {
      const res = performVaultBackup('')
      expect(res.success).toBe(false)
      expect(res.error).toBe('Target directory is required')
    })

    it('should list all timestamped backup files sorted by creation date descending', () => {
      // Create backup files in backupTargetDir
      performVaultBackup(backupTargetDir, sourceVaultFile)
      const list = listVaultBackups(backupTargetDir)
      expect(list.length).toBeGreaterThan(0)
      expect(list[0].filename).toMatch(/^quantlib_backup_\d{8}_\d{6}\.enc$/)
      expect(list[0].sizeBytes).toBeGreaterThan(0)
    })
  })

  describe('3. Local Network IP Address Resolver', () => {
    it('should return a valid IP address string (IPv4 format or 127.0.0.1)', () => {
      const ip = getLocalIpAddress()
      expect(typeof ip).toBe('string')
      expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
    })
  })

  describe('4. LAN Sync Payload Packaging & Peer Sync Merging', () => {
    it('should package full database payload containing core tables', async () => {
      const mockPrisma: any = {
        school: { findFirst: vi.fn().mockResolvedValue({ name: 'Test School' }) },
        subject: { findMany: vi.fn().mockResolvedValue([{ id: 1, name: 'Mathematics', openingCount: 10 }]) },
        checkout: { findMany: vi.fn().mockResolvedValue([{ id: 10, studentName: 'Alice', status: 'ACTIVE' }]) },
        incident: { findMany: vi.fn().mockResolvedValue([]) },
        auditLog: { findMany: vi.fn().mockResolvedValue([]) },
        borrowingRule: { findMany: vi.fn().mockResolvedValue([{ roleOrGrade: 'DEFAULT', maxBooksAllowed: 2 }]) },
        stockAudit: { findMany: vi.fn().mockResolvedValue([]) }
      }

      const payload = await packageLanSyncPayload(mockPrisma)
      expect(payload.version).toBe('1.0')
      expect(payload.school?.name).toBe('Test School')
      expect(payload.subjects.length).toBe(1)
      expect(payload.checkouts.length).toBe(1)
      expect(payload.borrowingRules.length).toBe(1)
    })

    it('should merge peer payload records into local database cleanly', async () => {
      const peerPayload = {
        version: '1.0',
        subjects: [
          { name: 'Physics', category: 'Sciences', openingCount: 15, recovered: 0, issued: 2, damaged: 0, lost: 0 }
        ],
        checkouts: [
          {
            subjectId: 1,
            studentName: 'Bob',
            studentClass: 'S.4',
            checkoutDate: '2026-07-20T10:00:00Z',
            dueDate: '2026-08-03T10:00:00Z',
            status: 'ACTIVE',
            conditionOut: 3
          }
        ],
        incidents: [],
        borrowingRules: [
          { roleOrGrade: 'S.1-S.4', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.0 }
        ]
      }

      const txMock: any = {
        borrowingRule: { upsert: vi.fn().mockResolvedValue({}) },
        subject: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 2, name: 'Physics' }),
          update: vi.fn().mockResolvedValue({})
        },
        checkout: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 20 })
        },
        incident: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({})
        }
      }

      const mockPrisma: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(txMock))
      }

      const result = await mergeLanSyncPayload(mockPrisma, peerPayload)

      expect(result.mergedCounts.subjects).toBe(1)
      expect(result.mergedCounts.checkouts).toBe(1)
      expect(result.mergedCounts.rules).toBe(1)

      expect(txMock.borrowingRule.upsert).toHaveBeenCalled()
      expect(txMock.subject.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'Physics' }) }))
      expect(txMock.checkout.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ studentName: 'Bob' }) }))
    })
  })
})
