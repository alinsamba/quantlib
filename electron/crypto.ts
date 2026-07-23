import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const DATA_DIR = app.getPath('userData')
const META_FILE = path.join(DATA_DIR, 'quantlib.meta')
const ENC_FILE = path.join(DATA_DIR, 'quantlib.enc')
const ENC_BACKUP_FILE = path.join(DATA_DIR, 'quantlib.enc.bak')
const ENC_TEMP_FILE = path.join(DATA_DIR, 'quantlib.enc.tmp')
const TEMP_DB = path.join(DATA_DIR, 'quantlib_temp.db')
const LEGACY_DB = path.join(process.cwd(), 'quantlib.db') // Where prisma was storing it previously

let currentMasterKey: Buffer | null = null

export function getTempDbPath() {
  return TEMP_DB
}

export function checkDbStatus(): 'SETUP' | 'LOCKED' {
  if (fs.existsSync(META_FILE) && fs.existsSync(ENC_FILE)) {
    return 'LOCKED'
  }
  return 'SETUP'
}

function deriveUserKey(password: string, salt: Buffer, iterations: number = 600000): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
}

/**
 * Generates a 12-byte initialization vector where the first byte is set to the provided domain identifier.
 * This ensures distinct IV handling for different key streams, improving cryptographic hygiene.
 */
function generateDistinctIv(domain: number): Buffer {
  const iv = crypto.randomBytes(12)
  iv[0] = domain & 0xFF
  return iv
}

export function setupDatabase(password: string): { success: boolean, recoveryKey?: string, error?: string } {
  try {
    if (checkDbStatus() !== 'SETUP') {
      return { success: false, error: 'Database is already set up' }
    }

    if (fs.existsSync(META_FILE) || fs.existsSync(ENC_FILE)) {
      return { success: false, error: 'Existing database state found. Unlock or recover the database instead.' }
    }

    const salt = crypto.randomBytes(16)
    const masterKey = crypto.randomBytes(32)
    
    // Generate a 16 char recovery key
    const recoveryKey = crypto.randomBytes(8).toString('hex').match(/.{1,4}/g)?.join('-').toUpperCase() || ''
    
    const userKey = deriveUserKey(password, salt)
    const recoveryUserKey = deriveUserKey(recoveryKey, salt)
    
    // Encrypt MasterKey with UserKey
    const iv1 = generateDistinctIv(0)
    const cipher1 = crypto.createCipheriv('aes-256-gcm', userKey, iv1)
    const passPayload = Buffer.concat([cipher1.update(masterKey), cipher1.final()])
    const tag1 = cipher1.getAuthTag()
    
    // Encrypt MasterKey with RecoveryKey
    const iv2 = generateDistinctIv(1)
    const cipher2 = crypto.createCipheriv('aes-256-gcm', recoveryUserKey, iv2)
    const recPayload = Buffer.concat([cipher2.update(masterKey), cipher2.final()])
    const tag2 = cipher2.getAuthTag()
    
    const meta = {
      salt: salt.toString('base64'),
      iterations: 600000,
      password_payload: Buffer.concat([iv1, tag1, passPayload]).toString('base64'),
      recovery_payload: Buffer.concat([iv2, tag2, recPayload]).toString('base64'),
    }
    
    fs.writeFileSync(META_FILE, JSON.stringify(meta))
    
    // If a legacy unencrypted DB exists, we migrate it. Otherwise, create an empty one.
    if (fs.existsSync(LEGACY_DB)) {
      fs.copyFileSync(LEGACY_DB, TEMP_DB)
      // We securely wipe the legacy plaintext DB instead of leaving a backup.
      try { secureWipe(LEGACY_DB) } catch {}
      try { secureWipe(LEGACY_DB + '.bak') } catch {}
    } else {
      // Just touch the file to ensure it exists for Prisma to initialize
      fs.writeFileSync(TEMP_DB, '')
    }
    
    currentMasterKey = masterKey
    encryptTempDatabase() // Initial encryption
    
    return { success: true, recoveryKey }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function decryptPayload(payloadBase64: string, key: Buffer): Buffer | null {
  try {
    const buf = Buffer.from(payloadBase64, 'base64')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const encrypted = buf.subarray(28)
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()])
  } catch {
    return null
  }
}

export async function unlockDatabase(password: string, isRecovery: boolean = false): Promise<{ success: boolean, error?: string }> {
  try {
    const metaStr = fs.readFileSync(META_FILE, 'utf-8')
    const meta = JSON.parse(metaStr)
    const salt = Buffer.from(meta.salt, 'base64')
    const iterations = meta.iterations || 100000
    
    const userKey = deriveUserKey(password, salt, iterations)
    const payload = isRecovery ? meta.recovery_payload : meta.password_payload
    
    const masterKey = decryptPayload(payload, userKey)
    if (!masterKey) {
      return { success: false, error: 'Invalid password or recovery key' }
    }
    
    // Transparently re-wrap with 600k iterations if upgrading from legacy setting
    if (iterations < 600000 && !isRecovery) {
      const newUserKey = deriveUserKey(password, salt, 600000)
      const iv1 = generateDistinctIv(0)
      const cipher1 = crypto.createCipheriv('aes-256-gcm', newUserKey, iv1)
      const passPayload = Buffer.concat([cipher1.update(masterKey), cipher1.final()])
      const tag1 = cipher1.getAuthTag()
      
      meta.iterations = 600000
      meta.password_payload = Buffer.concat([iv1, tag1, passPayload]).toString('base64')
      fs.writeFileSync(META_FILE, JSON.stringify(meta))
    }
    
    currentMasterKey = masterKey
    
    // Decrypt ENC_FILE to TEMP_DB
    const encData = await fs.promises.readFile(ENC_FILE)
    if (encData.length > 0) {
      const iv = encData.subarray(0, 12)
      const tag = encData.subarray(12, 28)
      const encrypted = encData.subarray(28)
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', currentMasterKey, iv)
      decipher.setAuthTag(tag)
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
      await fs.promises.writeFile(TEMP_DB, decrypted)
    } else {
      await fs.promises.writeFile(TEMP_DB, '')
    }
    
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unlock failed' }
  }
}

