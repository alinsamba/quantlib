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
  unlockDatabase: vi.fn().mockResolvedValue({ success: true }),
  encryptTempDatabase: vi.fn(),
  cleanupTempDatabase: vi.fn(),
  getTempDbPath: vi.fn(() => '/mock/userData/temp.db'),
  changePassword: vi.fn()
}))

import {
  calculateStockAuditDiscrepancy,
  calculateConditionDecay,
  calculateReplacementCost,
  aggregateCirculationTrends
} from './main'

describe('R2 Analytics & Stock Audit Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Stock Audit Discrepancy Calculation', () => {
    it('should return zero discrepancy when actual matches expected count', () => {
      const result = calculateStockAuditDiscrepancy(50, 50)
      expect(result.expectedCount).toBe(50)
      expect(result.actualCount).toBe(50)
      expect(result.discrepancy).toBe(0)
      expect(result.isMissing).toBe(false)
      expect(result.isMisplaced).toBe(false)
      expect(result.discrepancyAmount).toBe(0)
    })

    it('should correctly calculate missing stock discrepancy', () => {
      const result = calculateStockAuditDiscrepancy(50, 42)
      expect(result.discrepancy).toBe(-8)
      expect(result.isMissing).toBe(true)
      expect(result.isMisplaced).toBe(false)
      expect(result.discrepancyAmount).toBe(8)
    })

    it('should correctly calculate misplaced or extra stock discrepancy', () => {
      const result = calculateStockAuditDiscrepancy(40, 45)
      expect(result.discrepancy).toBe(5)
      expect(result.isMissing).toBe(false)
      expect(result.isMisplaced).toBe(true)
      expect(result.discrepancyAmount).toBe(5)
    })

    it('should sanitize negative count inputs to zero', () => {
      const result = calculateStockAuditDiscrepancy(-10, -5)
      expect(result.expectedCount).toBe(0)
      expect(result.actualCount).toBe(0)
      expect(result.discrepancy).toBe(0)
    })
  })

  describe('Book Lifespan & Condition Decay Formula', () => {
    it('should project condition decay accurately based on degradation rate', () => {
      // Condition starting at 3.0, degradation rate 0.04 per checkout, after 20 checkouts
      const decay = calculateConditionDecay(3.0, 0.04, 20)
      expect(decay.currentCondition).toBe(3.0)
      expect(decay.degradationRate).toBe(0.04)
      expect(decay.futureCheckouts).toBe(20)
      expect(decay.projectedCondition).toBe(2.2)
    })

    it('should calculate remaining checkouts before reaching damaged threshold (1.0)', () => {
      // (2.5 - 1.0) / 0.05 = 30 checkouts
      const decay = calculateConditionDecay(2.5, 0.05, 0)
      expect(decay.remainingCheckouts).toBe(30)
    })

    it('should cap minimum projected condition at 1.0', () => {
      // 3.0 - 0.10 * 50 = -2.0, but capped at 1.0
      const decay = calculateConditionDecay(3.0, 0.1, 50)
      expect(decay.projectedCondition).toBe(1.0)
      expect(decay.remainingCheckouts).toBe(20)
    })

    it('should fallback to default degradation rate when degradationRate is zero or negative', () => {
      const decay = calculateConditionDecay(3.0, 0.0, 10)
      expect(decay.degradationRate).toBe(0.02)
      expect(decay.projectedCondition).toBe(2.8)
    })
  })

  describe('Replacement Cost Projections', () => {
    it('should compute replacement cost for damaged books at unit cost', () => {
      const sampleSubjects = [
        { id: 1, name: 'Physics S.4', category: 'Science', openingCount: 30, recovered: 0, damaged: 4, lost: 0, averageCondition: 3.0 }
      ]
      const result = calculateReplacementCost(sampleSubjects, 25.0)

      expect(result.totalDamaged).toBe(4)
      expect(result.totalReplacementCost).toBe(100.0) // 4 * 25.0
      expect(result.categoryCosts).toEqual([{ category: 'Science', cost: 100.0 }])
    })

    it('should include near end-of-life books in replacement projections when condition <= 1.5', () => {
      const sampleSubjects = [
        { id: 2, name: 'Chemistry S.5', category: 'Science', openingCount: 20, recovered: 0, damaged: 2, lost: 0, averageCondition: 1.2 }
      ]
      const result = calculateReplacementCost(sampleSubjects, 20.0)

      // Total active available = 20 - 2 = 18. Since avg condition <= 1.5, nearEndLife = 18.
      // Total replacement count = 2 + 18 = 20 books * $20 = $400
      expect(result.subjects[0].nearEndLifeCount).toBe(18)
      expect(result.subjects[0].replacementCount).toBe(20)
      expect(result.totalReplacementCost).toBe(400.0)
    })

    it('should aggregate costs across multiple categories', () => {
      const sampleSubjects = [
        { id: 1, name: 'Biology S.3', category: 'Science', openingCount: 10, damaged: 2, averageCondition: 3.0 },
        { id: 2, name: 'History S.2', category: 'Arts', openingCount: 10, damaged: 3, averageCondition: 3.0 }
      ]
      const result = calculateReplacementCost(sampleSubjects, 30.0)

      expect(result.totalReplacementCost).toBe(150.0) // (2 + 3) * 30.0
      expect(result.categoryCosts).toContainEqual({ category: 'Science', cost: 60.0 })
      expect(result.categoryCosts).toContainEqual({ category: 'Arts', cost: 90.0 })
    })
  })

  describe('Circulation Trends Aggregation', () => {
    const sampleCheckouts = [
      {
        id: 101,
        checkoutDate: '2026-03-02T10:00:00Z', // Monday
        returnDate: '2026-03-10T14:00:00Z',
        status: 'RETURNED',
        studentName: 'Alice N',
        studentClass: 'S.4',
        subject: { category: 'Science' }
      },
      {
        id: 102,
        checkoutDate: '2026-03-02T11:00:00Z', // Monday
        returnDate: null,
        status: 'ACTIVE',
        studentName: 'Alice N',
        studentClass: 'S.4',
        subject: { category: 'Science' }
      },
      {
        id: 103,
        checkoutDate: '2026-03-04T09:00:00Z', // Wednesday
        returnDate: '2026-03-12T10:00:00Z',
        status: 'RETURNED',
        studentName: 'Bob K',
        studentClass: 'S.6',
        subject: { category: 'Mathematics' }
      }
    ]

    it('should aggregate monthly borrowing and return counts correctly', () => {
      const trends = aggregateCirculationTrends(sampleCheckouts)
      expect(trends.monthlyTrends.length).toBeGreaterThan(0)
      const marchTrend = trends.monthlyTrends.find((m) => m.month.includes('Mar'))
      expect(marchTrend).toBeDefined()
      expect(marchTrend?.checkouts).toBe(3)
      expect(marchTrend?.returns).toBe(2)
    })

    it('should aggregate peak borrowing days correctly', () => {
      const trends = aggregateCirculationTrends(sampleCheckouts)
      const monday = trends.peakDays.find((d) => d.day === 'Monday')
      const wednesday = trends.peakDays.find((d) => d.day === 'Wednesday')

      expect(monday?.count).toBe(2)
      expect(wednesday?.count).toBe(1)
    })

    it('should identify popular categories sorted by checkout frequency', () => {
      const trends = aggregateCirculationTrends(sampleCheckouts)
      expect(trends.popularCategories[0].category).toBe('Science')
      expect(trends.popularCategories[0].count).toBe(2)
      expect(trends.popularCategories[1].category).toBe('Mathematics')
      expect(trends.popularCategories[1].count).toBe(1)
    })

    it('should generate top readers leaderboard sorted descending by total checkouts', () => {
      const trends = aggregateCirculationTrends(sampleCheckouts)
      expect(trends.topReaders[0].studentName).toBe('Alice N')
      expect(trends.topReaders[0].totalCheckouts).toBe(2)
      expect(trends.topReaders[1].studentName).toBe('Bob K')
      expect(trends.topReaders[1].totalCheckouts).toBe(1)
    })
  })
})
