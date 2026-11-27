import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Search,
  Download,
  RefreshCw,
  BookOpen,
  Calendar,
  FileText
} from 'lucide-react'
import { db } from '../lib/ipc-client'
import { exportToCsv } from '../lib/exportUtils'
import { SelectField } from '../components/TextField'
import type { CirculationLog } from '../lib/types'

type ActionFilter = 'ALL' | 'BORROW' | 'RETURN' | 'RENEW'
type DateRangeFilter = 'ALL' | 'TODAY' | '7D' | '30D'

function formatCondition(cond: number | null): { label: string; badgeClass: string } {
  if (cond === 3) {
    return {
      label: 'Good (3/3)',
      badgeClass: 'chalk-badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
    }
  }
  if (cond === 2) {
    return {
      label: 'Fair (2/3)',
      badgeClass: 'chalk-badge-warning bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
    }
  }
  if (cond === 1) {
    return {
      label: 'Poor (1/3)',
      badgeClass: 'chalk-badge-danger bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300'
    }
  }
  return {
    label: '—',
    badgeClass: 'chalk-badge bg-slate-100 text-slate-600 dark:bg-[#191F1E] dark:text-slate-400'
  }
}

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return { date: iso, time: '' }
  }
  return {
    date: d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function CirculationLogPage() {
  const [logs, setLogs] = useState<CirculationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL')
  const [dateRange, setDateRange] = useState<DateRangeFilter>('ALL')

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await db.getCirculationLogs()
      setLogs(data || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load circulation log')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const stats = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    let borrows = 0
    let returns = 0
    let renewals = 0
    let todayCount = 0

    for (const entry of logs) {
      if (entry.action === 'BORROW') borrows++
      else if (entry.action === 'RETURN') returns++
      else if (entry.action === 'RENEW') renewals++

      const dt = new Date(entry.loggedAt)
      if (!Number.isNaN(dt.getTime()) && dt >= startOfToday) {
        todayCount++
      }
    }

    return {
      total: logs.length,
      borrows,
      returns,
      renewals,
      todayCount
    }
  }, [logs])

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    return logs.filter((entry) => {
      if (actionFilter !== 'ALL' && entry.action !== actionFilter) {
        return false
      }

      if (dateRange !== 'ALL') {
        const dt = new Date(entry.loggedAt)
        if (Number.isNaN(dt.getTime())) return false
        if (dateRange === 'TODAY' && dt < startOfToday) return false
        if (dateRange === '7D' && now.getTime() - dt.getTime() > 7 * 86_400_000) return false
        if (dateRange === '30D' && now.getTime() - dt.getTime() > 30 * 86_400_000) return false
      }

      if (!q) return true
      return (
        entry.studentName.toLowerCase().includes(q) ||
        (entry.studentClass || '').toLowerCase().includes(q) ||
        entry.subjectName.toLowerCase().includes(q) ||
        (entry.notes || '').toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q)
      )
    })
  }, [logs, searchQuery, actionFilter, dateRange])

  const handleExportCsv = useCallback(() => {
    const rows = filteredLogs.map((entry) => ({
      'Log ID': entry.id,
      'Date & Time': new Date(entry.loggedAt).toLocaleString(),
      'Action': entry.action,
      'Borrower': entry.studentName,
      'Class / Role': entry.studentClass || '',
      'Subject': entry.subjectName,
      'Condition': entry.condition ?? '',
      'Due Date': formatShortDate(entry.dueDate),
      'Notes': entry.notes || ''
    }))
    exportToCsv(rows, 'QuantLib_Borrow_Return_Log')
  }, [filteredLogs])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold chalk-ink text-slate-900 dark:text-slate-100">
            Borrow &amp; Return Log
          </h1>
          <p className="text-sm chalk-muted text-slate-500 dark:text-slate-400">
            Automatic ledger of every book borrowed, renewed, and returned
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="chalk-btn-secondary flex items-center gap-2 px-3.5 py-2 text-sm font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="chalk-btn-primary flex items-center gap-2 px-4 py-2 text-sm font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="chalk-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider chalk-muted text-slate-500 dark:text-slate-400">
            Total Logged Events
          </p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums chalk-ink text-slate-900 dark:text-slate-100">
            {stats.total}
          </p>
        </div>
        <div className="chalk-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider chalk-muted text-slate-500 dark:text-slate-400">
            Books Borrowed
          </p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums chalk-status-warning text-amber-700 dark:text-amber-400">
            {stats.borrows}
          </p>
        </div>
        <div className="chalk-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider chalk-muted text-slate-500 dark:text-slate-400">
            Books Returned
          </p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums chalk-status-success text-emerald-700 dark:text-emerald-400">
            {stats.returns}
          </p>
        </div>
        <div className="chalk-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider chalk-muted text-slate-500 dark:text-slate-400">
            Logged Today
          </p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums chalk-ink text-slate-900 dark:text-slate-100">
            {stats.todayCount}
          </p>
        </div>
      </div>

      {/* Log Table Card */}
      <div className="chalk-card overflow-hidden">
        {/* Filter Controls */}
        <div className="p-5 border-b chalk-divider border-[#E3E6DE] dark:border-[#27302E] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 chalk-slate text-[#1F6F54] dark:text-[#3FB08A]" />
            <h2 className="text-base font-bold chalk-ink text-slate-900 dark:text-slate-100">
              Circulation Ledger
            </h2>
            <span className="chalk-badge px-2 py-0.5 text-xs font-semibold rounded-md tabular-nums">
              {filteredLogs.length}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#4a5c55]" />
              <input
                type="text"
                placeholder="Search student, class, subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="chalk-input w-full pl-9 pr-4 py-2 text-sm"
              />
            </div>

            <div className="min-w-[150px]">
              <SelectField
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
                options={[
                  { value: 'ALL', label: 'All Actions' },
                  { value: 'BORROW', label: 'Borrowed' },
                  { value: 'RETURN', label: 'Returned' },
                  { value: 'RENEW', label: 'Renewed' }
                ]}
              />
            </div>

            <div className="min-w-[150px]">
              <SelectField
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRangeFilter)}
                options={[
                  { value: 'ALL', label: 'All Time' },
                  { value: 'TODAY', label: 'Today' },
                  { value: '7D', label: 'Last 7 Days' },
                  { value: '30D', label: 'Last 30 Days' }
                ]}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#191F1E]/80 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">
                <th className="px-4 py-3 whitespace-nowrap">Date &amp; Time</th>
                <th className="px-3 py-3 whitespace-nowrap">Action</th>
                <th className="px-3 py-3 whitespace-nowrap">Borrower</th>
                <th className="px-3 py-3 whitespace-nowrap">Subject</th>
                <th className="px-3 py-3 text-center whitespace-nowrap">Condition</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center chalk-muted text-slate-500 dark:text-slate-400">
                    Loading borrow &amp; return log...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center chalk-muted text-slate-500 dark:text-slate-400">
                    {logs.length === 0
                      ? 'No borrow or return events recorded yet. Issue or return a book from the Circulation Desk to start logging.'
                      : 'No log entries match your current search or filters.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((entry) => {
                  const { date, time } = formatDateTime(entry.loggedAt)
                  const cond = formatCondition(entry.condition)
                  const isBorrow = entry.action === 'BORROW'
                  const isReturn = entry.action === 'RETURN'

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 align-middle whitespace-nowrap tabular-nums">
                        <div className="font-medium chalk-ink text-slate-900 dark:text-slate-100">{date}</div>
                        {time && (
                          <div className="text-xs chalk-muted text-slate-500 dark:text-slate-400">{time}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle whitespace-nowrap">
                        {isBorrow ? (
                          <span className="chalk-badge-warning inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 whitespace-nowrap">
                            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                            <span>Borrowed</span>
                          </span>
                        ) : isReturn ? (
                          <span className="chalk-badge chalk-status-success inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 whitespace-nowrap">
                            <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                            <span>Returned</span>
                          </span>
                        ) : (
                          <span className="chalk-badge inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 dark:bg-[#191F1E] dark:text-slate-300 whitespace-nowrap">
                            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                            <span>Renewed</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold chalk-ink text-slate-900 dark:text-slate-100">
                            {entry.studentName}
                          </span>
                          {entry.studentClass && (
                            <span className="chalk-badge inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded bg-slate-100 text-slate-600 dark:bg-[#191F1E] dark:text-slate-300 whitespace-nowrap">
                              {entry.studentClass}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 chalk-slate text-[#1F6F54] dark:text-[#3FB08A] shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium chalk-ink text-slate-900 dark:text-slate-100 leading-snug">
                              {entry.subjectName}
                            </div>
                            {entry.notes && (
                              <div
                                className="text-xs chalk-muted text-slate-500 dark:text-slate-400 truncate max-w-[260px]"
                                title={entry.notes}
                              >
                                {entry.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${cond.badgeClass}`}>
                          {cond.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-right whitespace-nowrap tabular-nums chalk-muted text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 shrink-0 opacity-70" />
                          <span>{formatShortDate(entry.dueDate)}</span>
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
