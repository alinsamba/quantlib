import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getPrisma } from '../database'
export function formatBackupTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`
}

export function isBackupDue(
  lastBackupAt: Date | string | null | undefined,
  intervalHours: number,
  now: Date = new Date()
): boolean {
  if (!lastBackupAt) return true
  const lastDate = lastBackupAt instanceof Date ? lastBackupAt : new Date(lastBackupAt as string)
  if (!(lastDate instanceof Date) || isNaN(lastDate.getTime())) return true

  const diffMs = now.getTime() - lastDate.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  return diffHours >= intervalHours
}

/**
 * Sanitizes and validates the target backup directory path to prevent path traversal attacks.
 */
export function sanitizeBackupPath(targetDir: string): string {
  const resolved = path.resolve(targetDir)
  // Protect system critical directories
  const root = path.parse(resolved).root
  if (resolved === root || resolved === path.join(root, 'Windows') || resolved === path.join(root, 'System32')) {
    throw new Error('Invalid or restricted backup directory path.')
  }
  return resolved
}

export function performVaultBackup(
  targetDir: string,
  customSourceFile?: string
): { success: boolean; backupPath?: string; filename?: string; error?: string } {
  try {
    if (!targetDir || !targetDir.trim()) {
      return { success: false, error: 'Target directory is required' }
    }
    const safeTargetDir = sanitizeBackupPath(targetDir)
    const dataDir = app.getPath('userData')
    const sourceEncFile = customSourceFile || path.join(dataDir, 'quantlib.enc')

    if (!fs.existsSync(sourceEncFile)) {
      return { success: false, error: 'Source vault file (quantlib.enc) does not exist.' }
    }

    if (!fs.existsSync(safeTargetDir)) {
      fs.mkdirSync(safeTargetDir, { recursive: true })
    }

    const timestamp = formatBackupTimestamp()
    const filename = `quantlib_backup_${timestamp}.enc`
    const backupPath = path.join(safeTargetDir, filename)

    fs.copyFileSync(sourceEncFile, backupPath)

    return {
      success: true,
      backupPath,
      filename
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function listVaultBackups(
  targetDir?: string
): Promise<Array<{ filename: string; fullPath: string; sizeBytes: number; createdAt: string }>> {
  try {
    const safeTargetDir = sanitizeBackupPath(targetDir || path.join(app.getPath('userData'), 'backups'))
    if (!fs.existsSync(safeTargetDir)) return []

    const files = await fs.promises.readdir(safeTargetDir)
    const backupFiles = files.filter((f) => f.startsWith('quantlib_backup_') && f.endsWith('.enc'))

    const results = await Promise.all(
      backupFiles.map(async (filename) => {
        const fullPath = path.join(safeTargetDir, filename)
        const stats = await fs.promises.stat(fullPath)
        return {
          filename,
          fullPath,
          sizeBytes: stats.size,
          createdAt: stats.birthtime ? stats.birthtime.toISOString() : stats.mtime.toISOString()
        }
      })
    )

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

/**
 * Synchronous version of listVaultBackups maintained for compatibility with tests expecting synchronous return.
 */
export function listVaultBackupsSync(
  targetDir?: string
): Array<{ filename: string; fullPath: string; sizeBytes: number; createdAt: string }> {
  try {
    const safeTargetDir = sanitizeBackupPath(targetDir || path.join(app.getPath('userData'), 'backups'))
    if (!fs.existsSync(safeTargetDir)) return []

    const files = fs.readdirSync(safeTargetDir)
    const backupFiles = files.filter((f) => f.startsWith('quantlib_backup_') && f.endsWith('.enc'))

    const results = backupFiles.map((filename) => {
      const fullPath = path.join(safeTargetDir, filename)
      const stats = fs.statSync(fullPath)
      return {
        filename,
        fullPath,
        sizeBytes: stats.size,
        createdAt: stats.birthtime ? stats.birthtime.toISOString() : stats.mtime.toISOString()
      }
    })

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

let autoBackupIntervalTimer: NodeJS.Timeout | null = null

export function startAutoBackupScheduler() {
  stopAutoBackupScheduler()

  autoBackupIntervalTimer = setInterval(async () => {
    try {
      const prisma = getPrisma()
      if (!prisma) return

      const configRes = await prisma.$queryRawUnsafe<Array<{ autoBackupEnabled: number; autoBackupIntervalHours: number; autoBackupPath: string | null; lastAutoBackupAt: string | null }>>('SELECT autoBackupEnabled, autoBackupIntervalHours, autoBackupPath, lastAutoBackupAt FROM AppConfig WHERE id = 1')
      const config = configRes[0]
      if (!config || !config.autoBackupEnabled) return

      if (isBackupDue(config.lastAutoBackupAt, config.autoBackupIntervalHours)) {
        const backupDir = config.autoBackupPath || path.join(app.getPath('userData'), 'backups')
        const result = performVaultBackup(backupDir)
        if (result.success) {
          const now = new Date().toISOString()
          await prisma.$executeRawUnsafe('UPDATE AppConfig SET lastAutoBackupAt = ? WHERE id = 1', now)
        }
      }
    } catch (err) {
      console.error('Auto backup scheduler error:', err)
    }
  }, 60 * 60 * 1000) // Check every hour
}

export function stopAutoBackupScheduler() {
  if (autoBackupIntervalTimer) {
    clearInterval(autoBackupIntervalTimer)
    autoBackupIntervalTimer = null
  }
}
