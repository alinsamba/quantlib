import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Mock electron before importing the module under test
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { setupDatabase } from './crypto'

describe('setupDatabase', () => {
  const DATA_DIR = '/mock/userData'
  const META_FILE = path.join(DATA_DIR, 'quantlib.meta')
  const ENC_FILE = path.join(DATA_DIR, 'quantlib.enc')
  const TEMP_DB = path.join(DATA_DIR, 'quantlib_temp.db')
  const LEGACY_DB = path.join(process.cwd(), 'quantlib.db')
  const ENC_TEMP_FILE = path.join(DATA_DIR, 'quantlib.enc.tmp')

  let existsSyncSpy: any
  let writeFileSyncSpy: any
  let copyFileSyncSpy: any
  let renameSyncSpy: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup fs spies
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => Buffer.from('mockdbdata'))
    renameSyncSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {})
    copyFileSyncSpy = vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {})
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Happy path: sets up fresh database', () => {
    existsSyncSpy.mockImplementation((filepath: string) => {
      if (filepath === TEMP_DB) return true // To simulate temp db exists so encryptTempDb works
      return false
    })

    const result = setupDatabase('mypassword')

    expect(result.success).toBe(true)
    expect(result.recoveryKey).toBeDefined()
    expect(typeof result.recoveryKey).toBe('string')

    // Should write to META_FILE
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      META_FILE,
      expect.stringContaining('salt')
    )

    // Should touch TEMP_DB since LEGACY_DB does not exist
    expect(writeFileSyncSpy).toHaveBeenCalledWith(TEMP_DB, '')

    // encryptTempDatabase uses readFileSync to read TEMP_DB and writeFileSync to write ENC_TEMP_FILE, then rename ENC_TEMP_FILE to ENC_FILE
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      ENC_TEMP_FILE,
      expect.any(Buffer)
    )
    expect(renameSyncSpy).toHaveBeenCalledWith(ENC_TEMP_FILE, ENC_FILE)
  })

  it('Error: Database is already set up (META and ENC files exist)', () => {
    existsSyncSpy.mockImplementation((filepath: string) => {
      if (filepath === META_FILE || filepath === ENC_FILE) return true
      return false
    })

    const result = setupDatabase('mypassword')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Database is already set up')
    expect(writeFileSyncSpy).not.toHaveBeenCalled()
  })

  it('Error: Existing database state found (Only META_FILE exists)', () => {
    existsSyncSpy.mockImplementation((filepath: string) => {
      if (filepath === META_FILE) return true
      return false
    })

    const result = setupDatabase('mypassword')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Existing database state found. Unlock or recover the database instead.')
    expect(writeFileSyncSpy).not.toHaveBeenCalled()
  })

  it('Error: Existing database state found (Only ENC_FILE exists)', () => {
    existsSyncSpy.mockImplementation((filepath: string) => {
      if (filepath === ENC_FILE) return true
      return false
    })

    const result = setupDatabase('mypassword')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Existing database state found. Unlock or recover the database instead.')
    expect(writeFileSyncSpy).not.toHaveBeenCalled()
  })

  it('Legacy DB migration: copies existing unencrypted legacy DB to TEMP_DB', () => {
    existsSyncSpy.mockImplementation((filepath: string) => {
      if (filepath === LEGACY_DB) return true
      if (filepath === TEMP_DB) return true // simulate temp_db exists so encryptTempDb works
      return false
    })

    const result = setupDatabase('mypassword')

    expect(result.success).toBe(true)

    // Should copy LEGACY_DB to TEMP_DB
    expect(copyFileSyncSpy).toHaveBeenCalledWith(LEGACY_DB, TEMP_DB)

    // Should rename LEGACY_DB to LEGACY_DB.bak
    expect(renameSyncSpy).toHaveBeenCalledWith(LEGACY_DB, LEGACY_DB + '.bak')

    // Should not write empty string to TEMP_DB
    expect(writeFileSyncSpy).not.toHaveBeenCalledWith(TEMP_DB, '')
  })

  it('Exception handling: catches and returns unexpected errors', () => {
    writeFileSyncSpy.mockImplementation((filepath: string) => {
      if (filepath === META_FILE) {
        throw new Error('Permission denied writing META_FILE')
      }
    })

    const result = setupDatabase('mypassword')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Permission denied writing META_FILE')
  })
})
