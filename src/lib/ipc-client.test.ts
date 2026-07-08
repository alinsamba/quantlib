import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from './ipc-client'

describe('ipc-client', () => {
  beforeEach(() => {
    // Reset window.electronAPI before each test
    window.electronAPI = undefined as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('invoke (via db wrappers)', () => {
    it('throws error when window.electronAPI is undefined', async () => {
      await expect(db.getSubjects()).rejects.toThrow('Electron preload is not available. Restart the desktop app with npm run dev.')
    })

    it('unwraps successful response with data property', async () => {
      const mockData = [{ id: 1, name: 'Math' }]
      window.electronAPI = {
        getSubjects: vi.fn().mockResolvedValue({ success: true, data: mockData })
      } as any

      const result = await db.getSubjects()
      expect(result).toEqual(mockData)
      expect(window.electronAPI.getSubjects).toHaveBeenCalledTimes(1)
    })

    it('returns raw response if no data property is present', async () => {
      const mockData = { id: 1, name: 'Math' }
      window.electronAPI = {
        getSubjects: vi.fn().mockResolvedValue(mockData)
      } as any

      const result = await db.getSubjects()
      expect(result).toEqual(mockData)
      expect(window.electronAPI.getSubjects).toHaveBeenCalledTimes(1)
    })

    it('throws error if response indicates failure', async () => {
      const errorMessage = 'Database error'
      window.electronAPI = {
        getSubjects: vi.fn().mockResolvedValue({ success: false, error: errorMessage })
      } as any

      await expect(db.getSubjects()).rejects.toThrow(errorMessage)
    })

    it('passes correct arguments to invoke for parameterized methods', async () => {
      const addData = { name: 'Science' }
      window.electronAPI = {
        addSubject: vi.fn().mockResolvedValue({ success: true, data: { id: 2 } })
      } as any

      await db.addSubject(addData)
      expect(window.electronAPI.addSubject).toHaveBeenCalledWith(addData)
    })

    it('covers other invoke wrappers', async () => {
      window.electronAPI = {
        getIncidents: vi.fn().mockResolvedValue({ success: true }),
        getSummary: vi.fn().mockResolvedValue({ success: true }),
        addIncident: vi.fn().mockResolvedValue({ success: true }),
        updateSubject: vi.fn().mockResolvedValue({ success: true }),
        setTheme: vi.fn().mockResolvedValue({ success: true }),
        addCheckout: vi.fn().mockResolvedValue({ success: true }),
        returnCheckout: vi.fn().mockResolvedValue({ success: true }),
        getOverdueCheckouts: vi.fn().mockResolvedValue({ success: true }),
      } as any

      await db.getIncidents()
      expect(window.electronAPI.getIncidents).toHaveBeenCalled()

      await db.getSummary()
      expect(window.electronAPI.getSummary).toHaveBeenCalled()

      await db.addIncident({ bookId: 1 })
      expect(window.electronAPI.addIncident).toHaveBeenCalledWith({ bookId: 1 })

      await db.updateSubject(1, { name: 'Math' })
      expect(window.electronAPI.updateSubject).toHaveBeenCalledWith({ id: 1, data: { name: 'Math' } })

      await db.setTheme('dark')
      expect(window.electronAPI.setTheme).toHaveBeenCalledWith('dark')

      await db.addCheckout({ bookId: 2 })
      expect(window.electronAPI.addCheckout).toHaveBeenCalledWith({ bookId: 2 })

      await db.returnCheckout(1, 5)
      expect(window.electronAPI.returnCheckout).toHaveBeenCalledWith({ id: 1, conditionIn: 5 })

      await db.getOverdueCheckouts()
      expect(window.electronAPI.getOverdueCheckouts).toHaveBeenCalled()
    })
  })

  describe('auth methods', () => {
    it('checkDbStatus: throws if window.electronAPI is undefined', async () => {
      await expect(db.checkDbStatus()).rejects.toThrow('Electron preload is not available.')
    })

    it('checkDbStatus: returns full response object directly', async () => {
      const mockResponse = { isSetup: true, isLocked: false }
      window.electronAPI = {
        checkDbStatus: vi.fn().mockResolvedValue(mockResponse)
      } as any

      const result = await db.checkDbStatus()
      expect(result).toEqual(mockResponse)
      expect(window.electronAPI.checkDbStatus).toHaveBeenCalledTimes(1)
    })

    it('unlockDb: throws if window.electronAPI is undefined', async () => {
      await expect(db.unlockDb({ password: 'test' })).rejects.toThrow('Electron preload is not available.')
    })

    it('unlockDb: passes correct arguments', async () => {
      const mockResponse = { success: true }
      window.electronAPI = {
        unlockDb: vi.fn().mockResolvedValue(mockResponse)
      } as any

      const result = await db.unlockDb({ password: 'test' })
      expect(result).toEqual(mockResponse)
      expect(window.electronAPI.unlockDb).toHaveBeenCalledWith({ password: 'test' })
    })

    it('setupDb: throws if window.electronAPI is undefined', async () => {
      await expect(db.setupDb('password')).rejects.toThrow('Electron preload is not available.')
    })

    it('setupDb: calls window.electronAPI.setupDb with correct password', async () => {
      const mockResponse = { success: true }
      window.electronAPI = {
        setupDb: vi.fn().mockResolvedValue(mockResponse)
      } as any

      const result = await db.setupDb('secret')
      expect(result).toEqual(mockResponse)
      expect(window.electronAPI.setupDb).toHaveBeenCalledWith('secret')
    })

    it('changePassword: throws if window.electronAPI is undefined', async () => {
      await expect(db.changePassword({ oldPassword: 'old', newPassword: 'new' })).rejects.toThrow('Electron preload is not available.')
    })

    it('changePassword: calls window.electronAPI.changePassword with correct args', async () => {
      const mockResponse = { success: true }
      window.electronAPI = {
        changePassword: vi.fn().mockResolvedValue(mockResponse)
      } as any

      const args = { oldPassword: 'old', newPassword: 'new' }
      const result = await db.changePassword(args)
      expect(result).toEqual(mockResponse)
      expect(window.electronAPI.changePassword).toHaveBeenCalledWith(args)
    })
  })
})
