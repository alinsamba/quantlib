import { describe, it, expect, vi } from 'vitest'

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

import { getRuleForClass } from './main'

// Mirror of sanitizeError from main.ts for empirical testing & assertion verification
function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.startsWith('Invalid ') || err.message === 'No available books for this subject' || err.message === 'Referenced subject does not exist') {
      return err.message
    }
  }
  return 'An unexpected database or server error occurred.'
}

// Logic mirror of return-checkout condition loss calculation from main.ts (lines 909-922)
function calculateReturnConditionLoss(conditionOut: number, conditionIn: any, totalBooks: number, currentAvgCondition: number) {
  // Line 904: data.conditionIn = typeof conditionIn === 'number' ? conditionIn : null
  const effectiveConditionIn = typeof conditionIn === 'number' ? conditionIn : null

  // Line 920: const conditionLoss = (checkout.conditionOut - (conditionIn || checkout.conditionOut))
  // Notice JavaScript falsy evaluation for 0, NaN
  const conditionLoss = (conditionOut - (conditionIn || conditionOut))
  const conditionShift = totalBooks > 0 ? (conditionLoss / totalBooks) : conditionLoss
  const newAverageCondition = Math.max(1, currentAvgCondition - conditionShift)

  return {
    effectiveConditionIn,
    conditionLoss,
    conditionShift,
    newAverageCondition
  }
}

