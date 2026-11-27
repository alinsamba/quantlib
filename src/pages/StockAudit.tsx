import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react'
import {
  ClipboardCheck,
  Plus,
  CheckCircle,
  AlertTriangle,
  FileText,
  Search,
  Check,
  BookOpen,
  Calendar,
  User,
  ShieldAlert
} from 'lucide-react'
import { db } from '../lib/ipc-client'
import { ConfirmModal } from '../components/ConfirmModal'
import { SelectField } from '../components/TextField'
import type { StockAudit, StockAuditItem, Subject } from '../lib/types'

interface StockAuditRowProps {
  subject: Subject
  auditItem?: StockAuditItem
  edit?: { actualCount: number; notes: string }
  isReadOnly: boolean
  savingSubjectId: number | null
  onActualCountChange: (subjectId: number, val: number) => void
  onNotesChange: (subjectId: number, notes: string) => void
  onSaveItem: (subjectId: number) => void
}

const StockAuditRow = memo(function StockAuditRow({
  subject,
  auditItem,
  edit,
  isReadOnly,
  savingSubjectId,
  onActualCountChange,
  onNotesChange,
  onSaveItem
}: StockAuditRowProps) {
  const currentEdit = edit || {
    actualCount: auditItem
      ? auditItem.actualCount
      : Math.max(0, subject.openingCount + subject.recovered - subject.damaged - subject.lost - subject.issued),
    notes: auditItem?.notes || ''
  }

  const expected = auditItem
    ? auditItem.expectedCount
    : Math.max(0, subject.openingCount + subject.recovered - subject.damaged - subject.lost - subject.issued)

  const actual = currentEdit.actualCount
  const discrepancy = actual - expected

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3 align-middle font-semibold chalk-ink text-slate-900 dark:text-slate-100">
        <div className="flex items-center gap-2.5 min-w-[170px]">
          <BookOpen className="w-4 h-4 chalk-slate text-[#1F6F54] dark:text-[#3FB08A] shrink-0" />
          <span className="leading-snug">{subject.name}</span>
        </div>
      </td>
      <td className="px-3 py-3 align-middle whitespace-nowrap chalk-muted text-slate-500 dark:text-slate-400">
        <span className="chalk-badge inline-flex items-center px-2.5 py-1 bg-slate-100 dark:bg-[#191F1E] text-xs font-medium rounded-md whitespace-nowrap">
          {subject.category || 'General'}
        </span>
      </td>
      <td className="px-3 py-3 align-middle text-center font-semibold tabular-nums whitespace-nowrap chalk-ink text-slate-700 dark:text-slate-300">
        {expected}
      </td>
      <td className="px-3 py-3 align-middle text-center whitespace-nowrap">
        <input
          type="number"
          min="0"
          disabled={isReadOnly}
          value={currentEdit.actualCount}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10)
            onActualCountChange(subject.id, isNaN(val) ? 0 : val)
          }}
          className="chalk-input w-20 px-2 py-1 text-center font-bold tabular-nums bg-white dark:bg-[#191F1E] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[#2E9472]/40 focus:outline-none disabled:opacity-60"
        />
      </td>
      <td className="px-3 py-3 align-middle text-center whitespace-nowrap">
        <span
          className={`inline-flex items-center justify-center min-w-[2.25rem] font-bold px-2 py-1 text-xs rounded-md tabular-nums whitespace-nowrap ${
            discrepancy === 0
              ? 'chalk-badge bg-slate-100 text-slate-700 dark:bg-[#191F1E] dark:text-slate-300'
              : discrepancy < 0
              ? 'chalk-badge-danger bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
              : 'chalk-badge-warning bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
          }`}
        >
          {discrepancy > 0 ? `+${discrepancy}` : discrepancy}
        </span>
      </td>
      <td className="px-3 py-3 align-middle whitespace-nowrap">
        {discrepancy === 0 ? (
          <span className="chalk-status-success inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>Verified Match</span>
          </span>
        ) : discrepancy < 0 ? (
          <span className="chalk-status-danger inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-semibold whitespace-nowrap">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Missing ({Math.abs(discrepancy)})</span>
          </span>
        ) : (
          <span className="chalk-status-warning inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Extra (+{discrepancy})</span>
          </span>
        )}
      </td>
      <td className="px-3 py-3 align-middle min-w-[170px]">
        <input
          type="text"
          placeholder="Add shelf notes..."
          disabled={isReadOnly}
          value={currentEdit.notes}
          onChange={(e) => onNotesChange(subject.id, e.target.value)}
          className="chalk-input w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-[#191F1E] border border-[#E3E6DE] dark:border-[#27302E] rounded-md focus:outline-none focus:ring-1 focus:ring-[#2E9472]/40 disabled:opacity-60 text-slate-700 dark:text-slate-300"
        />
      </td>
      <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => onSaveItem(subject.id)}
          disabled={isReadOnly || savingSubjectId === subject.id}
          className="chalk-btn-primary px-3 py-1.5 bg-[#1F6F54] dark:bg-[#2E9472] hover:bg-[#195C45] dark:hover:bg-[#267D60] text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
        >
          {savingSubjectId === subject.id ? 'Saving...' : 'Save'}
        </button>
      </td>
    </tr>
  )
})

