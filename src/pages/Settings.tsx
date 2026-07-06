import { useState } from 'react'
import { Save, Moon, Sun, ShieldCheck, Key, Copy, Printer, X } from 'lucide-react'
import { useTheme } from '../hooks/ThemeContext'
import { validateMasterPassword } from '../lib/utils'

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
    } catch (err: any) {
      setPasswordError(err.message || 'An error occurred')
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure your application branding and preferences.</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6 transition-colors">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">School Information</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">School Name</label>
            <input 
              type="text" 
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">School Motto</label>
            <input 
              type="text" 
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Academic Year</label>
            <input 
              type="text" 
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button className="flex items-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
            <Save size={18} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6 transition-colors">
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

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6 transition-colors">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center space-x-2">
          <ShieldCheck size={20} className="text-blue-500" />
          <span>Security</span>
        </h2>
        
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Change your master password. This will generate a new recovery key.</p>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Password</label>
            <input 
              type="password" 
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
            <input 
              type="password" 
              required
              minLength={8}
              pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}"
              title="Use at least 8 characters with uppercase, lowercase, and a number."
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm New Password</label>
            <input 
              type="password" 
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all"
            />
          </div>

          {passwordError && <div className="text-red-500 text-sm font-medium">{passwordError}</div>}
          {passwordSuccess && <div className="text-green-500 text-sm font-medium">{passwordSuccess}</div>}

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={isChangingPassword}
              className="flex items-center space-x-2 bg-slate-800 dark:bg-slate-700 text-white px-5 py-2.5 rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 transition-colors shadow-sm font-medium disabled:opacity-50"
            >
              <Key size={18} />
              <span>{isChangingPassword ? 'Changing...' : 'Change Password'}</span>
            </button>
          </div>
        </form>

        {newRecoveryKey && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in print:bg-white print:p-0 print:absolute print:inset-0">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 print:shadow-none print:border-none print:w-full print:max-w-none">
              <div className="bg-blue-600 p-6 text-white flex items-center justify-between print:hidden">
                <div className="flex items-center space-x-3">
                  <ShieldCheck size={28} className="text-blue-200" />
                  <h3 className="text-xl font-bold">New Recovery Key Generated</h3>
                </div>
                <button onClick={() => setNewRecoveryKey('')} className="text-blue-200 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 print:p-0">
                <div className="hidden print:flex items-center space-x-3 mb-6">
                  <ShieldCheck size={28} className="text-black" />
                  <h3 className="text-xl font-bold text-black">New Recovery Key Generated</h3>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 mb-8 print:hidden text-amber-800 dark:text-amber-200">
                  <p className="font-medium text-sm">Action Required: Save this key immediately!</p>
                  <p className="text-xs mt-1 opacity-80">This key is required to recover your database if you forget your password. Your old recovery key is no longer valid. This is the only time it will be shown.</p>
                </div>
                
                <p className="hidden print:block text-sm mb-4 text-black">Keep this document in a safe place. This key is required to recover your database if you forget your password. Your old recovery key is no longer valid.</p>

                <div className="bg-slate-100 dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-700 text-center mb-8 print:border-black print:bg-white">
                  <code className="text-3xl font-mono font-bold text-slate-800 dark:text-white tracking-widest print:text-black">{newRecoveryKey}</code>
                </div>

                <div className="flex space-x-4 print:hidden">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(newRecoveryKey)
                      alert("Recovery key copied to clipboard!")
                    }}
                    className="flex-1 flex items-center justify-center space-x-2 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
                  >
                    <Copy size={18} />
                    <span>Copy</span>
                  </button>
                  <button 
                    onClick={() => window.print()}
                    className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition-colors font-medium"
                  >
                    <Printer size={18} />
                    <span>Print</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
