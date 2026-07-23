import { useState } from 'react'
import { Database, Download } from 'lucide-react'
import { Button } from '../../components/Button'
import { db } from '../../lib/ipc-client'

export function DatabaseExport() {
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
  )
}
