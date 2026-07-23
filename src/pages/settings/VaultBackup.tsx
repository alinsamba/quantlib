import { useState, useEffect, useCallback } from 'react'
import { HardDrive, Save, RefreshCw, Database } from 'lucide-react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { db } from '../../lib/ipc-client'
import type { BackupFileRecord } from '../../lib/types'

export function VaultBackup() {
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false)
  const [autoBackupPath, setAutoBackupPath] = useState('')
  const [autoBackupIntervalHours, setAutoBackupIntervalHours] = useState(24)
  const [lastAutoBackupAt, setLastAutoBackupAt] = useState<string | null>(null)
  const [recentBackups, setRecentBackups] = useState<BackupFileRecord[]>([])
  const [backupConfigLoading, setBackupConfigLoading] = useState(false)
  const [backupSaveSuccess, setBackupSaveSuccess] = useState('')
  const [backupTriggerMessage, setBackupTriggerMessage] = useState('')
  const [isTriggeringBackup, setIsTriggeringBackup] = useState(false)

  const fetchBackupConfig = useCallback(async () => {
    setBackupConfigLoading(true)
    try {
      const res = await db.getBackupConfig()
      if (res && res.success && res.data) {
        setAutoBackupEnabled(res.data.autoBackupEnabled ?? false)
        setAutoBackupPath(res.data.autoBackupPath ?? '')
        setAutoBackupIntervalHours(res.data.autoBackupIntervalHours ?? 24)
        setLastAutoBackupAt(res.data.lastAutoBackupAt ?? null)
      }
      const listRes = await db.listBackups()
      if (listRes && listRes.success && listRes.data) {
        setRecentBackups(listRes.data)
      }
    } catch (err) {
      console.error('Failed to load backup config:', err)
    } finally {
      setBackupConfigLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBackupConfig()
  }, [fetchBackupConfig])

  const handleSaveBackupConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setBackupSaveSuccess('')
    try {
      const res = await db.saveBackupConfig({
        autoBackupEnabled,
        autoBackupPath,
        autoBackupIntervalHours: Number(autoBackupIntervalHours)
      })
      if (res.success) {
        setBackupSaveSuccess('Backup settings saved successfully!')
        fetchBackupConfig()
      }
    } catch (err: unknown) {
      alert('Failed to save backup config: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleTriggerBackupNow = async () => {
    setIsTriggeringBackup(true)
    setBackupTriggerMessage('')
    try {
      const res = await db.triggerAutoBackup(autoBackupPath || undefined)
      if (res.success) {
        setBackupTriggerMessage(`Backup saved: ${res.filename || res.backupPath}`)
        fetchBackupConfig()
      } else {
        alert('Backup failed: ' + res.error)
      }
    } catch (err: unknown) {
      alert('Backup error: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsTriggeringBackup(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center space-x-2">
          <HardDrive size={20} className="text-blue-500" />
          <span>Vault Backup System</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <form onSubmit={handleSaveBackupConfig} className="space-y-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Enable Automated Encrypted Backups</span>
            </label>

            <div className={`space-y-4 transition-opacity ${autoBackupEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <TextField
                label="Backup Location (Absolute Path)"
                placeholder="e.g. D:\SchoolBackups or /mnt/usb"
                value={autoBackupPath}
                onChange={(e) => setAutoBackupPath(e.target.value)}
                required={autoBackupEnabled}
              />

              <TextField
                label="Backup Interval (Hours)"
                type="number"
                min={1}
                value={autoBackupIntervalHours}
                onChange={(e) => setAutoBackupIntervalHours(Number(e.target.value))}
                required={autoBackupEnabled}
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <Button type="submit" icon={<Save size={16} />} size="sm" isLoading={backupConfigLoading}>
                Save Config
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon={<RefreshCw size={16} />}
                size="sm"
                onClick={handleTriggerBackupNow}
                isLoading={isTriggeringBackup}
              >
                Trigger Now
              </Button>
            </div>

            {backupSaveSuccess && <p className="text-sm text-green-500 font-medium">{backupSaveSuccess}</p>}
            {backupTriggerMessage && <p className="text-sm text-blue-500 font-medium">{backupTriggerMessage}</p>}
          </form>

          {lastAutoBackupAt && (
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Last automated backup: {new Date(lastAutoBackupAt).toLocaleString()}
            </div>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-100 dark:border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center space-x-1.5">
            <Database size={16} className="text-slate-400" />
            <span>Recent Local Backups</span>
          </h3>
          {recentBackups.length > 0 ? (
            <ul className="space-y-2 text-sm overflow-y-auto max-h-48 pr-2">
              {recentBackups.map((b, i) => (
                <li key={i} className="flex justify-between items-center py-1.5 border-b border-slate-200/50 dark:border-slate-700/30 last:border-0">
                  <span className="text-slate-600 dark:text-slate-300 truncate pr-2" title={b.filename}>{b.filename}</span>
                  <span className="text-slate-400 text-xs shrink-0">{new Date(b.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No backups found in local vault.</p>
          )}
        </div>
      </div>
    </div>
  )
}
