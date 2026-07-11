import { useState, useEffect } from 'react'
import { Save, Moon, Sun, ShieldCheck, Key, Copy, Printer, History, Database, Download } from 'lucide-react'
import { useTheme } from '../hooks/ThemeContext'
import { validateMasterPassword } from '../lib/utils'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { useAsync } from '../hooks/useAsync'
import { db } from '../lib/ipc-client'
import type { AuditLog } from '../lib/types'
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure your application branding, preferences, and view system logs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
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
          {/* Data & Backup */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center space-x-2">
              <Database size={20} className="text-blue-500" />
              <span>Data & Backup</span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Export your unencrypted SQLite database for backup, migration, or third-party analysis.</p>
            <div className="pt-2">
              <Button 
                variant="secondary" 
                icon={<Download size={18} />}
                onClick={handleBackupDatabase}
                isLoading={isBackingUp}
              >
                Backup Database (.db)
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
    </div>
  )
}
