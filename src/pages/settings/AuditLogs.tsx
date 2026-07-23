import { useEffect } from 'react'
import { History } from 'lucide-react'
import { Button } from '../../components/Button'
import { db } from '../../lib/ipc-client'
import { useAsync } from '../../hooks/useAsync'
import type { AuditLog } from '../../lib/types'

export function AuditLogs() {
  const { data: auditLogsRes, isLoading: logsLoading, execute: fetchLogs } = useAsync<{ success: boolean, data?: AuditLog[], error?: string }>()

  useEffect(() => {
    fetchLogs(() => db.getAuditLogs())
  }, [fetchLogs])

  return (
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
  )
}