export function encryptTempDatabase() {
  if (!currentMasterKey || !fs.existsSync(TEMP_DB)) return
  
  try {
    const dbData = fs.readFileSync(TEMP_DB)
    const iv = generateDistinctIv(2)
    const cipher = crypto.createCipheriv('aes-256-gcm', currentMasterKey, iv)
    const encrypted = Buffer.concat([cipher.update(dbData), cipher.final()])
    const tag = cipher.getAuthTag()
    
    fs.writeFileSync(ENC_TEMP_FILE, Buffer.concat([iv, tag, encrypted]))

    if (fs.existsSync(ENC_FILE)) {
      fs.copyFileSync(ENC_FILE, ENC_BACKUP_FILE)
    }

    fs.renameSync(ENC_TEMP_FILE, ENC_FILE)
  } catch (err) {
    console.error('Failed to encrypt database:', err)
    try {
      if (fs.existsSync(ENC_TEMP_FILE)) fs.unlinkSync(ENC_TEMP_FILE)
    } catch {}
  }
}

function secureWipe(filePath: string) {
  if (!fs.existsSync(filePath)) return

  let fd: number | null = null;
  try {
    const stats = fs.statSync(filePath)
    fd = fs.openSync(filePath, 'r+')
    const bufferSize = 4096
    const zeroBuffer = Buffer.alloc(bufferSize, 0)

    let bytesWrittenTotal = 0
    while (bytesWrittenTotal < stats.size) {
      const bytesToWrite = Math.min(bufferSize, stats.size - bytesWrittenTotal)
      const written = fs.writeSync(fd, zeroBuffer, 0, bytesToWrite, bytesWrittenTotal)
      bytesWrittenTotal += written
    }

    fs.fsyncSync(fd)
  } catch (err) {
    console.error(`Failed to securely wipe ${filePath}:`, err)
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        // ignore err: unknownor when closing file
      
        console.error(`Failed to close ${filePath}:`, err)
      }
    }
    // Try to unlink the file regardless of if secure wipe succeeded or failed
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (err) {
      console.error(`Failed to delete ${filePath}:`, err)
    }
  }
}

export function cleanupTempDatabase() {
  try {
    if (fs.existsSync(TEMP_DB)) {
      encryptTempDatabase() // Final flush
      secureWipe(TEMP_DB)
    }
  } catch (e) {
    console.error('Cleanup failed:', e)
  } finally {
    if (currentMasterKey) {
      currentMasterKey.fill(0)
      currentMasterKey = null
    }
  }
}

export function changePassword(oldPassword: string, newPassword: string): { success: boolean, recoveryKey?: string, error?: string } {
  try {
    const metaStr = fs.readFileSync(META_FILE, 'utf-8')
    const meta = JSON.parse(metaStr)
    const salt = Buffer.from(meta.salt, 'base64')
    const oldIterations = meta.iterations || 100000
    
    // Verify old password
    const oldUserKey = deriveUserKey(oldPassword, salt, oldIterations)
    const masterKey = decryptPayload(meta.password_payload, oldUserKey)
    if (!masterKey) {
      return { success: false, error: 'Incorrect current password' }
    }
    
    // Generate new salt for extra security
    const newSalt = crypto.randomBytes(16)
    const recoveryKey = crypto.randomBytes(8).toString('hex').match(/.{1,4}/g)?.join('-').toUpperCase() || ''
    
    const newUserKey = deriveUserKey(newPassword, newSalt)
    const newRecoveryUserKey = deriveUserKey(recoveryKey, newSalt)
    
    // Encrypt MasterKey with new UserKey
    const iv1 = generateDistinctIv(0)
    const cipher1 = crypto.createCipheriv('aes-256-gcm', newUserKey, iv1)
    const passPayload = Buffer.concat([cipher1.update(masterKey), cipher1.final()])
    const tag1 = cipher1.getAuthTag()
    
    // Encrypt MasterKey with new RecoveryKey
    const iv2 = generateDistinctIv(1)
    const cipher2 = crypto.createCipheriv('aes-256-gcm', newRecoveryUserKey, iv2)
    const recPayload = Buffer.concat([cipher2.update(masterKey), cipher2.final()])
    const tag2 = cipher2.getAuthTag()
    
    const newMeta = {
      salt: newSalt.toString('base64'),
      iterations: 600000,
      password_payload: Buffer.concat([iv1, tag1, passPayload]).toString('base64'),
      recovery_payload: Buffer.concat([iv2, tag2, recPayload]).toString('base64'),
    }
    
    fs.writeFileSync(META_FILE, JSON.stringify(newMeta))
    
    return { success: true, recoveryKey }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to change password' }
  }
}