describe('M2 Adversarial Stress Testing Suite', () => {

  describe('1. Return Checkout IPC Edge Cases (conditionIn values)', () => {
    const totalBooks = 4
    const conditionOut = 3
    const initialAvgCondition = 3.0

    it('Falsy Zero Bug: conditionIn = 0 is treated as conditionIn = conditionOut (0 degradation)', () => {
      const res = calculateReturnConditionLoss(conditionOut, 0, totalBooks, initialAvgCondition)
      expect(res.effectiveConditionIn).toBe(0)
      // Because 0 || 3 evaluates to 3 in JS:
      // conditionLoss = 3 - (0 || 3) = 3 - 3 = 0!
      expect(res.conditionLoss).toBe(0)
      expect(res.newAverageCondition).toBe(3.0)
    })

    it('Valid Condition: conditionIn = 1 (Damaged) calculates correct degradation', () => {
      const res = calculateReturnConditionLoss(conditionOut, 1, totalBooks, initialAvgCondition)
      expect(res.effectiveConditionIn).toBe(1)
      expect(res.conditionLoss).toBe(2) // 3 - 1 = 2
      expect(res.newAverageCondition).toBe(2.5) // 3.0 - (2 / 4) = 2.5
    })

    it('Valid Condition: conditionIn = 3 (Good) calculates 0 degradation', () => {
      const res = calculateReturnConditionLoss(conditionOut, 3, totalBooks, initialAvgCondition)
      expect(res.effectiveConditionIn).toBe(3)
      expect(res.conditionLoss).toBe(0)
      expect(res.newAverageCondition).toBe(3.0)
    })

    it('Out-of-Bounds Upper: conditionIn = 4 produces negative loss and inflates average condition beyond max 3.0', () => {
      const res = calculateReturnConditionLoss(conditionOut, 4, totalBooks, initialAvgCondition)
      expect(res.effectiveConditionIn).toBe(4)
      expect(res.conditionLoss).toBe(-1) // 3 - 4 = -1
      // 3.0 - (-1/4) = 3.25 > max valid 3.0!
      expect(res.newAverageCondition).toBe(3.25)
    })

    it('Out-of-Bounds Lower: conditionIn = -1 produces excessive condition drop and persists negative value', () => {
      const res = calculateReturnConditionLoss(conditionOut, -1, totalBooks, initialAvgCondition)
      expect(res.effectiveConditionIn).toBe(-1)
      expect(res.conditionLoss).toBe(4) // 3 - (-1) = 4
      expect(res.newAverageCondition).toBe(2.0) // 3.0 - (4/4) = 2.0
    })

    it('NaN Input Flaw: typeof NaN === "number" is true, storing NaN into conditionIn', () => {
      const res = calculateReturnConditionLoss(conditionOut, NaN, totalBooks, initialAvgCondition)
      // typeof NaN === 'number' evaluates to true in JS!
      expect(typeof NaN === 'number').toBe(true)
      expect(res.effectiveConditionIn).toBeNaN()
    })
  })

  describe('2. Checkout Rule Limit Enforcement', () => {
    const rules = [
      { roleOrGrade: 'DEFAULT', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.0 },
      { roleOrGrade: 'S.1-S.4', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.5 },
      { roleOrGrade: 'S.5-S.6', maxBooksAllowed: 4, borrowDurationDays: 21, finePerDay: 1.0 },
      { roleOrGrade: 'TEACHER', maxBooksAllowed: 10, borrowDurationDays: 30, finePerDay: 0.0 }
    ]

    it('should enforce maxBooksAllowed ceiling strictly', () => {
      const s1Rule = getRuleForClass('S.1', rules)
      expect(s1Rule.maxBooksAllowed).toBe(2)

      const activeCount2 = 2
      expect(activeCount2 >= s1Rule.maxBooksAllowed).toBe(true) // Blocked

      const activeCount1 = 1
      expect(activeCount1 >= s1Rule.maxBooksAllowed).toBe(false) // Allowed
    })

    it('Active Overdue Loans Gap: add-checkout does not query or block active overdue checkouts', () => {
      // In main.ts lines 737-743, the query only filters { studentName, status: 'ACTIVE' }
      // It does NOT check dueDate < now or block borrowing when active loans are overdue.
      const mockCheckoutHandlerQuery = (studentName: string, studentClass: string | null) => ({
        where: {
          studentName,
          status: 'ACTIVE',
          ...(studentClass ? { studentClass } : {})
        }
      })

      const query = mockCheckoutHandlerQuery('John Doe', 'S.1')
      expect((query.where as any).dueDate).toBeUndefined()
    })
  })

  describe('3. Error Sanitization (Domain vs Internal Server Errors)', () => {
    it('allows "Invalid..." domain validation errors to pass through', () => {
      const err = new Error('Invalid subject ID')
      expect(sanitizeError(err)).toBe('Invalid subject ID')
    })

    it('allows "No available books..." domain error to pass through', () => {
      const err = new Error('No available books for this subject')
      expect(sanitizeError(err)).toBe('No available books for this subject')
    })

    it('allows "Referenced subject does not exist" domain error to pass through', () => {
      const err = new Error('Referenced subject does not exist')
      expect(sanitizeError(err)).toBe('Referenced subject does not exist')
    })

    it('MASKING BUG: masks "Borrowing limit exceeded" domain error as generic server error', () => {
      const err = new Error('Borrowing limit exceeded: John Doe already has 2 active book(s) checked out.')
      const sanitized = sanitizeError(err)
      // Because it does not start with "Invalid ", it gets converted to generic server error
      expect(sanitized).toBe('An unexpected database or server error occurred.')
    })

    it('MASKING BUG: masks "Cannot delete the DEFAULT borrowing rule" domain error as generic server error', () => {
      const err = new Error('Cannot delete the DEFAULT borrowing rule')
      const sanitized = sanitizeError(err)
      expect(sanitized).toBe('An unexpected database or server error occurred.')
    })

    it('MASKING BUG: masks "Cannot edit a completed audit" domain error as generic server error', () => {
      const err = new Error('Cannot edit a completed audit')
      const sanitized = sanitizeError(err)
      expect(sanitized).toBe('An unexpected database or server error occurred.')
    })

    it('correctly sanitizes raw internal database engine errors to generic message', () => {
      const dbErr = new Error('PrismaClientKnownRequestError: Unique constraint failed on the fields: (`name`)')
      expect(sanitizeError(dbErr)).toBe('An unexpected database or server error occurred.')
    })
  })
})
