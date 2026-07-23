import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import { cleanupTempDatabase } from './crypto'
import * as cryptoModule from './crypto'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData')
  }
}))

describe('crypto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('cleanupTempDatabase', () => {
    it('should handle fs.unlinkSync error gracefully', () => {
      const mockError = new Error('Permission denied')

      vi.spyOn(cryptoModule, 'encryptTempDatabase').mockImplementation(() => {})
      vi.spyOn(cryptoModule, 'getTempDbPath').mockReturnValue('/mock/userData/quantlib_temp.db')

      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as any)
      vi.spyOn(fs, 'openSync').mockReturnValue(1)
      vi.spyOn(fs, 'writeSync').mockReturnValue(1024)
      vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {})
      vi.spyOn(fs, 'closeSync').mockImplementation(() => {})

      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw mockError
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      cleanupTempDatabase()

      expect(fs.unlinkSync).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete'), mockError)
    })
  })
})
