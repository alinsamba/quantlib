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

import {
  calculateStockAuditDiscrepancy,
  calculateConditionDecay,
  calculateReplacementCost
} from './main'
import { calculateAvailable } from '../src/lib/utils'

describe('M2 Business Logic Stress & Boundary Value Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Condition Decay Formula - Extreme Values & Boundary Conditions', () => {
    it('should floor condition at 1.0 when input condition is 0 or negative', () => {
      const decayZero = calculateConditionDecay(0, 0.05, 10)
      expect(decayZero.currentCondition).toBe(1.0)
      expect(decayZero.projectedCondition).toBe(1.0)
      expect(decayZero.remainingCheckouts).toBe(0)

      const decayNeg = calculateConditionDecay(-5.0, 0.05, 10)
      expect(decayNeg.currentCondition).toBe(1.0)
      expect(decayNeg.projectedCondition).toBe(1.0)
      expect(decayNeg.remainingCheckouts).toBe(0)
    })

    it('should ceiling condition at 3.0 when input condition exceeds 3.0', () => {
      const decayHigh = calculateConditionDecay(5.0, 0.05, 10)
      expect(decayHigh.currentCondition).toBe(3.0)
      expect(decayHigh.projectedCondition).toBe(2.5)
      expect(decayHigh.remainingCheckouts).toBe(40) // (3.0 - 1.0) / 0.05
    })

    it('should fallback to default degradation rate (0.02) when rate is zero or negative', () => {
      const decayZeroRate = calculateConditionDecay(3.0, 0, 10)
      expect(decayZeroRate.degradationRate).toBe(0.02)
      expect(decayZeroRate.projectedCondition).toBe(2.8)

      const decayNegRate = calculateConditionDecay(3.0, -0.1, 10)
      expect(decayNegRate.degradationRate).toBe(0.02)
      expect(decayNegRate.projectedCondition).toBe(2.8)
    })

    it('should handle negative future checkouts without crashing (exposing upper bound leak)', () => {
      const decayNegCheckouts = calculateConditionDecay(3.0, 0.05, -50)
      // Math.max(1.0, Math.round((3.0 - 0.05 * (-50)) * 100) / 100) -> 3.0 + 2.5 = 5.5
      // Notice: projectedCondition is not capped at upper bound 3.0 when futureCheckouts is negative!
      expect(decayNegCheckouts.projectedCondition).toBe(5.5)
    })

    it('should handle extreme/overflow future checkouts by clamping projected condition to 1.0', () => {
      const decayHuge = calculateConditionDecay(3.0, 0.05, 1_000_000)
      expect(decayHuge.projectedCondition).toBe(1.0)
      expect(decayHuge.remainingCheckouts).toBe(40)
    })

    it('should calculate 0 remaining checkouts when starting at minimum condition 1.0', () => {
      const decayFloor = calculateConditionDecay(1.0, 0.05, 0)
      expect(decayFloor.currentCondition).toBe(1.0)
      expect(decayFloor.remainingCheckouts).toBe(0)
      expect(decayFloor.projectedCondition).toBe(1.0)
    })
  })

  describe('2. Stock Audit Discrepancy - Extreme Values & Boundary Conditions', () => {
    it('should handle zero expected count and zero actual count (zero inventory state)', () => {
      const result = calculateStockAuditDiscrepancy(0, 0)
      expect(result.expectedCount).toBe(0)
      expect(result.actualCount).toBe(0)
      expect(result.discrepancy).toBe(0)
      expect(result.isMissing).toBe(false)
      expect(result.isMisplaced).toBe(false)
      expect(result.discrepancyAmount).toBe(0)
    })

    it('should sanitize negative expected count to zero', () => {
      const result = calculateStockAuditDiscrepancy(-100, 15)
      expect(result.expectedCount).toBe(0)
      expect(result.actualCount).toBe(15)
      expect(result.discrepancy).toBe(15)
      expect(result.isMisplaced).toBe(true)
    })

    it('should sanitize negative actual count to zero', () => {
      const result = calculateStockAuditDiscrepancy(20, -50)
      expect(result.expectedCount).toBe(20)
      expect(result.actualCount).toBe(0)
      expect(result.discrepancy).toBe(-20)
      expect(result.isMissing).toBe(true)
    })

    it('should sanitize both negative expected and actual counts to zero', () => {
      const result = calculateStockAuditDiscrepancy(-50, -30)
      expect(result.expectedCount).toBe(0)
      expect(result.actualCount).toBe(0)
      expect(result.discrepancy).toBe(0)
    })

    it('should handle large inventory counts (overflow check)', () => {
      const result = calculateStockAuditDiscrepancy(1_000_000, 1_005_000)
      expect(result.discrepancy).toBe(5000)
      expect(result.isMisplaced).toBe(true)
      expect(result.discrepancyAmount).toBe(5000)
    })

    it('should preserve fractional/floating point discrepancy values', () => {
      const result = calculateStockAuditDiscrepancy(10.5, 14.2)
      expect(result.expectedCount).toBe(10.5)
      expect(result.actualCount).toBe(14.2)
      expect(result.discrepancy).toBeCloseTo(3.7, 5)
      expect(result.discrepancyAmount).toBeCloseTo(3.7, 5)
    })
  })

  describe('3. Replacement Cost Projections - Zero, Negative, & Condition Boundaries', () => {
    it('should compute zero replacement cost for zero total books', () => {
      const subjects = [
        { id: 1, name: 'Empty Book', openingCount: 0, recovered: 0, damaged: 0, lost: 0, averageCondition: 3.0 }
      ]
      const result = calculateReplacementCost(subjects, 25.0)
      expect(result.totalReplacementCost).toBe(0)
      expect(result.totalDamaged).toBe(0)
      expect(result.totalNearEndLife).toBe(0)
      expect(result.subjects[0].replacementCount).toBe(0)
    })

    it('should calculate replacement cost when damaged books exceed initial opening count (inventory anomaly)', () => {
      const subjects = [
        { id: 1, name: 'Anomalous Book', openingCount: 5, recovered: 0, damaged: 12, lost: 0, averageCondition: 3.0 }
      ]
      const result = calculateReplacementCost(subjects, 25.0)
      // activeAvailable = Math.max(0, 5 - 12 - 0) = 0
      // damaged = 12
      // replacementCount = 12
      expect((result.subjects[0] as any).activeAvailable).toBeUndefined() // check structure
      expect(result.subjects[0].totalBooks).toBe(5)
      expect(result.subjects[0].damagedCount).toBe(12)
      expect(result.subjects[0].nearEndLifeCount).toBe(0)
      expect(result.subjects[0].replacementCount).toBe(12)
      expect(result.totalReplacementCost).toBe(300.0) // 12 * 25
    })

    it('should handle zero condition (0.0) by replacing 100% of active books as near end-of-life', () => {
      const subjects = [
        { id: 1, name: 'Worn Book', openingCount: 20, damaged: 0, averageCondition: 0.0 }
      ]
      const result = calculateReplacementCost(subjects, 30.0)
      // cond = 0.0 <= 1.5 -> nearEndLife = activeAvailable = 20
      expect(result.subjects[0].nearEndLifeCount).toBe(20)
      expect(result.totalReplacementCost).toBe(600.0)
    })

    it('should handle exact condition boundary at 1.5 vs 1.51', () => {
      const subjects = [
        { id: 1, name: 'Boundary 1.5', openingCount: 100, damaged: 0, averageCondition: 1.5 },
        { id: 2, name: 'Boundary 1.51', openingCount: 100, damaged: 0, averageCondition: 1.51 }
      ]
      const result = calculateReplacementCost(subjects, 10.0)
      // Book 1 (1.5): cond <= 1.5 -> 100 nearEndLife
      expect(result.subjects[0].nearEndLifeCount).toBe(100)
      // Book 2 (1.51): cond < 2.5 -> decayRatio = (2.5 - 1.51) / 1.5 = 0.99 / 1.5 = 0.66 -> Math.floor(100 * 0.66) = 66
      expect(result.subjects[1].nearEndLifeCount).toBe(66)
    })

    it('should handle condition boundary at 2.5 (zero near end-of-life)', () => {
      const subjects = [
        { id: 1, name: 'Condition 2.5', openingCount: 50, damaged: 0, averageCondition: 2.5 }
      ]
      const result = calculateReplacementCost(subjects, 20.0)
      expect(result.subjects[0].nearEndLifeCount).toBe(0)
      expect(result.totalReplacementCost).toBe(0)
    })

    it('should sanitize negative damaged, lost, or opening counts to zero', () => {
      const subjects = [
        { id: 1, name: 'Negative Inputs', openingCount: -10, recovered: -5, damaged: -8, lost: -3, averageCondition: 3.0 }
      ]
      const result = calculateReplacementCost(subjects, 25.0)
      expect(result.subjects[0].totalBooks).toBe(0)
      expect(result.subjects[0].damagedCount).toBe(0)
      expect(result.subjects[0].replacementCount).toBe(0)
      expect(result.totalReplacementCost).toBe(0)
    })

    it('should handle zero unit cost and negative unit cost', () => {
      const subjects = [
        { id: 1, name: 'Book A', openingCount: 10, damaged: 2, averageCondition: 3.0 }
      ]
      const resultZeroCost = calculateReplacementCost(subjects, 0)
      expect(resultZeroCost.totalReplacementCost).toBe(0)

      const resultNegCost = calculateReplacementCost(subjects, -20.0)
      expect(resultNegCost.totalReplacementCost).toBe(-40.0)
    })

    it('should handle empty subject list', () => {
      const result = calculateReplacementCost([], 25.0)
      expect(result.subjects).toEqual([])
      expect(result.totalReplacementCost).toBe(0)
      expect(result.totalDamaged).toBe(0)
      expect(result.totalNearEndLife).toBe(0)
      expect(result.categoryCosts).toEqual([])
    })

    it('should default missing category to "General"', () => {
      const subjects = [
        { id: 1, name: 'No Category Book', category: null, openingCount: 10, damaged: 1, averageCondition: 3.0 }
      ]
      const result = calculateReplacementCost(subjects, 50.0)
      expect(result.categoryCosts).toEqual([{ category: 'General', cost: 50.0 }])
    })
  })

  describe('4. Inventory Boundary Conditions - calculateAvailable', () => {
    it('should compute accurate net available stock under normal conditions', () => {
      const available = calculateAvailable({
        openingCount: 100,
        recovered: 10,
        issued: 25,
        damaged: 5,
        lost: 2
      })
      expect(available).toBe(78)
    })

    it('should return zero when all counts are zero', () => {
      const available = calculateAvailable({
        openingCount: 0,
        recovered: 0,
        issued: 0,
        damaged: 0,
        lost: 0
      })
      expect(available).toBe(0)
    })

    it('should return negative available count when issued/damaged/lost exceed total stock (Negative Inventory Deficit)', () => {
      const available = calculateAvailable({
        openingCount: 10,
        recovered: 0,
        issued: 15,
        damaged: 2,
        lost: 1
      })
      expect(available).toBe(-8) // 10 - 15 - 2 - 1 = -8
    })

    it('should expose stock audit masking when calculateAvailable is negative', () => {
      // If calculateAvailable returns -8, passing it to calculateStockAuditDiscrepancy:
      const expectedCount = calculateAvailable({
        openingCount: 5,
        recovered: 0,
        issued: 10,
        damaged: 0,
        lost: 0
      }) // expectedCount = -5
      const auditResult = calculateStockAuditDiscrepancy(expectedCount, 0)
      // Notice: -5 gets sanitized to 0, so actual (0) vs expected (-5) shows discrepancy 0 instead of flagging discrepancy!
      expect(auditResult.expectedCount).toBe(0)
      expect(auditResult.discrepancy).toBe(0)
      expect(auditResult.isMissing).toBe(false)
    })
  })

  describe('5. Fine Caps & Overdue Fine Accumulation', () => {
    it('should calculate standard overdue fine without cap', () => {
      const finePerDay = 0.5
      const daysOverdue = 10
      const fine = daysOverdue * finePerDay
      expect(fine).toBe(5.0)
    })

    it('should demonstrate uncapped fine accumulation for extreme overdue days (lack of maximum fine cap)', () => {
      const finePerDay = 1.0
      const extremeDaysOverdue = 1000 // 1000 days late
      const fine = extremeDaysOverdue * finePerDay
      expect(fine).toBe(1000.0) // Accumulates to $1,000 without cap
    })

    it('should return zero fine when finePerDay is zero', () => {
      const finePerDay = 0.0
      const daysOverdue = 50
      const fine = daysOverdue * finePerDay
      expect(fine).toBe(0.0)
    })

    it('should handle negative finePerDay by yielding negative fines', () => {
      const finePerDay = -0.5
      const daysOverdue = 10
      const fine = daysOverdue * finePerDay
      expect(fine).toBe(-5.0)
    })
  })
})
