import { useState, useEffect, type FormEvent } from 'react'
import { db } from '../lib/ipc-client'
import { Lock, ShieldCheck, Key } from 'lucide-react'
import { validateMasterPassword } from '../lib/utils'

export default function Login({ onUnlock }: { onUnlock: () => void }) {
  const [status, setStatus] = useState<'LOADING' | 'SETUP' | 'LOCKED'>('LOADING')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)

  useEffect(() => {
    db.checkDbStatus()
      .then(s => setStatus(s))
      .catch((err: unknown) => {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to connect to backend')
        setStatus('SETUP') // or render an error state
      })
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

  if (status === 'LOADING') return null

  if (recoveryKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-100 dark:border-slate-800 text-center animate-fade-in">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Setup Complete</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8">Your database is now encrypted. Please save this recovery key in a safe place. You can use it if you forget your password.</p>
          
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-8">
            <code className="text-xl font-mono font-bold text-slate-800 dark:text-white tracking-widest">{recoveryKey}</code>
          </div>

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-100 dark:border-slate-800 animate-fade-in">
        <div className="text-center mb-8">
          <img src="/quantlib.svg" alt="Logo" className="w-16 h-16 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            {status === 'SETUP' ? 'Create Master Password' : (isRecoveryMode ? 'Enter Recovery Key' : 'Unlock QuantLib')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            {status === 'SETUP' 
              ? 'This password will be used to encrypt your database.' 
              : (isRecoveryMode ? 'Use the 16-character key provided during setup.' : 'Enter your master password to access your data.')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                {isRecoveryMode ? <Key className="text-slate-400" size={20} /> : <Lock className="text-slate-400" size={20} />}
              </div>
              <input
                type={isRecoveryMode ? 'text' : 'password'}
                required
                minLength={status === 'SETUP' && !isRecoveryMode ? 8 : undefined}
                pattern={status === 'SETUP' && !isRecoveryMode ? '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}' : undefined}
                title={status === 'SETUP' && !isRecoveryMode ? 'Use at least 8 characters with uppercase, lowercase, and a number.' : undefined}
                placeholder={isRecoveryMode ? 'XXXX-XXXX-XXXX-XXXX' : '••••••••'}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all text-lg tracking-wider"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="text-red-500 text-sm text-center font-medium bg-red-50 dark:bg-red-900/20 py-2 rounded-lg">{error}</div>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : (status === 'SETUP' ? 'Encrypt & Setup' : 'Unlock Database')}
          </button>
        </form>

        {status === 'LOCKED' && (
          <div className="mt-6 text-center">
            <button 
              type="button" 
              onClick={() => { setIsRecoveryMode(!isRecoveryMode); setPassword(''); setError(''); }}
              className="text-sm text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {isRecoveryMode ? 'Use Master Password instead' : 'Lost password? Use Recovery Key'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
