import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

import { invoke } from '@tauri-apps/api/core'
import { db } from './ipc-client'

describe('Tauri IPC Client (db)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should get subjects successfully via Tauri invoke', async () => {
    const mockSubjects = [
      { id: 1, name: 'Physics S.4', openingCount: 10, recovered: 0, issued: 2, damaged: 0, lost: 0, available: 8 }
    ]
    vi.mocked(invoke).mockResolvedValueOnce({
      success: true,
      data: mockSubjects
    })

    const result = await db.getSubjects()
    expect(invoke).toHaveBeenCalledWith('get_subjects', undefined)
    expect(result).toEqual(mockSubjects)
  })

  it('should throw error when backend returns success: false', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      success: false,
      error: 'Database is locked'
    })

    await expect(db.getSubjects()).rejects.toThrow('Database is locked')
  })

  it('should add checkout with mapped parameters', async () => {
    const mockCheckout = {
      id: 42,
      subjectId: 1,
      studentName: 'John Doe',
      studentClass: 'S.4A',
      status: 'ACTIVE'
    }
    vi.mocked(invoke).mockResolvedValueOnce({
      success: true,
      data: mockCheckout
    })

    const res = await db.addCheckout({
      subjectId: 1,
      studentName: 'John Doe',
      studentClass: 'S.4A',
      dueDate: '2026-09-01T00:00:00Z',
      conditionOut: 3
    })

    expect(invoke).toHaveBeenCalledWith('add_checkout', {
      subjectId: 1,
      studentName: 'John Doe',
      studentClass: 'S.4A',
      dueDate: '2026-09-01T00:00:00Z',
      conditionOut: 3
    })
    expect(res).toEqual(mockCheckout)
  })

  it('should return direct results for vault operations', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('SETUP')
    const status = await db.checkDbStatus()
    expect(status).toBe('SETUP')
    expect(invoke).toHaveBeenCalledWith('check_db_status', undefined)

    vi.mocked(invoke).mockResolvedValueOnce({ success: true, recoveryKey: 'ABCD-1234' })
    const setupRes = await db.setupDb('SecretPass123!')
    expect(setupRes.success).toBe(true)
    expect(setupRes.recoveryKey).toBe('ABCD-1234')
    expect(invoke).toHaveBeenCalledWith('setup_db', { password: 'SecretPass123!' })
  })

  it('should handle stock audit completion', async () => {
    const mockAudit = {
      id: 5,
      status: 'COMPLETED',
      notes: 'Finalized'
    }
    vi.mocked(invoke).mockResolvedValueOnce({
      success: true,
      data: mockAudit
    })

    const res = await db.completeStockAudit({ auditId: 5, notes: 'Finalized' })
    expect(invoke).toHaveBeenCalledWith('complete_stock_audit', { auditId: 5, notes: 'Finalized' })
    expect(res).toEqual(mockAudit)
  })

  it('should handle clearance calculation and waiver operations', async () => {
    const mockClearance = {
      studentName: 'Jane Smith',
      status: 'CLEARED',
      isCleared: true,
      activeCheckouts: [],
      unresolvedIncidents: []
    }
    vi.mocked(invoke).mockResolvedValueOnce({
      success: true,
      data: mockClearance
    })

    const res = await db.getClearanceStatus({ studentName: 'Jane Smith', studentClass: 'S.3B' })
    expect(invoke).toHaveBeenCalledWith('get_clearance_status', { studentName: 'Jane Smith', studentClass: 'S.3B' })
    expect(res.data).toEqual(mockClearance)
  })
})
