import { useState, useEffect, useCallback } from 'react'
import { Save, Moon, Sun, ShieldCheck, Key, Copy, Printer, History, Database, Download, BookOpen, Plus, Trash2, Edit2, HardDrive, RefreshCw, Network, Wifi, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { useTheme } from '../hooks/ThemeContext'
import { validateMasterPassword } from '../lib/utils'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { useAsync } from '../hooks/useAsync'
import { db } from '../lib/ipc-client'
import type { AuditLog, BorrowingRule, BackupFileRecord } from '../lib/types'
import { Modal } from '../components/Modal'



export default function Settings() {
  const [schoolName, setSchoolName] = useState('Mentor High School - Kitende')
  const [motto, setMotto] = useState('Education is the Key')
  const [academicYear, setAcademicYear] = useState('2026')
  const { theme, setTheme } = useTheme()

  // Password Change State
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [newRecoveryKey, setNewRecoveryKey] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Audit Logs State
  const { data: auditLogsRes, isLoading: logsLoading, execute: fetchLogs } = useAsync<{ success: boolean, data?: AuditLog[], error?: string }>()

  useEffect(() => {
    fetchLogs(() => db.getAuditLogs())
  }, [fetchLogs])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')
    setNewRecoveryKey('')

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    const validationError = validateMasterPassword(newPassword)
    if (validationError) {
      setPasswordError(validationError)
      return
    }

    setIsChangingPassword(true)
    try {
      const res = await window.electronAPI.changePassword({ oldPassword, newPassword })
      if (res.success) {
        setPasswordSuccess('Master password changed successfully!')
        setNewRecoveryKey(res.recoveryKey ?? '')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setPasswordError(res.error || 'Failed to change password')
      }
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [backupError, setBackupError] = useState('')

  const handleBackupDatabase = async () => {
    setIsBackingUp(true)
    setBackupMessage('')
    setBackupError('')
    try {
      const res = await db.backupDatabase()
      if (res.success) {
        setBackupMessage('Database backed up successfully!')
      } else {
        if (res.error !== 'Backup cancelled') {
          setBackupError(res.error || 'Backup failed')
        }
      }
    } catch (err: unknown) {
      setBackupError(err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setIsBackingUp(false)
    }
  }

  // Vault Backup System State
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false)
  const [autoBackupPath, setAutoBackupPath] = useState('')
  const [autoBackupIntervalHours, setAutoBackupIntervalHours] = useState(24)
  const [lastAutoBackupAt, setLastAutoBackupAt] = useState<string | null>(null)
  const [recentBackups, setRecentBackups] = useState<BackupFileRecord[]>([])
  const [backupConfigLoading, setBackupConfigLoading] = useState(false)
  const [backupSaveSuccess, setBackupSaveSuccess] = useState('')
  const [backupTriggerMessage, setBackupTriggerMessage] = useState('')
  const [isTriggeringBackup, setIsTriggeringBackup] = useState(false)

  // Multi-Desk LAN Sync State
  const [lanSyncEnabled, setLanSyncEnabled] = useState(false)
  const [lanPort, setLanPort] = useState(8085)
  const [lanPasscode, setLanPasscode] = useState('quantlib-sync')
  const [localIp, setLocalIp] = useState('127.0.0.1')
  const [isServerRunning, setIsServerRunning] = useState(false)
  const [lastLanSyncAt, setLastLanSyncAt] = useState<string | null>(null)
  const [peerIp, setPeerIp] = useState('')
  const [peerPort, setPeerPort] = useState(8085)
  const [isSyncingPeer, setIsSyncingPeer] = useState(false)
  const [syncStatusMsg, setSyncStatusMsg] = useState('')
  const [syncErrorMsg, setSyncErrorMsg] = useState('')
  const [lanSaveSuccess, setLanSaveSuccess] = useState('')

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

  const fetchLanConfig = useCallback(async () => {
    try {
      const res = await db.getLanSyncConfig()
      if (res && res.success && res.data) {
        setLanSyncEnabled(res.data.lanSyncEnabled ?? false)
        setLanPort(res.data.lanPort ?? 8085)
        setLanPasscode(res.data.lanPasscode ?? 'quantlib-sync')
        setLocalIp(res.data.localIp ?? '127.0.0.1')
        setIsServerRunning(res.data.isServerRunning ?? false)
        setLastLanSyncAt(res.data.lastLanSyncAt ?? null)
      }
    } catch (err) {
      console.error('Failed to load LAN sync config:', err)
    }
  }, [])

  useEffect(() => {
    fetchBackupConfig()
    fetchLanConfig()
  }, [fetchBackupConfig, fetchLanConfig])

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

  const handleSaveLanConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setLanSaveSuccess('')
    try {
      const res = await db.saveLanSyncConfig({
        lanSyncEnabled,
        lanPort: Number(lanPort),
        lanPasscode
      })
      if (res.success) {
        setLanSaveSuccess('LAN sync settings saved!')
        fetchLanConfig()
      }
    } catch (err: unknown) {
      alert('Failed to save LAN config: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleSyncWithPeer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!peerIp.trim()) return
    setIsSyncingPeer(true)
    setSyncStatusMsg('')
    setSyncErrorMsg('')
    try {
      const res = await db.syncWithLanPeer({
        peerIp: peerIp.trim(),
        peerPort: Number(peerPort),
        passcode: lanPasscode
      })
      if (res && res.success) {
        const counts = res.data?.mergedCounts || {}
        const summary = `Synced successfully! (Merged: ${counts.subjects || 0} subjects, ${counts.checkouts || 0} checkouts)`
        setSyncStatusMsg(summary)
        fetchLanConfig()
      }
    } catch (err: unknown) {
      setSyncErrorMsg(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setIsSyncingPeer(false)
    }
  }


  // Borrowing Rules State
  const [borrowingRules, setBorrowingRules] = useState<BorrowingRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [ruleFormData, setRuleFormData] = useState({ id: 0, roleOrGrade: '', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0 })
  const [ruleError, setRuleError] = useState('')

  const fetchRules = useCallback(async () => {
    setRulesLoading(true)
    try {
      const res = await db.getBorrowingRules()
      if (res && res.success) {
        setBorrowingRules(res.data || [])
      }
    } catch (err: unknown) {
      console.error('Failed to fetch borrowing rules:', err)
    } finally {
      setRulesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const handleOpenAddRule = () => {
    setRuleFormData({ id: 0, roleOrGrade: '', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0 })
    setRuleError('')
    setIsRuleModalOpen(true)
  }

  const handleOpenEditRule = (rule: BorrowingRule) => {
    setRuleFormData({
      id: rule.id,
      roleOrGrade: rule.roleOrGrade,
      maxBooksAllowed: rule.maxBooksAllowed,
      borrowDurationDays: rule.borrowDurationDays,
      finePerDay: rule.finePerDay
    })
    setRuleError('')
    setIsRuleModalOpen(true)
  }

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    setRuleError('')
    try {
      const res = await db.saveBorrowingRule({
        id: ruleFormData.id || undefined,
        roleOrGrade: ruleFormData.roleOrGrade,
        maxBooksAllowed: Number(ruleFormData.maxBooksAllowed),
        borrowDurationDays: Number(ruleFormData.borrowDurationDays),
        finePerDay: Number(ruleFormData.finePerDay)
      })
      if (res.success) {
        setIsRuleModalOpen(false)
        fetchRules()
      } else {
        setRuleError(res.error || 'Failed to save rule')
      }
    } catch (err: unknown) {
      setRuleError(err instanceof Error ? err.message : 'Failed to save rule')
    }
  }

  const handleDeleteRule = async (id: number, roleOrGrade: string) => {
    if (roleOrGrade === 'DEFAULT') {
      alert('Cannot delete the DEFAULT borrowing rule.')
      return
    }
    if (!confirm(`Are you sure you want to delete borrowing rule for "${roleOrGrade}"?`)) return
    try {
      const res = await db.deleteBorrowingRule(id)
      if (res.success) {
        fetchRules()
      } else {
        alert('Failed to delete rule: ' + res.error)
      }
    } catch (err: unknown) {
      alert('Failed to delete rule: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (

    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure your application branding, preferences, and view system logs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Borrowing Rules */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center space-x-2">
                <BookOpen size={20} className="text-blue-500" />
                <span>Borrowing Rules</span>
              </h2>
              <Button size="sm" icon={<Plus size={16} />} onClick={handleOpenAddRule}>
                Add Rule
              </Button>
            </div>

            {rulesLoading ? (
              <div className="text-center py-4 text-slate-500">Loading rules...</div>
            ) : borrowingRules.length === 0 ? (
              <div className="text-center py-4 text-slate-500">No borrowing rules configured.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                      <th className="pb-2 font-medium">Role/Grade</th>
                      <th className="pb-2 font-medium text-center">Max Books</th>
                      <th className="pb-2 font-medium text-center">Duration</th>
                      <th className="pb-2 font-medium text-right">Fine/Day</th>
                      <th className="pb-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {borrowingRules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                          {rule.roleOrGrade}
                        </td>
                        <td className="py-2.5 text-center text-slate-600 dark:text-slate-400">
                          {rule.maxBooksAllowed}
                        </td>
                        <td className="py-2.5 text-center text-slate-600 dark:text-slate-400">
                          {rule.borrowDurationDays} days
                        </td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-400">
                          ${rule.finePerDay.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end space-x-1">
                            <button
                              onClick={() => handleOpenEditRule(rule)}
                              className="p-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                              title="Edit Rule"
                            >
                              <Edit2 size={16} />
                            </button>
                            {rule.roleOrGrade !== 'DEFAULT' && (
                              <button
                                onClick={() => handleDeleteRule(rule.id, rule.roleOrGrade)}
                                className="p-1 text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                                title="Delete Rule"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* School Info */}

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">School Information</h2>
            
            <div className="space-y-4">
              <TextField 
                label="School Name"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
              />
              <TextField 
                label="School Motto"
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
              />
              <TextField 
                label="Academic Year"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
              />
            </div>

            <div className="pt-4 flex justify-end">
              <Button icon={<Save size={18} />}>Save Changes</Button>
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">Appearance</h2>
            
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Theme Preference</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex items-center justify-center space-x-2 p-4 rounded-xl border-2 transition-all ${theme === 'light' ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300 dark:hover:border-slate-600'}`}
                >
                  <Sun size={20} />
                  <span className="font-medium">Light Mode</span>
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex items-center justify-center space-x-2 p-4 rounded-xl border-2 transition-all ${theme === 'dark' ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300 dark:hover:border-slate-600'}`}
                >
                  <Moon size={20} />
                  <span className="font-medium">Dark Mode</span>
                </button>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center space-x-2">
              <ShieldCheck size={20} className="text-blue-500" />
              <span>Security</span>
            </h2>
            
            <form onSubmit={handleChangePassword} className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Change your master password. This will generate a new recovery key.</p>
              
              <TextField 
                label="Current Password"
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
              
              <TextField 
                label="New Password"
                type="password"
                required
                minLength={8}
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}"
                title="Use at least 8 characters with uppercase, lowercase, and a number."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />

              <TextField 
                label="Confirm New Password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              {passwordError && <div className="text-red-500 text-sm font-medium">{passwordError}</div>}
              {passwordSuccess && <div className="text-green-500 text-sm font-medium">{passwordSuccess}</div>}

              <div className="pt-2">
                <Button 
                  type="submit" 
                  variant="secondary"
                  disabled={isChangingPassword}
                  isLoading={isChangingPassword}
                  icon={<Key size={18} />}
                >
                  Change Password
                </Button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          {/* Vault Backup System */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center space-x-2">
                <HardDrive size={20} className="text-blue-500" />
                <span>Vault Backup System</span>
              </h2>
              <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={fetchBackupConfig} isLoading={backupConfigLoading}>
                Refresh
              </Button>
            </div>

            <form onSubmit={handleSaveBackupConfig} className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="font-medium text-sm text-slate-800 dark:text-slate-200">Auto-Scheduled Vault Backups</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Automatically copy encrypted vault (.enc) to designated target path</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoBackupEnabled}
                    onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <TextField 
                label="Backup Target Path (Local Directory or USB Drive)"
                placeholder="e.g. D:\QuantLib_Backups or E:\USB_Backup"
                value={autoBackupPath}
                onChange={(e) => setAutoBackupPath(e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Backup Schedule Interval
                </label>
                <select
                  value={autoBackupIntervalHours}
                  onChange={(e) => setAutoBackupIntervalHours(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={6}>Every 6 Hours</option>
                  <option value={12}>Every 12 Hours</option>
                  <option value={24}>Daily (Every 24 Hours)</option>
                  <option value={168}>Weekly (Every 7 Days)</option>
                </select>
              </div>

              {lastAutoBackupAt && (
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                  <Clock size={14} />
                  <span>Last Auto-Backup: {new Date(lastAutoBackupAt).toLocaleString()}</span>
                </div>
              )}

              {backupSaveSuccess && <p className="text-xs font-medium text-green-500">{backupSaveSuccess}</p>}

              <div className="pt-2 flex justify-between items-center">
                <Button type="submit" variant="secondary" size="sm" icon={<Save size={16} />}>
                  Save Backup Config
                </Button>

                <Button 
                  type="button"
                  size="sm"
                  icon={<HardDrive size={16} />}
                  onClick={handleTriggerBackupNow}
                  isLoading={isTriggeringBackup}
                >
                  Backup Now
                </Button>
              </div>

              {backupTriggerMessage && (
                <p className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800">
                  {backupTriggerMessage}
                </p>
              )}
            </form>

            {/* Recent Backup History */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center space-x-1.5">
                <History size={16} />
                <span>Recent Backup History</span>
              </h3>
              {recentBackups.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic text-center py-2">No backups found in target path.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {recentBackups.slice(0, 5).map((file) => (
                    <div key={file.fullPath} className="text-xs p-2 bg-slate-50 dark:bg-slate-900/40 rounded border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                      <div>
                        <p className="font-mono font-medium text-slate-800 dark:text-slate-200">{file.filename}</p>
                        <p className="text-slate-400 truncate max-w-xs">{file.fullPath}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 font-semibold">{Math.round(file.sizeBytes / 1024)} KB</span>
                        <p className="text-slate-400">{new Date(file.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Multi-Desk LAN Sync */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center space-x-2">
                <Network size={20} className="text-blue-500" />
                <span>Multi-Desk LAN Sync</span>
              </h2>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isServerRunning ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                {isServerRunning ? `Server Active (Port ${lanPort})` : 'Server Inactive'}
              </span>
            </div>

            <form onSubmit={handleSaveLanConfig} className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="font-medium text-sm text-slate-800 dark:text-slate-200">Enable LAN Sync Server</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Allow secondary desktop instances on local network to synchronize SQLite vault</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lanSyncEnabled}
                    onChange={(e) => setLanSyncEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Local IP Address</label>
                  <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900 rounded-lg font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {localIp}
                  </div>
                </div>
                <TextField
                  label="LAN Server Port"
                  type="number"
                  value={lanPort}
                  onChange={(e) => setLanPort(Number(e.target.value))}
                />
              </div>

              <TextField
                label="Sync Security Passcode"
                type="password"
                placeholder="Secret passcode for LAN sync authorization"
                value={lanPasscode}
                onChange={(e) => setLanPasscode(e.target.value)}
              />

              {lastLanSyncAt && (
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                  <Clock size={14} />
                  <span>Last LAN Sync: {new Date(lastLanSyncAt).toLocaleString()}</span>
                </div>
              )}

              {lanSaveSuccess && <p className="text-xs font-medium text-green-500">{lanSaveSuccess}</p>}

              <div className="pt-1 flex justify-end">
                <Button type="submit" variant="secondary" size="sm" icon={<Save size={16} />}>
                  Save LAN Config
                </Button>
              </div>
            </form>

            {/* Peer Sync Connection Form */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-700 space-y-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center space-x-1.5">
                <Wifi size={16} className="text-blue-500" />
                <span>Synchronize with Peer Instance</span>
              </h3>

              <form onSubmit={handleSyncWithPeer} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <TextField
                      label="Peer Machine IP"
                      placeholder="e.g. 192.168.1.105"
                      value={peerIp}
                      onChange={(e) => setPeerIp(e.target.value)}
                    />
                  </div>
                  <TextField
                    label="Peer Port"
                    type="number"
                    value={peerPort}
                    onChange={(e) => setPeerPort(Number(e.target.value))}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    icon={<RefreshCw size={16} />}
                    isLoading={isSyncingPeer}
                    disabled={!peerIp.trim()}
                  >
                    Sync Now
                  </Button>
                </div>

                {syncStatusMsg && (
                  <div className="text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 p-2.5 rounded-lg border border-green-200 dark:border-green-800 flex items-start space-x-2">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
                    <span>{syncStatusMsg}</span>
                  </div>
                )}

                {syncErrorMsg && (
                  <div className="text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 p-2.5 rounded-lg border border-rose-200 dark:border-rose-800 flex items-start space-x-2">
                    <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                    <span>{syncErrorMsg}</span>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Unencrypted DB Manual Export */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center space-x-2">
              <Database size={20} className="text-blue-500" />
              <span>Unencrypted DB Export</span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Export your unencrypted SQLite database for manual backup, migration, or third-party analysis.</p>
            <div className="pt-2">
              <Button 
                variant="secondary" 
                icon={<Download size={18} />}
                onClick={handleBackupDatabase}
                isLoading={isBackingUp}
              >
                Export Unencrypted DB (.db)
              </Button>
              {backupMessage && <p className="text-sm mt-2 font-medium text-green-500">{backupMessage}</p>}
              {backupError && <p className="text-sm mt-2 font-medium text-red-500">{backupError}</p>}
            </div>
          </div>


          {/* Audit Logs */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col max-h-[800px]">
          <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center space-x-2">
              <History size={20} className="text-blue-500" />
              <span>Audit Logs</span>
            </h2>
            <Button variant="secondary" onClick={() => fetchLogs(() => db.getAuditLogs())} isLoading={logsLoading}>
              Refresh
            </Button>
          </div>
          
          <div className="p-0 overflow-y-auto flex-1">
            {logsLoading && !auditLogsRes?.data ? (
              <div className="p-8 text-center text-slate-500">Loading logs...</div>
            ) : auditLogsRes?.error ? (
              <div className="p-8 text-center text-red-500">{auditLogsRes.error}</div>
            ) : auditLogsRes?.data?.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No audit logs found.</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {auditLogsRes?.data?.map((log) => (
                  <li key={log.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm text-slate-800 dark:text-slate-200">
                        {log.subject?.name || `Subject #${log.subjectId}`}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(log.changedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Changed <span className="font-semibold text-slate-700 dark:text-slate-300">{log.field}</span> from{' '}
                      <span className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded text-xs line-through">{log.oldValue}</span>{' '}
                      to{' '}
                      <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded text-xs">{log.newValue}</span>
                    </div>
                    {log.changedBy && (
                      <div className="text-xs text-slate-400 mt-2">
                        By: {log.changedBy}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        </div>
      </div>

      <Modal isOpen={!!newRecoveryKey} onClose={() => setNewRecoveryKey('')} title="New Recovery Key Generated">
        <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 mb-6 text-amber-800 dark:text-amber-200">
          <p className="font-medium text-sm">Action Required: Save this key immediately!</p>
          <p className="text-xs mt-1 opacity-80">This key is required to recover your database if you forget your password. Your old recovery key is no longer valid. This is the only time it will be shown.</p>
        </div>
        
        <div className="bg-slate-100 dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-700 text-center mb-6">
          <code className="text-2xl sm:text-3xl font-mono font-bold text-slate-800 dark:text-white tracking-widest">{newRecoveryKey}</code>
        </div>

        <div className="flex space-x-4">
          <Button 
            variant="secondary"
            className="flex-1"
            icon={<Copy size={18} />}
            onClick={() => {
              navigator.clipboard.writeText(newRecoveryKey)
              alert("Recovery key copied to clipboard!")
            }}
          >
            Copy
          </Button>
          <Button 
            className="flex-1"
            icon={<Printer size={18} />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </div>
      </Modal>

      {/* Borrowing Rule Add/Edit Modal */}
      <Modal isOpen={isRuleModalOpen} onClose={() => setIsRuleModalOpen(false)} title={ruleFormData.id ? "Edit Borrowing Rule" : "Add Borrowing Rule"}>
        <form onSubmit={handleSaveRule} className="space-y-4">
          <TextField
            label="Role or Grade Level"
            required
            placeholder="e.g. S.1-S.4, S.5-S.6, TEACHER"
            value={ruleFormData.roleOrGrade}
            onChange={(e) => setRuleFormData({ ...ruleFormData, roleOrGrade: e.target.value })}
            disabled={ruleFormData.roleOrGrade === 'DEFAULT'}
          />
          <TextField
            label="Max Books Allowed"
            type="number"
            required
            min={1}
            value={ruleFormData.maxBooksAllowed}
            onChange={(e) => setRuleFormData({ ...ruleFormData, maxBooksAllowed: parseInt(e.target.value, 10) || 1 })}
          />
          <TextField
            label="Borrow Duration (Days)"
            type="number"
            required
            min={1}
            value={ruleFormData.borrowDurationDays}
            onChange={(e) => setRuleFormData({ ...ruleFormData, borrowDurationDays: parseInt(e.target.value, 10) || 1 })}
          />
          <TextField
            label="Fine Per Overdue Day ($)"
            type="number"
            step="0.01"
            min={0}
            value={ruleFormData.finePerDay}
            onChange={(e) => setRuleFormData({ ...ruleFormData, finePerDay: parseFloat(e.target.value) || 0 })}
          />
          {ruleError && <div className="text-red-500 text-sm font-medium">{ruleError}</div>}
          <div className="pt-4 flex space-x-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setIsRuleModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Save Rule
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

