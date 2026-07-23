import { useState } from 'react'
import { ShieldCheck, Key, Copy, Printer } from 'lucide-react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { Modal } from '../../components/Modal'
import { validateMasterPassword } from '../../lib/utils'

export function Security() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [newRecoveryKey, setNewRecoveryKey] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

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

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center space-x-2">
          <ShieldCheck size={20} className="text-blue-500" />
          <span>Security</span>
        </h2>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <TextField
            label="Current Master Password"
            type="password"
            required
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
          <TextField
            label="New Master Password"
            type="password"
            required
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

          {passwordError && (
            <p className="text-sm font-medium text-red-500">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-sm font-medium text-green-500">{passwordSuccess}</p>
          )}

          <div className="pt-2">
            <Button type="submit" icon={<Key size={18} />} isLoading={isChangingPassword}>
              Change Master Password
            </Button>
          </div>
        </form>
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
    </>
  )
}
