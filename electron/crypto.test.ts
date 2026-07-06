import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import crypto from 'node:crypto'

// Mock electron app before importing crypto
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mocked/path')
  }
}))

import { unlockDatabase } from './crypto'

describe('unlockDatabase', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return error when masterKey is null (invalid password)', () => {
    // Mock META_FILE to return dummy base64 data
    vi.spyOn(fs, 'readFileSync').mockImplementation((path) => {
      if (path.toString().endsWith('quantlib.meta')) {
        return JSON.stringify({
          salt: Buffer.from('mockSalt').toString('base64'),
          password_payload: Buffer.from('mockPayload').toString('base64')
        })
      }
      return ''
    })

    // Mock pbkdf2Sync to avoid actual computation
    vi.spyOn(crypto, 'pbkdf2Sync').mockReturnValue(Buffer.from('dummyKey'))

    // Mock createDecipheriv to throw an error, simulating a bad password decryption failure
    // This will cause decryptPayload to catch the error and return null, which triggers the 'Invalid password' error
    vi.spyOn(crypto, 'createDecipheriv').mockImplementation(() => {
      throw new Error('Decryption failed')
    })

    const result = unlockDatabase('badpassword')

    expect(result).toEqual({ success: false, error: 'Invalid password or recovery key' })
  })

  it('should return error when ENC_FILE decryption fails (corrupted file)', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation((path) => {
      if (path.toString().endsWith('quantlib.meta')) {
        return JSON.stringify({
          salt: Buffer.from('mockSalt').toString('base64'),
          password_payload: Buffer.from('mockPayload').toString('base64')
        })
      }
      if (path.toString().endsWith('quantlib.enc')) {
        // Return some dummy buffer > 28 bytes so it attempts decryption
        const iv = crypto.randomBytes(12)
        const tag = crypto.randomBytes(16)
        const encrypted = crypto.randomBytes(10)
        return Buffer.concat([iv, tag, encrypted])
      }
      return ''
    })

    vi.spyOn(crypto, 'pbkdf2Sync').mockReturnValue(Buffer.from('dummyKey'))

    let callCount = 0
    vi.spyOn(crypto, 'createDecipheriv').mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First call is for master key decryption (decryptPayload)
        // Return a mock decipher that successfully returns a dummy master key
        return {
          setAuthTag: vi.fn(),
          update: vi.fn().mockReturnValue(Buffer.alloc(32)), // master key size
          final: vi.fn().mockReturnValue(Buffer.alloc(0))
        } as any
      } else {
        // Second call is for ENC_FILE decryption
        // Throw an error to simulate corrupted database file
        throw new Error('Corrupted file')
      }
    })

    const result = unlockDatabase('goodpassword')

    expect(result).toEqual({ success: false, error: 'Corrupted file' })
  })
})
