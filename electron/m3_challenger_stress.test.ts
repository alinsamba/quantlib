import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import ts from 'typescript'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), 'quantlib_m3_stress_userdata')),
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
  unlockDatabase: vi.fn(),
  encryptTempDatabase: vi.fn(),
  cleanupTempDatabase: vi.fn(),
  getTempDbPath: vi.fn(() => path.join(os.tmpdir(), 'quantlib_m3_stress_temp.db')),
  changePassword: vi.fn()
}))

import {
  formatBackupTimestamp,
  isBackupDue,
  mergeLanSyncPayload
} from './main'

describe('M3 Empirical Stress Test Suite (Challenger M3)', () => {
  const tempTestDir = path.join(os.tmpdir(), 'quantlib_m3_stress_dir_' + Date.now())
  const sourceVaultFile = path.join(tempTestDir, 'source_quantlib.enc')

  beforeEach(() => {
    vi.clearAllMocks()
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true })
    }
    fs.writeFileSync(sourceVaultFile, 'ENCRYPTED_VAULT_DATA_TEST_12345')
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true })
      }
    } catch {}
  })

  // ==========================================
  // SECTION 1: ESM & TSCONFIG TYPECHECK VERIFICATION
  // ==========================================
  describe('1. ESM Resolution & tsconfig Scope Audit', () => {
    it('should inspect tsconfig.json and verify if electron/ and scripts/ are included in tsc -b references', () => {
      const rootTsConfigPath = path.join(process.cwd(), 'tsconfig.json')
      expect(fs.existsSync(rootTsConfigPath)).toBe(true)

      const rootTsConfig = JSON.parse(fs.readFileSync(rootTsConfigPath, 'utf-8'))
      expect(Array.isArray(rootTsConfig.references)).toBe(true)
      const appTsConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tsconfig.app.json'), 'utf-8'))
      const nodeTsConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tsconfig.node.json'), 'utf-8'))

      const appIncludes: string[] = appTsConfig.include || []
      const nodeIncludes: string[] = nodeTsConfig.include || []

      const electronInApp = appIncludes.some(i => i.includes('electron'))
      const electronInNode = nodeIncludes.some(i => i.includes('electron'))
      const scriptsInApp = appIncludes.some(i => i.includes('scripts'))
      const scriptsInNode = nodeIncludes.some(i => i.includes('scripts'))

      // Document observation: tsconfig.json references tsconfig.app.json (src) & tsconfig.node.json (vite.config.ts)
      // neither electron/ nor scripts/ are included in tsconfig references!
      console.log('TSConfig Inclusion Check:', {
        appIncludes,
        nodeIncludes,
        electronInApp,
        electronInNode,
        scriptsInApp,
        scriptsInNode
      })

      // Assertion: electron/ and scripts/ are NOT currently included in project references for tsc -b
      expect(electronInApp || electronInNode).toBe(false)
      expect(scriptsInApp || scriptsInNode).toBe(false)
    })

    it('should programmatically typecheck electron/ main files using TypeScript Compiler API', () => {
      const filesToTypeCheck = [
        path.join(process.cwd(), 'electron', 'main.ts'),
        path.join(process.cwd(), 'electron', 'preload.ts'),
        path.join(process.cwd(), 'electron', 'crypto.ts')
      ]

      const program = ts.createProgram(filesToTypeCheck, {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true
      })

      const diagnostics = ts.getPreEmitDiagnostics(program)
      const errorMessages = diagnostics.map(d => {
        const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
        if (d.file) {
          const { line, character } = d.file.getLineAndCharacterOfPosition(d.start!)
          return `${d.file.fileName} (${line + 1},${character + 1}): ${message}`
        }
        return message
      })

      console.log(`TypeScript Diagnostics for electron/ (${errorMessages.length} errors found):`)
      if (errorMessages.length > 0) {
        console.log(errorMessages.slice(0, 10).join('\n'))
      }

      // Check if TypeScript compilation succeeded
      expect(errorMessages.length).toBe(0)
    })
  })

  // ==========================================
  // SECTION 2: TIMESTAMP FORMATTER STRESS TESTS
  // ==========================================
  describe('2. Timestamp Formatter Stress Tests', () => {
    it('should format standard date into YYYYMMDD_HHMMSS timestamp string', () => {
      const fixedDate = new Date(2026, 6, 23, 15, 30, 45) // July 23, 2026 15:30:45
      expect(formatBackupTimestamp(fixedDate)).toBe('20260723_153045')
    })

    it('should correctly pad single-digit months, days, hours, minutes, and seconds', () => {
      const singleDigitDate = new Date(2026, 0, 2, 3, 4, 5) // Jan 2, 2026 03:04:05
      expect(formatBackupTimestamp(singleDigitDate)).toBe('20260102_030405')
    })

    it('should handle Epoch timestamp (1970-01-01)', () => {
      const epochDate = new Date(0)
      const formatted = formatBackupTimestamp(epochDate)
      expect(formatted).toMatch(/^19700101_\d{6}$/)
    })

    it('should safely handle when invalid Date is passed to formatBackupTimestamp', () => {
      const invalidDate = new Date(NaN)
      const formatted = formatBackupTimestamp(invalidDate)
      // Robust fix: falls back to current valid timestamp instead of NaNNaNNaN_NaNNaNNaN
      expect(formatted).toMatch(/^\d{8}_\d{6}$/)
    })

    it('should handle year boundaries (Dec 31 23:59:59)', () => {
      const yearEndDate = new Date(2026, 11, 31, 23, 59, 59)
      expect(formatBackupTimestamp(yearEndDate)).toBe('20261231_235959')
    })
  })

  // ==========================================
  // SECTION 3: BACKUP INTERVAL TRIGGER STRESS TESTS
  // ==========================================
  describe('3. Auto-Backup Interval Trigger Stress Tests', () => {
    it('should return true for isBackupDue when lastBackupAt is null, undefined, or empty string', () => {
      expect(isBackupDue(null, 24)).toBe(true)
      expect(isBackupDue(undefined, 24)).toBe(true)
      expect(isBackupDue('', 24)).toBe(true)
    })

    it('should return true for invalid lastBackupAt strings like "invalid-date"', () => {
      expect(isBackupDue('invalid-date', 24)).toBe(true)
      expect(isBackupDue({} as any, 24)).toBe(true)
    })

    it('should evaluate exact interval thresholds correctly', () => {
      const now = new Date('2026-08-06T12:00:00Z')
      const exactly24HoursAgo = new Date('2026-08-05T12:00:00Z')
      const hours23MinsAgo = new Date('2026-08-05T12:01:00Z')
      const hours24Mins01Ago = new Date('2026-08-05T11:59:00Z')

      expect(isBackupDue(exactly24HoursAgo, 24, now)).toBe(true)
      expect(isBackupDue(hours23MinsAgo, 24, now)).toBe(false)
      expect(isBackupDue(hours24Mins01Ago, 24, now)).toBe(true)
    })

    it('should handle negative, zero, and fractional interval hours', () => {
      const now = new Date('2026-08-06T12:00:00Z')
      const hour1Ago = new Date('2026-08-06T11:00:00Z')

      // Zero interval: any past date is due
      expect(isBackupDue(hour1Ago, 0, now)).toBe(true)
      // Negative interval: any past date returns true
      expect(isBackupDue(hour1Ago, -5, now)).toBe(true)
      // Fractional interval (0.5 hour = 30 min): 1 hour ago is due
      expect(isBackupDue(hour1Ago, 0.5, now)).toBe(true)
    })

    it('should handle clock skew into the future gracefully without permanently suppressing backups', () => {
      const now = new Date('2026-08-06T12:00:00Z')
      const futureDate = new Date('2026-08-06T15:00:00Z') // 3 hours in future
      // Clock skew into future triggers backup safely rather than permanently suppressing backups
      expect(isBackupDue(futureDate, 24, now)).toBe(true)
    })

    it('should demonstrate behavior when intervalHours is NaN or string', () => {
      const now = new Date('2026-08-06T12:00:00Z')
      const hours30Ago = new Date('2026-08-05T06:00:00Z')

      // If intervalHours is NaN, elapsedHours >= NaN returns false!
      expect(isBackupDue(hours30Ago, NaN, now)).toBe(false)
      // String coercion: '24' works due to JS comparison coercion
      expect(isBackupDue(hours30Ago, '24' as any, now)).toBe(true)
    })
  })

  // ==========================================
  // SECTION 4: LAN PAYLOAD MERGE CONFLICT RESOLUTION STRESS TESTS
  // ==========================================
  describe('4. LAN Payload Merge Conflict Resolution Stress Tests', () => {
    it('should handle empty, null, or malformed peer payload without crashing', async () => {
      const mockPrisma: any = {}
      const resNull = await mergeLanSyncPayload(mockPrisma, null)
      expect(resNull.mergedCounts).toEqual({ subjects: 0, checkouts: 0, incidents: 0, rules: 0 })

      const resUndefined = await mergeLanSyncPayload(mockPrisma, undefined)
      expect(resUndefined.mergedCounts).toEqual({ subjects: 0, checkouts: 0, incidents: 0, rules: 0 })

      const resEmpty = await mergeLanSyncPayload(mockPrisma, {})
      expect(resEmpty.mergedCounts).toEqual({ subjects: 0, checkouts: 0, incidents: 0, rules: 0 })
    })

    it('should test subject merge conflict resolution (taking max counts)', async () => {
      const peerPayload = {
        subjects: [
          { name: 'Mathematics', openingCount: 20, recovered: 5, issued: 10, damaged: 2, lost: 1 }
        ]
      }

      const existingSubject = {
        id: 1,
        name: 'Mathematics',
        category: 'General',
        openingCount: 10,
        recovered: 2,
        issued: 12, // Local issued is higher
        damaged: 1,
        lost: 0,
        notes: 'Local notes'
      }

      const txMock: any = {
        subject: {
          findUnique: vi.fn().mockResolvedValue(existingSubject),
          update: vi.fn().mockResolvedValue({})
        }
      }

      const mockPrisma: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(txMock))
      }

      const res = await mergeLanSyncPayload(mockPrisma, peerPayload)
      expect(res.mergedCounts.subjects).toBe(1)
      expect(txMock.subject.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          category: 'General',
          openingCount: 20, // Math.max(10, 20) = 20
          recovered: 5,   // Math.max(2, 5) = 5
          issued: 12,      // Math.max(12, 10) = 12
          damaged: 2,     // Math.max(1, 2) = 2
          lost: 1,        // Math.max(0, 1) = 1
          notes: 'Local notes'
        }
      })
    })

    it('should update local checkout status when peer marks checkout as RETURNED', async () => {
      const peerPayload = {
        checkouts: [
          {
            subjectId: 1,
            studentName: 'Alice',
            checkoutDate: '2026-08-01T00:00:00Z',
            dueDate: '2026-08-15T00:00:00Z',
            returnDate: '2026-08-05T00:00:00Z',
            status: 'RETURNED',
            conditionOut: 3,
            conditionIn: 2
          }
        ]
      }

      const existingCheckout = {
        id: 10,
        subjectId: 1,
        studentName: 'Alice',
        checkoutDate: new Date('2026-08-01T00:00:00Z'),
        dueDate: new Date('2026-08-15T00:00:00Z'),
        returnDate: null,
        status: 'ACTIVE',
        conditionOut: 3
      }

      const txMock: any = {
        checkout: {
          findFirst: vi.fn().mockResolvedValue(existingCheckout),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({})
        }
      }

      const mockPrisma: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(txMock))
      }

      const res = await mergeLanSyncPayload(mockPrisma, peerPayload)

      // Verified: mergeLanSyncPayload updates local checkout to RETURNED status
      expect(res.mergedCounts.checkouts).toBe(1)
      expect(txMock.checkout.create).not.toHaveBeenCalled()
      expect(txMock.checkout.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({
          status: 'RETURNED'
        })
      }))
    })

    it('should demonstrate transaction crash if peer checkout has invalid Date string', async () => {
      const peerPayload = {
        checkouts: [
          {
            subjectId: 1,
            studentName: 'Bob',
            checkoutDate: 'invalid-date-string',
            dueDate: '2026-08-10T00:00:00Z'
          }
        ]
      }

      const txMock: any = {
        checkout: {
          findFirst: vi.fn().mockImplementation(() => {
            // new Date('invalid-date-string') produces Invalid Date (NaN)
            const date = new Date('invalid-date-string')
            if (isNaN(date.getTime())) {
              throw new Error('Invalid date value provided to Prisma query')
            }
            return null
          })
        }
      }

      const mockPrisma: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(txMock))
      }

      await expect(mergeLanSyncPayload(mockPrisma, peerPayload)).rejects.toThrow('Invalid date value provided to Prisma query')
    })
  })

  // ==========================================
  // SECTION 5: PAYLOAD SIZE & STRESS CHECKS
  // ==========================================
  describe('5. Payload Size & High Volume Stress Tests', () => {
    it('should process large payload with 1,000 subjects without crashing', async () => {
      const largeSubjects = Array.from({ length: 1000 }, (_, i) => ({
        name: `Subject_${i}`,
        category: 'Test Category',
        openingCount: i,
        recovered: 0,
        issued: 0,
        damaged: 0,
        lost: 0
      }))

      const peerPayload = {
        subjects: largeSubjects
      }

      const txMock: any = {
        subject: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: Math.random(), ...data }))
        }
      }

      const mockPrisma: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(txMock))
      }

      const start = Date.now()
      const res = await mergeLanSyncPayload(mockPrisma, peerPayload)
      const duration = Date.now() - start

      expect(res.mergedCounts.subjects).toBe(1000)
      expect(txMock.subject.create).toHaveBeenCalledTimes(1000)
      console.log(`Merged 1,000 subjects in ${duration}ms`)
    })
  })
})
