import { useState, useEffect, useCallback } from 'react'
import { Network, Server, Wifi, RefreshCw, CheckCircle2, AlertCircle, Save } from 'lucide-react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { db } from '../../lib/ipc-client'

export function LanSync() {
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
    fetchLanConfig()
  }, [fetchLanConfig])

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
      } else {
        setSyncErrorMsg(res.error || 'Sync failed')
      }
    } catch (err: unknown) {
      setSyncErrorMsg(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setIsSyncingPeer(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center space-x-2">
          <Network size={20} className="text-blue-500" />
          <span>Multi-Desk LAN Sync</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Host Configuration */}
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-4 flex items-center space-x-1.5">
            <Server size={16} className="text-blue-500" />
            <span>This Machine's Configuration</span>
          </h3>

          <form onSubmit={handleSaveLanConfig} className="space-y-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lanSyncEnabled}
                onChange={(e) => setLanSyncEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Allow other machines to connect to this one</span>
            </label>

            <div className={`space-y-4 transition-opacity ${lanSyncEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  label="Local IP Address"
                  value={localIp}
                  disabled
                  helperText="Your machine's IP on the network"
                />
                <TextField
                  label="Sync Port"
                  type="number"
                  value={lanPort}
                  onChange={(e) => setLanPort(Number(e.target.value))}
                  required={lanSyncEnabled}
                />
              </div>
              <TextField
                label="Sync Passcode"
                type="password"
                value={lanPasscode}
                onChange={(e) => setLanPasscode(e.target.value)}
                required={lanSyncEnabled}
                helperText="Required for other machines to connect"
              />
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <Button type="submit" icon={<Save size={16} />} size="sm">
                Save & Restart Server
              </Button>
              {isServerRunning && (
                <span className="flex items-center text-xs font-medium text-green-500 bg-green-50 dark:bg-green-900/30 px-2.5 py-1 rounded-full border border-green-200 dark:border-green-800/50">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                  Listening
                </span>
              )}
            </div>

            {lanSaveSuccess && <p className="text-sm text-green-500 font-medium">{lanSaveSuccess}</p>}
          </form>

          {lastLanSyncAt && (
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Last successful sync: {new Date(lastLanSyncAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* Peer Sync Connection Form */}
        <div className="pt-4 md:pt-0 md:border-l md:border-t-0 border-t border-slate-100 dark:border-slate-700 md:pl-8 space-y-4">
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
    </div>
  )
}
