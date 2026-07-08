import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from './ipc-client'

describe('ipc-client db methods', () => {
  let mockElectronAPI: any

  beforeEach(() => {
    // Reset and setup the window mock before each test
    mockElectronAPI = {
      getSubjects: vi.fn(),
      getIncidents: vi.fn(),
      getSummary: vi.fn(),
      addSubject: vi.fn(),
      addIncident: vi.fn(),
      updateSubject: vi.fn(),
      setTheme: vi.fn(),
      addCheckout: vi.fn(),
      returnCheckout: vi.fn(),
      getOverdueCheckouts: vi.fn(),
      checkDbStatus: vi.fn(),
      setupDb: vi.fn(),
      unlockDb: vi.fn(),
      changePassword: vi.fn(),
    }

    vi.stubGlobal('window', { electronAPI: mockElectronAPI })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('invoke wrapper methods', () => {
    it('throws error when window.electronAPI is undefined', async () => {
      vi.stubGlobal('window', {})
      await expect(db.getSubjects()).rejects.toThrow('Electron preload is not available.')
    })

    it('returns data when success is true and data property exists', async () => {
      mockElectronAPI.getSubjects.mockResolvedValue({ success: true, data: [{ id: 1, name: 'Subject 1' }] })

      const result = await db.getSubjects()

      expect(mockElectronAPI.getSubjects).toHaveBeenCalled()
      expect(result).toEqual([{ id: 1, name: 'Subject 1' }])
    })

    it('returns full response when success is true but no data property exists (though usually unexpected for query, handles correctly)', async () => {
      mockElectronAPI.setTheme.mockResolvedValue({ success: true })

      const result = await db.setTheme('dark')

      expect(mockElectronAPI.setTheme).toHaveBeenCalledWith('dark')
      expect(result).toEqual({ success: true })
    })

    it('throws error when success is false', async () => {
      mockElectronAPI.addSubject.mockResolvedValue({ success: false, error: 'Failed to add subject' })

      await expect(db.addSubject({ name: 'Subject 1' })).rejects.toThrow('Failed to add subject')
      expect(mockElectronAPI.addSubject).toHaveBeenCalledWith({ name: 'Subject 1' })
    })

    it('handles multiple arguments for wrapped methods correctly', async () => {
      mockElectronAPI.updateSubject.mockResolvedValue({ success: true, data: { id: 1 } })

      const result = await db.updateSubject(1, { name: 'Updated Subject' })

      expect(mockElectronAPI.updateSubject).toHaveBeenCalledWith({ id: 1, data: { name: 'Updated Subject' } })
      expect(result).toEqual({ id: 1 })
    })

    it('handles multiple arguments for returnCheckout correctly', async () => {
      mockElectronAPI.returnCheckout.mockResolvedValue({ success: true, data: { id: 1 } })

      await db.returnCheckout(1, 2)

      expect(mockElectronAPI.returnCheckout).toHaveBeenCalledWith({ id: 1, conditionIn: 2 })
    })
  })

  describe('auth and setup methods (no unwrap)', () => {
    it('throws error when window.electronAPI is undefined', async () => {
      vi.stubGlobal('window', {})

      await expect(db.checkDbStatus()).rejects.toThrow('Electron preload is not available.')
      await expect(db.setupDb('pass')).rejects.toThrow('Electron preload is not available.')
      await expect(db.unlockDb({ password: 'pass' })).rejects.toThrow('Electron preload is not available.')
      await expect(db.changePassword({ oldPassword: 'old', newPassword: 'new' })).rejects.toThrow('Electron preload is not available.')
    })

    it('checkDbStatus calls correctly and returns full result', async () => {
      const mockResponse = { status: 'uninitialized' }
      mockElectronAPI.checkDbStatus.mockResolvedValue(mockResponse)

      const result = await db.checkDbStatus()

      expect(mockElectronAPI.checkDbStatus).toHaveBeenCalled()
      expect(result).toBe(mockResponse)
    })

    it('setupDb calls correctly and returns full result', async () => {
      const mockResponse = { success: true }
      mockElectronAPI.setupDb.mockResolvedValue(mockResponse)

      const result = await db.setupDb('mypassword')

      expect(mockElectronAPI.setupDb).toHaveBeenCalledWith('mypassword')
      expect(result).toBe(mockResponse)
    })

    it('unlockDb calls correctly and returns full result', async () => {
      const mockResponse = { success: true }
      mockElectronAPI.unlockDb.mockResolvedValue(mockResponse)

      const result = await db.unlockDb({ password: 'mypassword', isRecovery: false })

      expect(mockElectronAPI.unlockDb).toHaveBeenCalledWith({ password: 'mypassword', isRecovery: false })
      expect(result).toBe(mockResponse)
    })

    it('changePassword calls correctly and returns full result', async () => {
      const mockResponse = { success: true }
      mockElectronAPI.changePassword.mockResolvedValue(mockResponse)

      const result = await db.changePassword({ oldPassword: 'old', newPassword: 'new' })

      expect(mockElectronAPI.changePassword).toHaveBeenCalledWith({ oldPassword: 'old', newPassword: 'new' })
      expect(result).toBe(mockResponse)
    })
  })
})
