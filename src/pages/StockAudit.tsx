import { useState, useEffect } from 'react'
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
import type { StockAudit, StockAuditItem, Subject } from '../lib/types'

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
  const [auditorName] = useState('LIBRARIAN')
  const [auditNotes] = useState('')
  const [itemEdits, setItemEdits] = useState<Record<number, { actualCount: number; notes: string }>>({})
  const [savingSubjectId, setSavingSubjectId] = useState<number | null>(null)
  const [completing, setCompleting] = useState(false)
  const [viewHistory, setViewHistory] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
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
    } catch (err: any) {
      setError(err.message || 'Failed to load stock audits')
    } finally {
      setLoading(false)
    }
  }

  function initItemEdits(audit: StockAudit) {
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
  }

  async function handleStartNewAudit() {
    try {
      setLoading(true)
      setError(null)
      const newAudit = await db.createStockAudit({ auditedBy: auditorName, notes: auditNotes })
      setSuccessMsg('New stock audit session started successfully.')
      await loadData()
      if (newAudit) {
        setActiveAudit(newAudit)
        initItemEdits(newAudit)
      }
      setViewHistory(false)
    } catch (err: any) {
      setError(err.message || 'Failed to start stock audit')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveItem(subjectId: number) {
    if (!activeAudit) return
    const edit = itemEdits[subjectId]
    if (!edit) return

    try {
      setSavingSubjectId(subjectId)
      setError(null)
      const updatedItem = await db.saveStockAuditItem({
        auditId: activeAudit.id,
        subjectId,
        actualCount: edit.actualCount,
        notes: edit.notes
      })

      // Update active audit in state locally
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
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save item count')
    } finally {
      setSavingSubjectId(null)
    }
  }

  async function handleCompleteAudit() {
    if (!activeAudit) return
    if (!window.confirm('Are you sure you want to complete and finalize this stock audit session?')) return

    try {
      setCompleting(true)
      setError(null)
      const completed = await db.completeStockAudit({
        auditId: activeAudit.id,
        notes: (auditNotes || activeAudit.notes) ?? undefined
      })
      setActiveAudit(completed)
      setSuccessMsg('Stock audit session completed and finalized!')
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to complete audit')
    } finally {
      setCompleting(false)
    }
  }

  // Helper calculations for active session
  const categories = Array.from(new Set(subjects.map((s) => s.category || 'General')))

  const filteredSubjects = subjects.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCat = selectedCategory === 'ALL' || (s.category || 'General') === selectedCategory
    return matchesSearch && matchesCat
  })

  // Summary Metrics
  const auditItemsMap = new Map<number, StockAuditItem>()
  if (activeAudit?.items) {
    for (const item of activeAudit.items) {
      auditItemsMap.set(item.subjectId, item)
    }
  }

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Physical Stock Audit Mode</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Shelf-by-shelf inventory verification, count variance tracking & discrepancy management
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setViewHistory(!viewHistory)}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            <FileText className="w-4 h-4" />
            <span>{viewHistory ? 'Active Audit View' : 'Audit History'}</span>
          </button>

          {(!activeAudit || activeAudit.status === 'COMPLETED') && (
            <button
              onClick={handleStartNewAudit}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Start New Audit Session</span>
            </button>
          )}

          {activeAudit && activeAudit.status === 'IN_PROGRESS' && (
            <button
              onClick={handleCompleteAudit}
              disabled={completing}
              className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 font-medium"
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

            <div className="flex items-center space-x-6 text-sm text-slate-300">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{new Date(activeAudit.auditDate).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-slate-400" />
                <span>Auditor: {activeAudit.auditedBy || 'LIBRARIAN'}</span>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-2">
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Expected Stock</p>
              <p className="text-xl font-bold text-slate-100">{totalExpected}</p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Actual Counted</p>
              <p className="text-xl font-bold text-slate-100">{totalActual}</p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Total Variance</p>
              <p
                className={`text-xl font-bold ${
                  totalDiscrepancy === 0 ? 'text-slate-100' : totalDiscrepancy < 0 ? 'text-red-400' : 'text-amber-400'
                }`}
              >
                {totalDiscrepancy > 0 ? `+${totalDiscrepancy}` : totalDiscrepancy}
              </p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Missing Books</p>
              <p className="text-xl font-bold text-red-400">{missingItemsCount}</p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400">Misplaced / Extra</p>
              <p className="text-xl font-bold text-amber-400">{misplacedItemsCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* History View */}
      {viewHistory ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Audit History & Records</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Past shelf-by-shelf inventory verification sessions</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase">
                  <th className="p-4">Audit ID</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Auditor</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Expected / Actual</th>
                  <th className="p-4">Discrepancy</th>
                  <th className="p-4">Missing / Extra</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {audits.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 dark:text-slate-400">
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
                        <td className="p-4 font-mono font-medium text-blue-600 dark:text-blue-400">#{a.id}</td>
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
                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              setActiveAudit(a)
                              initItemEdits(a)
                              setViewHistory(false)
                            }}
                            className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded transition"
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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-4">
          {/* Controls Header */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Shelf Verification Table</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Scan or select subject titles, enter physical actual stock count, and save variance records
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search subject or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="py-2 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Verification Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase">
                  <th className="p-4">Subject Title</th>
                  <th className="p-4">Category</th>
                  <th className="p-4 text-center">System Expected</th>
                  <th className="p-4 text-center">Actual Physical Count</th>
                  <th className="p-4 text-center">Variance</th>
                  <th className="p-4">Status Flag</th>
                  <th className="p-4">Auditor Notes</th>
                  <th className="p-4 text-right">Action</th>
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
                  filteredSubjects.map((subject) => {
                    const item = auditItemsMap.get(subject.id)
                    const edit = itemEdits[subject.id] || {
                      actualCount: item
                        ? item.actualCount
                        : Math.max(0, subject.openingCount + subject.recovered - subject.damaged - subject.lost - subject.issued),
                      notes: item?.notes || ''
                    }

                    const expected = item
                      ? item.expectedCount
                      : Math.max(0, subject.openingCount + subject.recovered - subject.damaged - subject.lost - subject.issued)

                    const actual = edit.actualCount
                    const discrepancy = actual - expected
                    const isReadOnly = !activeAudit || activeAudit.status === 'COMPLETED'

                    return (
                      <tr key={subject.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-medium text-slate-900 dark:text-slate-100 flex items-center space-x-3">
                          <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span>{subject.name}</span>
                        </td>
                        <td className="p-4 text-slate-500 dark:text-slate-400">
                          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-xs rounded-md">
                            {subject.category || 'General'}
                          </span>
                        </td>
                        <td className="p-4 text-center font-semibold text-slate-700 dark:text-slate-300">{expected}</td>
                        <td className="p-4 text-center">
                          <input
                            type="number"
                            min="0"
                            disabled={isReadOnly}
                            value={edit.actualCount}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10)
                              setItemEdits((prev) => ({
                                ...prev,
                                [subject.id]: {
                                  ...edit,
                                  actualCount: isNaN(val) ? 0 : val
                                }
                              }))
                            }}
                            className="w-20 px-2 py-1 text-center font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
                          />
                        </td>
                        <td className="p-4 text-center">
                          <span
                            className={`font-bold px-2.5 py-1 text-xs rounded-md ${
                              discrepancy === 0
                                ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : discrepancy < 0
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {discrepancy > 0 ? `+${discrepancy}` : discrepancy}
                          </span>
                        </td>
                        <td className="p-4">
                          {discrepancy === 0 ? (
                            <span className="flex items-center space-x-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle className="w-4 h-4" />
                              <span>Verified Match</span>
                            </span>
                          ) : discrepancy < 0 ? (
                            <span className="flex items-center space-x-1 text-xs text-red-600 dark:text-red-400 font-medium">
                              <AlertTriangle className="w-4 h-4" />
                              <span>Missing ({Math.abs(discrepancy)})</span>
                            </span>
                          ) : (
                            <span className="flex items-center space-x-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                              <AlertTriangle className="w-4 h-4" />
                              <span>Misplaced / Extra (+{discrepancy})</span>
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <input
                            type="text"
                            placeholder="Add shelf notes..."
                            disabled={isReadOnly}
                            value={edit.notes}
                            onChange={(e) => {
                              setItemEdits((prev) => ({
                                ...prev,
                                [subject.id]: {
                                  ...edit,
                                  notes: e.target.value
                                }
                              }))
                            }}
                            className="w-full px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 text-slate-700 dark:text-slate-300"
                          />
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleSaveItem(subject.id)}
                            disabled={isReadOnly || savingSubjectId === subject.id}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition disabled:opacity-50"
                          >
                            {savingSubjectId === subject.id ? 'Saving...' : 'Save'}
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
      )}
    </div>
  )
}
