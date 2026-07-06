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

      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw mockError
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      cleanupTempDatabase()

      expect(fs.unlinkSync).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('Cleanup failed:', mockError)
    })
  })
})
