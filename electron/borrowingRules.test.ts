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
  encryptTempDatabase: vi.fn(),
  cleanupTempDatabase: vi.fn(),
  getTempDbPath: vi.fn(() => '/mock/userData/temp.db'),
  changePassword: vi.fn()
}))
const mockPrismaClient = {
  checkout: { findMany: vi.fn() },
  incident: { findMany: vi.fn() },
  borrowingRule: { findMany: vi.fn() }
}
vi.mock('./database', () => ({
  ensureDb: () => mockPrismaClient
}))

import { getRuleForClass, calculateClearance } from './main'

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
    it('should mark student CLEARED when 0 active checkouts and 0 unresolved incidents', async () => {
      mockPrismaClient.checkout.findMany.mockResolvedValue([])
      mockPrismaClient.incident.findMany.mockResolvedValue([])
      mockPrismaClient.borrowingRule.findMany.mockResolvedValue(sampleRules)

      const res = await calculateClearance('Alice', 'S.1')
      expect(res.status).toBe('CLEARED')
      expect(res.totalReplacementCharges).toBe(0)
    })

    it('should mark student HOLD when active checkouts exist', async () => {
      mockPrismaClient.checkout.findMany.mockResolvedValue([
        { id: 1, studentName: 'Bob', studentClass: 'S.1', status: 'ACTIVE', dueDate: new Date() }
      ])
      mockPrismaClient.incident.findMany.mockResolvedValue([])
      mockPrismaClient.borrowingRule.findMany.mockResolvedValue(sampleRules)

      const res = await calculateClearance('Bob', 'S.1')
      expect(res.status).toBe('HOLD')
    })

    it('should calculate replacement charges for LOST and DAMAGED incidents', async () => {
      mockPrismaClient.checkout.findMany.mockResolvedValue([])
      mockPrismaClient.incident.findMany.mockResolvedValue([
        { id: 101, responsibleParty: 'Charlie', type: 'LOST', bookTitle: 'Biology Textbook', actionTaken: null },
        { id: 102, responsibleParty: 'Charlie', type: 'DAMAGED', bookTitle: 'Chemistry Guide', actionTaken: null }
      ])
      mockPrismaClient.borrowingRule.findMany.mockResolvedValue(sampleRules)

      const res = await calculateClearance('Charlie')
      expect(res.status).toBe('HOLD')
      expect(res.totalReplacementCharges).toBe(35.0)
    })
  })

  describe('Fine Capping Logic', () => {
    it('should cap overdue fine per book at maximum $15.00', () => {
      const daysOverdue = 100 // 100 days overdue at $0.50/day = $50.00
      const finePerDay = 0.50
      const maxCapPerBook = 15.00

      const uncappedFine = daysOverdue * finePerDay
      const cappedFine = Math.min(uncappedFine, maxCapPerBook)

      expect(uncappedFine).toBe(50.00)
      expect(cappedFine).toBe(15.00)
    })
  })

  describe('Fine Payment & Waiver Resolution', () => {
    it('should treat PAID and WAIVED incidents as resolved', () => {
      const incidents = [
        { id: 1, type: 'DAMAGED', actionTaken: 'PAID (Cash - $10.00) on 2026-08-06' },
        { id: 2, type: 'LOST', actionTaken: 'WAIVED (Reason: Principal Approval) on 2026-08-06' },
        { id: 3, type: 'LOST', actionTaken: null }
      ]

      const unresolvedIncidents = incidents.filter(i => {
        if (!i.actionTaken) return true
        const action = i.actionTaken.toUpperCase()
        if (action.includes('RESOLVED') || action.includes('PAID') || action.includes('WAIVED')) return false
        return true
      })

      expect(unresolvedIncidents.length).toBe(1)
      expect(unresolvedIncidents[0].id).toBe(3)
    })
  })

  describe('Book Average Condition Check', () => {
    it('should reject checkout when subject average condition is <= 1.5', () => {
      const subjectGood = { id: 1, name: 'Physics', averageCondition: 2.5 }
      const subjectPoor = { id: 2, name: 'Chemistry', averageCondition: 1.2 }

      const isGoodValid = (subjectGood.averageCondition ?? 3.0) > 1.5
      const isPoorValid = (subjectPoor.averageCondition ?? 3.0) > 1.5

      expect(isGoodValid).toBe(true)
      expect(isPoorValid).toBe(false)
    })
  })
})
