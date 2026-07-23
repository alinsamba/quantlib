import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

const TEMP_DB = path.join(process.cwd(), 'temp_bench.db')
const ENC_TEMP_FILE = path.join(process.cwd(), 'bench.db.enc.tmp')
const ENC_FILE = path.join(process.cwd(), 'bench.db.enc')
const ENC_BACKUP_FILE = path.join(process.cwd(), 'bench.db.enc.bak')

let currentMasterKey = crypto.randomBytes(32)

function generateDistinctIv(domain: number): Buffer {
  const iv = crypto.randomBytes(12)
  iv[0] = domain & 0xFF
  return iv
}

// Create a dummy 50MB database
console.log('Creating dummy DB...')
fs.writeFileSync(TEMP_DB, crypto.randomBytes(50 * 1024 * 1024))
fs.writeFileSync(ENC_FILE, crypto.randomBytes(1024))

export function encryptTempDatabaseSync() {
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
  }
}

export async function encryptTempDatabaseAsync() {
  if (!currentMasterKey || !fs.existsSync(TEMP_DB)) return

  try {
    const dbData = await fs.promises.readFile(TEMP_DB)
    const iv = generateDistinctIv(2)
    const cipher = crypto.createCipheriv('aes-256-gcm', currentMasterKey, iv)
    const encrypted = Buffer.concat([cipher.update(dbData), cipher.final()])
    const tag = cipher.getAuthTag()

    await fs.promises.writeFile(ENC_TEMP_FILE, Buffer.concat([iv, tag, encrypted]))

    if (fs.existsSync(ENC_FILE)) {
      await fs.promises.copyFile(ENC_FILE, ENC_BACKUP_FILE)
    }

    await fs.promises.rename(ENC_TEMP_FILE, ENC_FILE)
  } catch (err) {
    console.error('Failed to encrypt database:', err)
  }
}

async function run() {
  console.log('Running Sync Benchmark (blocks event loop)')
  let start = performance.now()
  encryptTempDatabaseSync()
  console.log('Sync took:', performance.now() - start, 'ms')

  console.log('Running Async Benchmark (does not block event loop as much)')
  start = performance.now()
  await encryptTempDatabaseAsync()
  console.log('Async took:', performance.now() - start, 'ms')

  // Clean up
  fs.unlinkSync(TEMP_DB)
  fs.unlinkSync(ENC_FILE)
  if (fs.existsSync(ENC_BACKUP_FILE)) fs.unlinkSync(ENC_BACKUP_FILE)
}

run()
