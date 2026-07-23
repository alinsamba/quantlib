import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const TEMP_DB = path.join(process.cwd(), 'benchmark_temp.db')
const ENC_TEMP_FILE = path.join(process.cwd(), 'benchmark_temp.enc.tmp')
const ENC_FILE = path.join(process.cwd(), 'benchmark_temp.enc')
const ENC_BACKUP_FILE = path.join(process.cwd(), 'benchmark_temp.enc.bak')

const currentMasterKey = crypto.randomBytes(32)

function generateDistinctIv(domain: number): Buffer {
  const iv = crypto.randomBytes(12)
  iv[0] = domain & 0xFF
  return iv
}

function encryptTempDatabaseSync() {
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

async function encryptTempDatabaseAsync() {
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
    try {
      if (fs.existsSync(ENC_TEMP_FILE)) await fs.promises.unlink(ENC_TEMP_FILE)
    } catch {}
  }
}

async function runBenchmark() {
  // Create a dummy 50MB database file
  const dummyData = crypto.randomBytes(50 * 1024 * 1024)
  fs.writeFileSync(TEMP_DB, dummyData)

  console.log('Running Sync Benchmark...')
  let startSync = performance.now()
  encryptTempDatabaseSync()
  let endSync = performance.now()
  console.log(`Sync time: ${(endSync - startSync).toFixed(2)} ms`)

  // Clean up
  if (fs.existsSync(ENC_FILE)) fs.unlinkSync(ENC_FILE)
  if (fs.existsSync(ENC_BACKUP_FILE)) fs.unlinkSync(ENC_BACKUP_FILE)
  if (fs.existsSync(ENC_TEMP_FILE)) fs.unlinkSync(ENC_TEMP_FILE)

  console.log('Running Async Benchmark...')
  let startAsync = performance.now()
  await encryptTempDatabaseAsync()
  let endAsync = performance.now()
  console.log(`Async time: ${(endAsync - startAsync).toFixed(2)} ms`)

  fs.unlinkSync(TEMP_DB)
  if (fs.existsSync(ENC_FILE)) fs.unlinkSync(ENC_FILE)
  if (fs.existsSync(ENC_BACKUP_FILE)) fs.unlinkSync(ENC_BACKUP_FILE)
  if (fs.existsSync(ENC_TEMP_FILE)) fs.unlinkSync(ENC_TEMP_FILE)
}

runBenchmark()
