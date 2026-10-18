import { ipcMain } from 'electron'
import { checkDbStatus, setupDatabase, unlockDatabase, changePassword } from '../crypto'
import { openPrismaDatabase, disconnectPrisma, sanitizeError } from '../database'
import { validateMasterPassword } from '../../src/lib/utils'

const unlockAttempts = new Map<string, { attempts: number; nextAllowedTime: number }>()

export function registerAuthHandlers() {
  ipcMain.handle('check-db-status', () => {
    return checkDbStatus()
  })

  ipcMain.handle('setup-db', async (_, password) => {
    const pwdError = validateMasterPassword(password)
    if (pwdError) return { success: false, error: pwdError }

    const result = setupDatabase(password)
    if (result.success) {
      try {
        await openPrismaDatabase()
      } catch (err: unknown) {
        await disconnectPrisma()
        return { success: false, error: sanitizeError(err) }
      }
    }
    return result
  })

  ipcMain.handle('unlock-db', async (_, { password, isRecovery = false }) => {
    const key = isRecovery ? 'recovery' : 'password'
    const state = unlockAttempts.get(key) || { attempts: 0, nextAllowedTime: 0 }

    if (Date.now() < state.nextAllowedTime) {
      const waitTime = Math.ceil((state.nextAllowedTime - Date.now()) / 1000)
      return { success: false, error: `Too many failed attempts. Try again in ${waitTime} seconds.` }
    }

    const result = unlockDatabase(password, isRecovery)
    if (!result.success) {
      state.attempts++
      const backoffSeconds = Math.min(60, Math.pow(2, state.attempts - 1))
      state.nextAllowedTime = Date.now() + backoffSeconds * 1000
      unlockAttempts.set(key, state)
      return { success: false, error: 'Invalid password or recovery key' }
    }

    unlockAttempts.delete(key)

    if (result.success) {
      try {
        await openPrismaDatabase()
      } catch (err: unknown) {
        await disconnectPrisma()
        return { success: false, error: sanitizeError(err) }
      }
    }
    return result
  })

  ipcMain.handle('change-password', (_, { oldPassword, newPassword }) => {
    const pwdError = validateMasterPassword(newPassword)
    if (pwdError) return { success: false, error: pwdError }
    return changePassword(oldPassword, newPassword)
  })
}
