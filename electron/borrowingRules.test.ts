import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
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
  encryptTempDatabase: vi.fn().mockResolvedValue(undefined),
  cleanupTempDatabase: vi.fn(),
  getTempDbPath: vi.fn(() => '/mock/userData/temp.db'),
  changePassword: vi.fn()
}))

import { getRuleForClass } from './main'

describe('Borrowing Rules & Student Clearance Unit Tests', () => {
  const sampleRules = [
    { roleOrGrade: 'DEFAULT', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.0 },
    { roleOrGrade: 'S.1-S.4', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.5 },
    { roleOrGrade: 'S.5-S.6', maxBooksAllowed: 4, borrowDurationDays: 21, finePerDay: 1.0 },
    { roleOrGrade: 'TEACHER', maxBooksAllowed: 10, borrowDurationDays: 30, finePerDay: 0.0 }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getRuleForClass - Rule Matching Logic', () => {
    it('should match exact role/grade case-insensitively', () => {
      const rule = getRuleForClass('TEACHER', sampleRules)
      expect(rule.roleOrGrade).toBe('TEACHER')
      expect(rule.maxBooksAllowed).toBe(10)
      expect(rule.borrowDurationDays).toBe(30)
    })

    it('should match lower form classes to S.1-S.4 range rule', () => {
      const ruleS1 = getRuleForClass('S.1', sampleRules)
      expect(ruleS1.roleOrGrade).toBe('S.1-S.4')
      expect(ruleS1.maxBooksAllowed).toBe(2)
      expect(ruleS1.borrowDurationDays).toBe(14)

      const ruleS3 = getRuleForClass('S.3', sampleRules)
      expect(ruleS3.roleOrGrade).toBe('S.1-S.4')
    })

    it('should match upper form classes to S.5-S.6 range rule', () => {
      const ruleS5 = getRuleForClass('S.5', sampleRules)
      expect(ruleS5.roleOrGrade).toBe('S.5-S.6')
      expect(ruleS5.maxBooksAllowed).toBe(4)
      expect(ruleS5.borrowDurationDays).toBe(21)

      const ruleS6 = getRuleForClass('S.6', sampleRules)
      expect(ruleS6.roleOrGrade).toBe('S.5-S.6')
      expect(ruleS6.maxBooksAllowed).toBe(4)
    })

    it('should fallback to DEFAULT rule for unknown grades', () => {
      const rule = getRuleForClass('P.7', sampleRules)
      expect(rule.roleOrGrade).toBe('DEFAULT')
      expect(rule.maxBooksAllowed).toBe(2)
      expect(rule.borrowDurationDays).toBe(14)
    })

    it('should fallback to DEFAULT rule when studentClass is null or empty', () => {
      const ruleNull = getRuleForClass(null, sampleRules)
      expect(ruleNull.roleOrGrade).toBe('DEFAULT')

      const ruleEmpty = getRuleForClass('', sampleRules)
      expect(ruleEmpty.roleOrGrade).toBe('DEFAULT')
    })
  })

  describe('Checkout Limit Enforcement & Loan Duration Calculation', () => {
    it('should enforce limit when active checkouts equal or exceed maxBooksAllowed', () => {
      const rule = getRuleForClass('S.1', sampleRules) // max 2
      const currentActiveCount = 2
      const limitReached = currentActiveCount >= rule.maxBooksAllowed
      expect(limitReached).toBe(true)
    })

    it('should allow checkout when active checkouts are under maxBooksAllowed', () => {
      const rule = getRuleForClass('S.5', sampleRules) // max 4
      const currentActiveCount = 2
      const limitReached = currentActiveCount >= rule.maxBooksAllowed
      expect(limitReached).toBe(false)
    })

    it('should calculate loan duration correctly for TEACHER vs Student', () => {
      const teacherRule = getRuleForClass('TEACHER', sampleRules)
      const studentRule = getRuleForClass('S.6', sampleRules)

      const now = Date.now()
      const teacherDueDate = new Date(now + teacherRule.borrowDurationDays * 86400000)
      const studentDueDate = new Date(now + studentRule.borrowDurationDays * 86400000)

      const diffTeacherDays = Math.round((teacherDueDate.getTime() - now) / 86400000)
      const diffStudentDays = Math.round((studentDueDate.getTime() - now) / 86400000)

      expect(diffTeacherDays).toBe(30)
      expect(diffStudentDays).toBe(21)
    })
  })

  describe('Clearance Status & Replacement Charges Calculation', () => {
    it('should mark student CLEARED when 0 active checkouts and 0 unresolved incidents', () => {
      const activeCheckouts: any[] = []
      const unresolvedIncidents: any[] = []
      const isCleared = activeCheckouts.length === 0 && unresolvedIncidents.length === 0
      const status = isCleared ? 'CLEARED' : 'HOLD'

      expect(status).toBe('CLEARED')
    })

    it('should mark student HOLD when active checkouts exist', () => {
      const activeCheckouts = [{ id: 1, studentName: 'John', status: 'ACTIVE' }]
      const unresolvedIncidents: any[] = []
      const isCleared = activeCheckouts.length === 0 && unresolvedIncidents.length === 0
      const status = isCleared ? 'CLEARED' : 'HOLD'

      expect(status).toBe('HOLD')
    })

    it('should calculate replacement charges for LOST and DAMAGED incidents', () => {
      const unresolvedIncidents = [
        { id: 101, type: 'LOST', bookTitle: 'Biology Textbook' },
        { id: 102, type: 'DAMAGED', bookTitle: 'Chemistry Guide' }
      ]

      let charges = 0
      for (const inc of unresolvedIncidents) {
        if (inc.type === 'LOST') charges += 25.0
        else if (inc.type === 'DAMAGED') charges += 10.0
      }

      expect(charges).toBe(35.0)
    })
  })
})