export default function StockAuditPage() {
  const [audits, setAudits] = useState<StockAudit[]>([])
  const [activeAudit, setActiveAudit] = useState<StockAudit | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filtering & Audit Form State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [auditorName, setAuditorName] = useState('LIBRARIAN')
  const [auditNotes, setAuditNotes] = useState('')
  const [itemEdits, setItemEdits] = useState<Record<number, { actualCount: number; notes: string }>>({})
  const [savingSubjectId, setSavingSubjectId] = useState<number | null>(null)
  const [completing, setCompleting] = useState(false)
  const [viewHistory, setViewHistory] = useState(false)
  const successTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const initItemEdits = useCallback((audit: StockAudit) => {
    const edits: Record<number, { actualCount: number; notes: string }> = {}
    if (audit.items) {
      for (const item of audit.items) {
        edits[item.subjectId] = {
          actualCount: item.actualCount,
          notes: item.notes || ''
        }
      }
    }
    setItemEdits(edits)
    setAuditNotes(audit.notes || '')
    if (audit.auditedBy) setAuditorName(audit.auditedBy)
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [auditsData, subjectsData] = await Promise.all([
        db.getStockAudits(),
        db.getSubjects()
      ])
      setAudits(auditsData || [])
      setSubjects(subjectsData || [])

      // Set active audit if an IN_PROGRESS audit exists
      const current = auditsData?.find((a: StockAudit) => a.status === 'IN_PROGRESS') || auditsData?.[0] || null
      setActiveAudit(current)

      if (current) {
        initItemEdits(current)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load stock audits')
    } finally {
      setLoading(false)
    }
  }, [initItemEdits])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleStartNewAudit = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const newAudit = await db.createStockAudit({
        auditedBy: auditorName.trim() || 'LIBRARIAN',
        notes: auditNotes.trim() || undefined
      })
      setSuccessMsg('New stock audit session started successfully.')
      await loadData()
      if (newAudit) {
        setActiveAudit(newAudit)
        initItemEdits(newAudit)
      }
      setViewHistory(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start stock audit')
    } finally {
      setLoading(false)
    }
  }, [auditorName, auditNotes, loadData, initItemEdits])

  const handleActualCountChange = useCallback((subjectId: number, val: number) => {
    setItemEdits((prev) => ({
      ...prev,
      [subjectId]: {
        actualCount: val,
        notes: prev[subjectId]?.notes || ''
      }
    }))
  }, [])

  const handleNotesChange = useCallback((subjectId: number, notes: string) => {
    setItemEdits((prev) => {
      const currentActual = prev[subjectId]?.actualCount
      const fallbackActual = currentActual !== undefined
        ? currentActual
        : (() => {
            const item = activeAudit?.items?.find((i) => i.subjectId === subjectId)
            if (item) return item.actualCount
            const sub = subjects.find((s) => s.id === subjectId)
            return sub ? Math.max(0, sub.openingCount + sub.recovered - sub.damaged - sub.lost - sub.issued) : 0
          })()

      return {
        ...prev,
        [subjectId]: {
          actualCount: fallbackActual,
          notes
        }
      }
    })
  }, [activeAudit, subjects])

  const handleSaveItem = useCallback(async (subjectId: number) => {
    if (!activeAudit) return
    const edit = itemEdits[subjectId]
    const sub = subjects.find((s) => s.id === subjectId)
    const existingItem = activeAudit?.items?.find((i) => i.subjectId === subjectId)
    const fallbackCount = existingItem
      ? existingItem.actualCount
      : (sub ? Math.max(0, sub.openingCount + sub.recovered - sub.damaged - sub.lost - sub.issued) : 0)
    const actualCount = edit?.actualCount !== undefined ? edit.actualCount : fallbackCount
    const notes = edit?.notes !== undefined ? edit.notes : (existingItem?.notes || '')

    try {
      setSavingSubjectId(subjectId)
      setError(null)
      const updatedItem = await db.saveStockAuditItem({
        auditId: activeAudit.id,
        subjectId,
        actualCount,
        notes
      })

      setActiveAudit((prev) => {
        if (!prev) return null
        const existingItems = prev.items || []
        const index = existingItems.findIndex((i) => i.subjectId === subjectId)
        let newItems: StockAuditItem[]
        if (index >= 0) {
          newItems = [...existingItems]
          newItems[index] = updatedItem
        } else {
          newItems = [...existingItems, updatedItem]
        }
        return { ...prev, items: newItems }
      })
      setSuccessMsg('Audited count saved.')
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current)
      successTimerRef.current = window.setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save item count')
    } finally {
      setSavingSubjectId(null)
    }
  }, [activeAudit, itemEdits, subjects])

  const [isCompleteConfirmOpen, setIsCompleteConfirmOpen] = useState(false)

  const handleCompleteAudit = useCallback(() => {
    if (!activeAudit) return
    setIsCompleteConfirmOpen(true)
  }, [activeAudit])

  const executeCompleteAudit = useCallback(async () => {
    if (!activeAudit) return
    try {
      setCompleting(true)
      setError(null)
      const completed = await db.completeStockAudit({
        auditId: activeAudit.id,
        notes: (auditNotes.trim() || activeAudit.notes) ?? undefined
      })
      setActiveAudit(completed)
      setIsCompleteConfirmOpen(false)
      setSuccessMsg('Stock audit session completed and inventory automatically reconciled!')
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to complete audit')
    } finally {
      setCompleting(false)
    }
  }, [activeAudit, auditNotes, loadData])

  const categories = useMemo(
    () => Array.from(new Set(subjects.map((s) => s.category || 'General'))),
    [subjects]
  )

  const filteredSubjects = useMemo(
    () =>
      subjects.filter((s) => {
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesCat = selectedCategory === 'ALL' || (s.category || 'General') === selectedCategory
        return matchesSearch && matchesCat
      }),
    [subjects, searchQuery, selectedCategory]
  )

  const auditItemsMap = useMemo(() => {
    const map = new Map<number, StockAuditItem>()
    if (activeAudit?.items) {
      for (const item of activeAudit.items) {
        map.set(item.subjectId, item)
      }
    }
    return map
  }, [activeAudit?.items])

  const metrics = useMemo(() => {
    let totalExpected = 0
    let totalActual = 0
    let totalDiscrepancy = 0
    let missingItemsCount = 0
    let misplacedItemsCount = 0

    subjects.forEach((s) => {
      const item = auditItemsMap.get(s.id)
      const edit = itemEdits[s.id]
      const exp = item ? item.expectedCount : Math.max(0, s.openingCount + s.recovered - s.damaged - s.lost - s.issued)
      const act = edit ? edit.actualCount : item ? item.actualCount : exp
      const disc = act - exp

      totalExpected += exp
      totalActual += act
      totalDiscrepancy += disc
      if (disc < 0) missingItemsCount += Math.abs(disc)
      if (disc > 0) misplacedItemsCount += disc
    })

    return { totalExpected, totalActual, totalDiscrepancy, missingItemsCount, misplacedItemsCount }
  }, [subjects, auditItemsMap, itemEdits])

  const isReadOnly = !activeAudit || activeAudit.status === 'COMPLETED'

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 chalk-card p-6">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-[#e9dcc0] border-[1.5px] border-[#2b3a35] text-[#2f5749] rounded-xl">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="chalk-ink text-2xl font-extrabold text-[#2b3a35]">Physical Stock Audit Mode</h1>
              <p className="chalk-muted text-sm text-[#4a5c55]">
                Shelf-by-shelf inventory verification, count variance tracking & discrepancy management
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(!activeAudit || activeAudit.status === 'COMPLETED') && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Auditor Name (e.g. J. Okello)"
                value={auditorName}
                onChange={(e) => setAuditorName(e.target.value)}
                className="chalk-input px-3 py-2 text-xs w-40"
              />
              <input
                type="text"
                placeholder="Session notes (e.g. Term 3 Audit)"
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                className="chalk-input px-3 py-2 text-xs w-48"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setViewHistory(!viewHistory)}
            className="chalk-btn-secondary flex items-center gap-2 px-4 py-2 text-sm font-semibold transition cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>{viewHistory ? 'Active Audit View' : 'Audit History'}</span>
          </button>

          {(!activeAudit || activeAudit.status === 'COMPLETED') && (
            <button
              type="button"
              onClick={handleStartNewAudit}
              disabled={loading}
              className="chalk-btn-primary flex items-center gap-2 px-4 py-2 text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Start New Audit Session</span>
            </button>
          )}

          {activeAudit && activeAudit.status === 'IN_PROGRESS' && (
            <button
              type="button"
              onClick={handleCompleteAudit}
              disabled={completing}
              className="chalk-btn-primary flex items-center gap-2 px-4 py-2 text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{completing ? 'Finalizing...' : 'Complete Audit'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg flex items-center space-x-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg flex items-center space-x-3">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Active Audit Session Bar */}
      {activeAudit && !viewHistory && (
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-4">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Audit Session</span>
              <span className="font-mono text-lg text-blue-400">#{activeAudit.id}</span>
              <span
                className={`px-3 py-1 text-xs rounded-full font-medium ${
                  activeAudit.status === 'IN_PROGRESS'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {activeAudit.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{new Date(activeAudit.auditDate).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-slate-400" />
                <span>Auditor: {activeAudit.auditedBy || 'LIBRARIAN'}</span>
              </div>
              {activeAudit.status === 'IN_PROGRESS' && (
                <input
                  type="text"
                  placeholder="Session summary notes before finalizing..."
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  className="px-3 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#2E9472]/40 w-64"
                />
              )}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-2">
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Expected Stock</p>
              <p className="text-xl font-bold text-slate-100">{metrics.totalExpected}</p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Actual Counted</p>
              <p className="text-xl font-bold text-slate-100">{metrics.totalActual}</p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Total Variance</p>
              <p
                className={`text-xl font-bold ${
                  metrics.totalDiscrepancy === 0
                    ? 'text-slate-100'
                    : metrics.totalDiscrepancy < 0
                    ? 'text-red-400'
                    : 'text-amber-400'
                }`}
              >
                {metrics.totalDiscrepancy > 0 ? `+${metrics.totalDiscrepancy}` : metrics.totalDiscrepancy}
              </p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Missing Books</p>
              <p className="text-xl font-bold text-red-400">{metrics.missingItemsCount}</p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Misplaced / Extra</p>
              <p className="text-xl font-bold text-amber-400">{metrics.misplacedItemsCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* History View */}
      {viewHistory ? (
        <div className="chalk-card overflow-hidden">
          <div className="p-6 border-b border-[#E3E6DE] dark:border-[#27302E]">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Audit History & Records</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Past shelf-by-shelf inventory verification sessions</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#191F1E]/80 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase">
                  <th className="p-4">Audit ID</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Auditor</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Expected / Actual</th>
                  <th className="p-4">Discrepancy</th>
                  <th className="p-4">Missing / Extra</th>
                  <th className="p-4">Notes</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {audits.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 dark:text-slate-400">
                      No stock audits recorded yet. Click "Start New Audit Session" to begin.
                    </td>
                  </tr>
                ) : (
                  audits.map((a) => {
                    const sum = a.summary || {
                      totalExpected: a.items?.reduce((acc, i) => acc + i.expectedCount, 0) || 0,
                      totalActual: a.items?.reduce((acc, i) => acc + i.actualCount, 0) || 0,
                      totalDiscrepancy: a.items?.reduce((acc, i) => acc + i.discrepancy, 0) || 0,
                      missingItems: a.items?.reduce((acc, i) => acc + (i.discrepancy < 0 ? Math.abs(i.discrepancy) : 0), 0) || 0,
                      misplacedItems: a.items?.reduce((acc, i) => acc + (i.discrepancy > 0 ? i.discrepancy : 0), 0) || 0
                    }

                    return (
                      <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-4 font-mono font-medium text-[#1F6F54] dark:text-[#3FB08A]">#{a.id}</td>
                        <td className="p-4 text-slate-700 dark:text-slate-300">{new Date(a.auditDate).toLocaleDateString()}</td>
                        <td className="p-4 text-slate-700 dark:text-slate-300">{a.auditedBy || 'LIBRARIAN'}</td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-0.5 text-xs rounded-full font-medium ${
                              a.status === 'IN_PROGRESS'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-700 dark:text-slate-300">
                          {sum.totalExpected} / <span className="font-semibold">{sum.totalActual}</span>
                        </td>
                        <td className="p-4">
                          <span
                            className={`font-semibold ${
                              sum.totalDiscrepancy === 0
                                ? 'text-slate-600 dark:text-slate-400'
                                : sum.totalDiscrepancy < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {sum.totalDiscrepancy > 0 ? `+${sum.totalDiscrepancy}` : sum.totalDiscrepancy}
                          </span>
                        </td>
                        <td className="p-4 text-xs">
                          <span className="text-red-600 dark:text-red-400 font-medium">-{sum.missingItems} missing</span>
                          <span className="mx-1 text-slate-400">|</span>
                          <span className="text-amber-600 dark:text-amber-400 font-medium">+{sum.misplacedItems} extra</span>
                        </td>
                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title={a.notes || ''}>
                          {a.notes || '-'}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAudit(a)
                              initItemEdits(a)
                              setViewHistory(false)
                            }}
                            className="chalk-btn-secondary px-3 py-1 text-xs font-semibold transition cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Inventory Verification Table View */
        <div className="chalk-card overflow-hidden">
          {/* Controls Header */}
          <div className="p-6 border-b chalk-divider border-[#E3E6DE] dark:border-[#27302E] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold chalk-ink text-slate-900 dark:text-slate-100">Shelf Verification Table</h2>
              <p className="text-sm chalk-muted text-slate-500 dark:text-slate-400">
                Scan or select subject titles, enter physical actual stock count, and save variance records
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#4a5c55]" />
                <input
                  type="text"
                  placeholder="Search subject or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="chalk-input w-full pl-9 pr-4 py-2 text-sm"
                />
              </div>

              <div className="min-w-[170px]">
                <SelectField
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Categories' },
                    ...categories.map((c) => ({ value: c, label: c }))
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Verification Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#191F1E]/80 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 whitespace-nowrap">Subject Title</th>
                  <th className="px-3 py-3 whitespace-nowrap">Category</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Expected</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Actual Count</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Variance</th>
                  <th className="px-3 py-3 whitespace-nowrap">Status</th>
                  <th className="px-3 py-3 whitespace-nowrap">Auditor Notes</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredSubjects.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 dark:text-slate-400">
                      No subjects found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredSubjects.map((subject) => (
                    <StockAuditRow
                      key={subject.id}
                      subject={subject}
                      auditItem={auditItemsMap.get(subject.id)}
                      edit={itemEdits[subject.id]}
                      isReadOnly={isReadOnly}
                      savingSubjectId={savingSubjectId}
                      onActualCountChange={handleActualCountChange}
                      onNotesChange={handleNotesChange}
                      onSaveItem={handleSaveItem}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isCompleteConfirmOpen}
        title="Finalize Stock Audit"
        message="Are you sure you want to complete and finalize this stock audit session? Missing copies will be written off as LOST and extra copies added as RECOVERED."
        confirmLabel="Complete & Reconcile"
        variant="primary"
        isLoading={completing}
        onConfirm={executeCompleteAudit}
        onCancel={() => setIsCompleteConfirmOpen(false)}
      />
    </div>
  )
}
