import { useState, useEffect, type FormEvent } from 'react'
import { db } from '../lib/ipc-client'
import { Lock, ShieldCheck, Key, Copy, Check, Eye, EyeOff } from 'lucide-react'
import { validateMasterPassword } from '../lib/utils'
import { useTheme } from '../hooks/ThemeContext'

export default function Login({ onUnlock }: { onUnlock: () => void }) {
  const { theme } = useTheme()
  const isChalk = theme === 'chalk'
  const [status, setStatus] = useState<'LOADING' | 'SETUP' | 'LOCKED'>('LOADING')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)

  useEffect(() => {
    let mounted = true
    db.checkDbStatus()
      .then(s => {
        if (mounted) setStatus(s)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to connect to database backend')
        setStatus('LOCKED')
      })
    return () => { mounted = false }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (status === 'SETUP') {
      const passwordError = validateMasterPassword(password)
      if (passwordError) {
        setError(passwordError)
        return
      }
    }

    setLoading(true)

    try {
      if (status === 'SETUP') {
        const res = await db.setupDb(password)
        if (res.success) {
          setRecoveryKey(res.recoveryKey || null)
        } else {
          setError(res.error || 'Setup failed')
        }
      } else {
        const res = await db.unlockDb({ password, isRecovery: isRecoveryMode })
        if (res.success) {
          onUnlock()
        } else {
          setError(res.error || 'Invalid password or recovery key')
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyRecoveryKey = async () => {
    if (!recoveryKey) return
    try {
      await navigator.clipboard.writeText(recoveryKey)
      setCopiedKey(true)
      window.setTimeout(() => setCopiedKey(false), 2500)
    } catch {
      // Clipboard API may be unavailable in restricted contexts
    }
  }

  if (status === 'LOADING') return null

  if (recoveryKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-100 dark:border-slate-800 text-center animate-fade-in">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Setup Complete</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">Your database is now encrypted. Please save this recovery key in a safe place. You can use it if you forget your password.</p>
          
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-4">
            <code className="text-base sm:text-lg font-mono font-bold text-slate-800 dark:text-white tracking-wider break-all select-all">{recoveryKey}</code>
          </div>

          <button
            type="button"
            onClick={handleCopyRecoveryKey}
            className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            {copiedKey ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
            <span>{copiedKey ? 'Copied to Clipboard!' : 'Copy Recovery Key'}</span>
          </button>

          <button 
            onClick={onUnlock}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            I have saved the recovery key
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="chalk-shell min-h-full flex items-center justify-center bg-[#F5F6F2] dark:bg-[#121615] p-6">
      <div className="chalk-hero max-w-md w-full bg-white dark:bg-[#191F1E] rounded-2xl shadow-lg p-8 border border-[#E3E6DE] dark:border-[#27302E] animate-fade-in">
        <div className="text-center mb-7">
          <div
            className={`w-24 h-24 mx-auto mb-4 rounded-2xl bg-[#182120] overflow-hidden flex items-center justify-center ${
              isChalk
                ? 'border-[1.5px] border-[#2b3a35] shadow-[3px_3px_0_#2b3a35]'
                : 'border border-[#27302E] shadow-xs'
            }`}
          >
            <img
              src="/assets/unslop/quantlib-desk-emblem.webp"
              alt="QuantLib"
              className="w-full h-full object-cover scale-105"
              draggable={false}
            />
          </div>
          <h1 className="chalk-ink text-2xl font-extrabold text-[#18201D] dark:text-[#EEF2EF] tracking-tight">
            {status === 'SETUP' ? 'Create Vault PIN / Password' : (isRecoveryMode ? 'Enter Recovery Key' : 'Unlock QuantLib')}
          </h1>
          <p className="chalk-muted text-[#5E6B65] dark:text-[#94A39D] mt-2 text-sm">
            {status === 'SETUP' 
              ? 'Choose a PIN or password (at least 4 characters) to encrypt your library database.' 
              : (isRecoveryMode ? 'Enter the recovery key provided during setup (XXXX-XXXX-...).' : 'Enter your PIN or password to open the circulation desk.')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                {isRecoveryMode ? <Key className="text-[#4a5c55]" size={18} /> : <Lock className="text-[#4a5c55]" size={18} />}
              </div>
              <input
                type={isRecoveryMode || showPassword ? 'text' : 'password'}
                required
                placeholder={isRecoveryMode ? 'XXXX-XXXX-XXXX-...' : 'Enter PIN or password'}
                minLength={status === 'SETUP' && !isRecoveryMode ? 4 : undefined}
                title={status === 'SETUP' && !isRecoveryMode ? 'Use at least 4 characters (PIN or password).' : undefined}
                className="chalk-input w-full pl-11 pr-11 py-3 bg-[#F5F6F2] dark:bg-[#121615] border border-[#DDE1D8] dark:border-[#27302E] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F6F54]/25 dark:focus:ring-[#2E9472]/30 focus:border-[#1F6F54] dark:focus:border-[#2E9472] text-[#18201D] dark:text-[#EEF2EF] transition-all text-base tracking-wide"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              {!isRecoveryMode && (
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#4a5c55] hover:text-[#2b3a35] dark:hover:text-[#EEF2EF] cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              )}
            </div>
          </div>

          {error && <div className="text-[#a82c1d] dark:text-[#E4836E] text-sm text-center font-semibold bg-[#a82c1d]/10 border border-[#a82c1d]/30 py-2 px-3 rounded-lg">{error}</div>}

          <button
            type="submit"
            disabled={loading || !password}
            className="chalk-btn-primary w-full bg-[#1F6F54] hover:bg-[#195C45] dark:bg-[#2E9472] dark:hover:bg-[#267D60] text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? 'Processing...' : (status === 'SETUP' ? 'Encrypt & Setup' : 'Open Circulation Desk')}
          </button>
        </form>

        {status === 'LOCKED' && (
          <div className="mt-6 text-center">
            <button 
              type="button" 
              onClick={() => { setIsRecoveryMode(!isRecoveryMode); setPassword(''); setError(''); }}
              className="chalk-slate text-sm font-semibold text-[#5E6B65] dark:text-[#94A39D] hover:text-[#a82c1d] dark:hover:text-[#3FB08A] transition-colors cursor-pointer"
            >
              {isRecoveryMode ? 'Use PIN / Password instead' : 'Forgot PIN? Use Recovery Key'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
