import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import { checkDbStatus } from './crypto'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/data/dir')
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn()
  }
}))

describe('checkDbStatus', () => {
  let existsSyncMock: any

  beforeEach(() => {
    existsSyncMock = vi.spyOn(fs, 'existsSync')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return "LOCKED" when both META_FILE and ENC_FILE exist', () => {
    existsSyncMock.mockImplementation((path: string) => {
      if (path.endsWith('quantlib.meta')) return true
      if (path.endsWith('quantlib.enc')) return true
      return false
    })

    expect(checkDbStatus()).toBe('LOCKED')
  })

  it('should return "SETUP" when META_FILE is missing', () => {
    existsSyncMock.mockImplementation((path: string) => {
      if (path.endsWith('quantlib.meta')) return false
      if (path.endsWith('quantlib.enc')) return true
      return false
    })

    expect(checkDbStatus()).toBe('SETUP')
  })

  it('should return "SETUP" when ENC_FILE is missing', () => {
    existsSyncMock.mockImplementation((path: string) => {
      if (path.endsWith('quantlib.meta')) return true
      if (path.endsWith('quantlib.enc')) return false
      return false
    })

    expect(checkDbStatus()).toBe('SETUP')
  })

  it('should return "SETUP" when neither file exists', () => {
    existsSyncMock.mockReturnValue(false)

    expect(checkDbStatus()).toBe('SETUP')
  })
})
