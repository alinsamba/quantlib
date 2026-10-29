import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, Upload, Printer, RotateCcw, BookOpen, CalendarPlus, Trash2, AlertTriangle } from 'lucide-react'
import { exportToExcel, exportToCsv, parseSpreadsheetFile } from '../lib/exportUtils'
import { db } from '../lib/ipc-client'
import { calculateAvailable } from '../lib/utils'
import { Button } from '../components/Button'
import { TextField, SelectField, TextAreaField } from '../components/TextField'
import { Modal } from '../components/Modal'
import { useAsync } from '../hooks/useAsync'
import type { Subject, BorrowingRule, Checkout } from '../lib/types'

export default function Inventory() {
  const location = useLocation()
  const [searchTerm, setSearchTerm] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const { data: subjects, isLoading: subjectsLoading, error: subjectsError, execute: fetchSubjects } = useAsync<Subject[]>()
  const [borrowingRules, setBorrowingRules] = useState<BorrowingRule[]>([])
  const [allActiveCheckouts, setAllActiveCheckouts] = useState<Checkout[]>([])
  const [isIssuing, setIsIssuing] = useState(false)
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (location.state?.openAdd) {
      setIsAddModalOpen(true)
    }
    if (location.state?.filterSubject) {
      setSearchTerm(location.state.filterSubject)
    }
    if (location.state?.filterLowStock) {
      setLowStockOnly(true)
    }
  }, [location.state])

  const loadActiveCheckouts = useCallback(async () => {
    try {
      const list = await db.getActiveCheckouts()
      setAllActiveCheckouts(Array.isArray(list) ? list : [])
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    db.getBorrowingRules()
      .then((rules) => setBorrowingRules(rules || []))
      .catch((err: unknown) => console.error(err))
    loadActiveCheckouts()
  }, [loadActiveCheckouts])

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newSubject, setNewSubject] = useState({ name: '', category: 'General', openingCount: 0, notes: '' })

  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const [issueData, setIssueData] = useState({ subjectId: 0, studentName: '', studentClass: '', conditionOut: 3 })
  const [selectedSubjectName, setSelectedSubjectName] = useState('')

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editSubject, setEditSubject] = useState({
    id: 0,
    name: '',
    category: '',
    openingCount: 0,
    recovered: 0,
    damaged: 0,
    lost: 0,
    notes: ''
  })

  // Active Loans Directory Modal State
  const [isActiveLoansModalOpen, setIsActiveLoansModalOpen] = useState(false)
  const [loansSearchQuery, setLoansSearchQuery] = useState('')
  const [renewingId, setRenewingId] = useState<number | null>(null)

  // Return Book Modal State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [returnSubjectName, setReturnSubjectName] = useState('')
  const [activeCheckoutsForReturn, setActiveCheckoutsForReturn] = useState<Checkout[]>([])
  const [selectedCheckoutIdToReturn, setSelectedCheckoutIdToReturn] = useState<number>(0)
  const [returnConditionIn, setReturnConditionIn] = useState<number>(3)
  const [returnModalLoading, setReturnModalLoading] = useState(false)
  const [returnModalSubmitting, setReturnModalSubmitting] = useState(false)
  const [returnModalError, setReturnModalError] = useState('')

  useEffect(() => {
    fetchSubjects(async () => {
      return db.getSubjects()
    })
  }, [fetchSubjects])

  // Known students and classes for autocomplete
  const knownStudentNames = useMemo(() => {
    return Array.from(new Set(allActiveCheckouts.map((c) => c.studentName).filter(Boolean)))
  }, [allActiveCheckouts])

  const knownStudentClasses = useMemo(() => {
    return Array.from(new Set(allActiveCheckouts.map((c) => c.studentClass || '').filter(Boolean)))
  }, [allActiveCheckouts])

  const handleImportSpreadsheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportNotice(null)
    try {
      const rows = await parseSpreadsheetFile(file)
      let imported = 0
      for (const row of rows) {
        const rawName = String(row.Subject || row['Subject Name'] || row.name || row.Name || '').trim()
        if (!rawName) continue
        const rawCategory = String(row.Category || row.category || 'General').trim() || 'General'
        const rawOpening = Number(row['Opening Stock'] ?? row.openingCount ?? row.Opening ?? 0)
        const rawNotes = String(row.Notes || row.notes || '').trim()

        await db.addSubject({
          name: rawName,
          category: rawCategory,
          openingCount: Number.isNaN(rawOpening) ? 0 : Math.max(0, rawOpening),
          notes: rawNotes || null
        })
        imported++
      }
      setImportNotice(`Successfully imported ${imported} subject(s) from ${file.name}.`)
      fetchSubjects(() => db.getSubjects())
    } catch (err: unknown) {
      setImportNotice(`Import error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAddSubject = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await db.addSubject({
        name: newSubject.name,
        category: newSubject.category,
        openingCount: Number(newSubject.openingCount),
        notes: newSubject.notes.trim() || null
      })
      
      setIsAddModalOpen(false)
      setNewSubject({ name: '', category: 'General', openingCount: 0, notes: '' })
      fetchSubjects(async () => {
        return db.getSubjects()
      })
    } catch (err: unknown) {
      console.error('Error adding subject', err)
      alert('Failed to add subject: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [newSubject, fetchSubjects])

  // Memoize filtered subjects
  const filtered = useMemo(() =>
    (subjects || []).filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.notes || '').toLowerCase().includes(searchTerm.toLowerCase())
      if (!matchesSearch) return false
      if (lowStockOnly && calculateAvailable(s) >= 5) return false
      return true
    }),
    [subjects, searchTerm, lowStockOnly]
  )

  const subjectsMap = useMemo(() => {
    const map = new Map<number, Subject>()
    for (const subject of subjects || []) {
      map.set(subject.id, subject)
    }
    return map
  }, [subjects])

  const activeRule = useMemo(() => {
    if (!borrowingRules || borrowingRules.length === 0) {
      return { roleOrGrade: 'DEFAULT', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0 }
    }
    const studentClass = issueData.studentClass?.trim() || ''
    if (!studentClass) {
      return borrowingRules.find(r => r.roleOrGrade === 'DEFAULT') || borrowingRules[0]
    }
    const normalized = studentClass.toUpperCase()
    const exact = borrowingRules.find(r => r.roleOrGrade.toUpperCase() === normalized)
    if (exact) return exact

    const classMatch = normalized.match(/^([A-Z]+)[.\s]*(\d+)/i)
    if (classMatch) {
      const [, classPrefix, classNumStr] = classMatch
      const classNum = parseInt(classNumStr, 10)

      for (const rule of borrowingRules) {
        const key = rule.roleOrGrade.toUpperCase()
        if (key.includes('-')) {
          const rangeMatch = key.match(/^([A-Z]+)[.\s]*(\d+)\s*-\s*([A-Z]+)[.\s]*(\d+)$/i)
          if (rangeMatch) {
            const [, rPre1, rStart, rPre2, rEnd] = rangeMatch
            if (classPrefix.toUpperCase() === rPre1.toUpperCase() && rPre1.toUpperCase() === rPre2.toUpperCase()) {
              const startNum = parseInt(rStart, 10)
              const endNum = parseInt(rEnd, 10)
              if (classNum >= startNum && classNum <= endNum) {
                return rule
              }
            }
          }
        }
      }
    }

    return borrowingRules.find(r => r.roleOrGrade === 'DEFAULT') || borrowingRules[0]
  }, [borrowingRules, issueData.studentClass])

  const calculatedDueDateStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + (activeRule?.borrowDurationDays || 14))
    return d.toISOString().split('T')[0]
  }, [activeRule])

  const formattedCalculatedDueDate = useMemo(() => {
    return new Date(calculatedDueDateStr).toLocaleDateString()
  }, [calculatedDueDateStr])

  const handleIssueSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (isIssuing) return
    setIsIssuing(true)
    try {
      const subject = subjectsMap.get(issueData.subjectId)

      if (!subject || calculateAvailable(subject) <= 0) {
        alert('No available books for this subject.')
        return
      }

      const avgCond = subject.averageCondition ?? 3.0
      if (avgCond <= 1.5) {
        alert(`Cannot checkout "${subject.name}": Book average condition is too poor (${avgCond.toFixed(1)}/3.0 <= 1.5). Subject requires replenishment or maintenance.`)
        return
      }

      if (issueData.studentName.trim()) {
        const clearanceRes = await db.getClearanceStatus({
          studentName: issueData.studentName.trim(),
          studentClass: issueData.studentClass.trim() || undefined
        })
        if (clearanceRes && !clearanceRes.success) {
          throw new Error(clearanceRes.error || 'Failed to check student clearance status')
        }
        if (clearanceRes && clearanceRes.success && clearanceRes.data) {
          const activeCheckouts = clearanceRes.data.activeCheckouts || []
          const maxAllowed = activeRule?.maxBooksAllowed ?? 2
          const roleLabel = activeRule?.roleOrGrade ?? 'DEFAULT'
          if (activeCheckouts.length >= maxAllowed) {
            alert(`Borrowing limit reached: ${issueData.studentName.trim()} already has ${activeCheckouts.length} active book(s) checked out (max allowed for ${roleLabel}: ${maxAllowed}).`)
            return
          }

          const now = new Date()
          const hasOverdue = activeCheckouts.some((c: Checkout) => new Date(c.dueDate) < now)
          if (hasOverdue) {
            alert(`Borrowing restricted: ${issueData.studentName.trim()} has active overdue checkout(s). Overdue books must be returned before issuing new items.`)
            return
          }
        }
      }

      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (activeRule?.borrowDurationDays || 14))

      await db.addCheckout({
        subjectId: issueData.subjectId,
        studentName: issueData.studentName.trim(),
        studentClass: issueData.studentClass.trim(),
        conditionOut: Number(issueData.conditionOut),
        dueDate: dueDate.toISOString()
      })

      setIsIssueModalOpen(false)
      setIssueData({ subjectId: 0, studentName: '', studentClass: '', conditionOut: 3 })
      fetchSubjects(() => db.getSubjects())
      loadActiveCheckouts()
    } catch (err: unknown) {
      console.error('Error issuing book', err)
      alert('Failed to issue book: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsIssuing(false)
    }
  }, [subjectsMap, issueData, activeRule, fetchSubjects, loadActiveCheckouts, isIssuing])

  const openIssueModal = useCallback((sub: Subject) => {
    setIssueData({ subjectId: sub.id, studentName: '', studentClass: '', conditionOut: 3 })
    setSelectedSubjectName(sub.name)
    setIsIssueModalOpen(true)
  }, [])

  const openReturnModal = useCallback(async (sub: Subject) => {
    setReturnSubjectName(sub.name)
    setIsReturnModalOpen(true)
    setReturnModalLoading(true)
    setReturnModalError('')
    setSelectedCheckoutIdToReturn(0)
    setReturnConditionIn(3)
    try {
      const res = await db.getActiveCheckouts(sub.id)
      const list = Array.isArray(res) ? res : []
      setActiveCheckoutsForReturn(list)
      if (list.length > 0) {
        setSelectedCheckoutIdToReturn(list[0].id)
      }
    } catch (err: unknown) {
      console.error('Error fetching active checkouts', err)
      setReturnModalError('Failed to load active checkouts: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setReturnModalLoading(false)
    }
  }, [])

  const handleReturnSubmitInInventory = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCheckoutIdToReturn) {
      setReturnModalError('Please select an active checkout to return.')
      return
    }
    setReturnModalSubmitting(true)
    setReturnModalError('')
    try {
      await db.returnCheckout(selectedCheckoutIdToReturn, Number(returnConditionIn))
      setIsReturnModalOpen(false)
      fetchSubjects(() => db.getSubjects())
      loadActiveCheckouts()
    } catch (err: unknown) {
      console.error('Error returning checkout', err)
      setReturnModalError(err instanceof Error ? err.message : 'Failed to return book.')
    } finally {
      setReturnModalSubmitting(false)
    }
  }, [selectedCheckoutIdToReturn, returnConditionIn, fetchSubjects, loadActiveCheckouts])

  const handleEditSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await db.updateSubject(editSubject.id, {
        name: editSubject.name,
        category: editSubject.category,
        openingCount: Number(editSubject.openingCount),
        recovered: Number(editSubject.recovered),
        damaged: Number(editSubject.damaged),
        lost: Number(editSubject.lost),
        notes: editSubject.notes.trim() || null
      })
        
      setIsEditModalOpen(false)
      fetchSubjects(() => db.getSubjects())
    } catch (err: unknown) {
      console.error('Error editing subject', err)
      alert('Failed to edit subject: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [editSubject, fetchSubjects])

  const handleDeleteSubject = useCallback(async () => {
    if (!editSubject.id) return
    if (!window.confirm(`Are you sure you want to delete "${editSubject.name}"? This cannot be undone.`)) return
    try {
      await db.deleteSubject(editSubject.id)
      setIsEditModalOpen(false)
      fetchSubjects(() => db.getSubjects())
    } catch (err: unknown) {
      alert('Cannot delete subject: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [editSubject, fetchSubjects])

  const openEditModal = useCallback((sub: Subject) => {
    setEditSubject({
      id: sub.id,
      name: sub.name,
      category: sub.category || '',
      openingCount: sub.openingCount,
      recovered: sub.recovered,
      damaged: sub.damaged,
      lost: sub.lost,
      notes: sub.notes || ''
    })
    setIsEditModalOpen(true)
  }, [])

  const handleRenewActiveLoan = async (checkoutId: number) => {
    setRenewingId(checkoutId)
    try {
      await db.renewCheckout({ id: checkoutId, extraDays: 7 })
      await loadActiveCheckouts()
    } catch (err: unknown) {
      alert('Failed to renew loan: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setRenewingId(null)
    }
  }

  const handleQuickReturnLoan = async (checkoutId: number) => {
    try {
      await db.returnCheckout(checkoutId, 3)
      await loadActiveCheckouts()
      fetchSubjects(() => db.getSubjects())
    } catch (err: unknown) {
      alert('Failed to return book: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const filteredActiveLoans = useMemo(() => {
    if (!loansSearchQuery.trim()) return allActiveCheckouts
    const q = loansSearchQuery.toLowerCase()
    return allActiveCheckouts.filter(
      (c) =>
        c.studentName.toLowerCase().includes(q) ||
        (c.studentClass || '').toLowerCase().includes(q) ||
        (c.subject?.name || '').toLowerCase().includes(q)
    )
  }, [allActiveCheckouts, loansSearchQuery])

  const handleExportExcel = useCallback(() => {
    const data = filtered.map(s => ({
      'Subject': s.name,
      'Category': s.category,
      'Opening Stock': s.openingCount,
      'Recovered': s.recovered,
      'Issued': s.issued,
      'Damaged': s.damaged,
      'Lost': s.lost,
      'Available': calculateAvailable(s),
      'Condition (out of 3.0)': s.averageCondition ? s.averageCondition.toFixed(1) : '3.0',
      'Wear Rate': s.degradationRate ? s.degradationRate.toFixed(2) : '0.00',
      'Notes': s.notes || ''
    }))
    exportToExcel(data, 'QuantLib_Inventory')
  }, [filtered])

  const handleExportCsv = useCallback(() => {
    const data = filtered.map(s => ({
      'Subject': s.name,
      'Category': s.category,
      'Opening Stock': s.openingCount,
      'Recovered': s.recovered,
      'Issued': s.issued,
      'Damaged': s.damaged,
      'Lost': s.lost,
      'Available': calculateAvailable(s),
      'Condition (out of 3.0)': s.averageCondition ? s.averageCondition.toFixed(1) : '3.0',
      'Wear Rate': s.degradationRate ? s.degradationRate.toFixed(2) : '0.00',
      'Notes': s.notes || ''
    }))
    exportToCsv(data, 'QuantLib_Inventory')
  }, [filtered])

  const activeCheckoutsOptions = useMemo(() => {
    return activeCheckoutsForReturn.map(c => ({
      value: c.id.toString(),
      label: `${c.studentName} ${c.studentClass ? `(${c.studentClass})` : ''} - Due: ${new Date(c.dueDate).toLocaleDateString()}`
    }))
  }, [activeCheckoutsForReturn])

  const tableRows = useMemo(() => (
    <>
      {filtered.map((sub) => {
        const available = calculateAvailable(sub)
        const isLowStock = available < 5
        return (
          <tr key={sub.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
            <td className="p-4">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-slate-900 dark:text-slate-100">{sub.name}</span>
                {isLowStock && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    Low Stock
                  </span>
                )}
              </div>
              {sub.notes && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-xs" title={sub.notes}>
                  {sub.notes}
                </p>
              )}
            </td>
            <td className="p-4 text-slate-500 dark:text-slate-400">{sub.category}</td>
            <td className="p-4 text-right">{sub.openingCount}</td>
            <td className="p-4 text-right text-blue-600">{sub.recovered}</td>
            <td className="p-4 text-right text-amber-600">{sub.issued}</td>
            <td className="p-4 text-right text-red-500">{sub.damaged}</td>
            <td className="p-4 text-right text-red-500">{sub.lost}</td>
            <td className="p-4 text-right font-bold text-green-600">{available}</td>
            <td className="p-4 text-right">
              {sub.averageCondition ? sub.averageCondition.toFixed(1) : '3.0'}/3.0
              {(sub.averageCondition ?? 3.0) < 2.0 && <span className="text-red-500 ml-1 font-bold" title="Replacement Warning">!</span>}
            </td>
            <td className="p-4 text-right text-slate-500">
              -{sub.degradationRate ? sub.degradationRate.toFixed(2) : '0.00'}
            </td>
            <td className="p-4 text-center print:hidden">
              <div className="flex justify-center space-x-2">
                <button onClick={() => openIssueModal(sub)} className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors text-xs font-medium border border-blue-200">Issue</button>
                <button onClick={() => openReturnModal(sub)} className="text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 px-2 py-1 rounded transition-colors text-xs font-medium border border-emerald-200 dark:border-emerald-800">Return</button>
                <button onClick={() => openEditModal(sub)} className="text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 px-2 py-1 rounded transition-colors text-xs font-medium">Edit</button>
              </div>
            </td>
          </tr>
        )
      })}
      {filtered.length === 0 && (
        <tr>
          <td colSpan={11} className="p-8 text-center text-slate-500 dark:text-slate-400">No subjects found</td>
        </tr>
      )}
    </>
  ), [filtered, openIssueModal, openReturnModal, openEditModal])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Inventory</h1>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportSpreadsheet}
            className="hidden"
          />
          <Button
            variant="secondary"
            icon={<BookOpen size={18} />}
            onClick={() => {
              loadActiveCheckouts()
              setIsActiveLoansModalOpen(true)
            }}
            className="print:hidden"
          >
            Active Loans ({allActiveCheckouts.length})
          </Button>
          <Button
            variant="secondary"
            icon={<Upload size={18} />}
            onClick={() => fileInputRef.current?.click()}
            className="print:hidden"
          >
            Import Excel/CSV
          </Button>
          <Button variant="secondary" icon={<Download size={18} />} onClick={handleExportExcel} className="print:hidden">
            Excel
          </Button>
          <Button variant="secondary" icon={<Download size={18} />} onClick={handleExportCsv} className="print:hidden">
            CSV
          </Button>
          <Button variant="secondary" icon={<Printer size={18} />} onClick={() => window.print()} className="print:hidden">
            Print
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="print:hidden">
            + Add Subject
          </Button>
        </div>
      </div>

      {importNotice && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded-xl text-sm flex items-center justify-between">
          <span>{importNotice}</span>
          <button onClick={() => setImportNotice(null)} className="text-xs font-semibold underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors duration-200">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <input
            type="text"
            placeholder="Search subjects, categories, or notes..."
            className="w-full max-w-md px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border transition-colors ${
              lowStockOnly
                ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700'
            }`}
          >
            <AlertTriangle size={14} />
            <span>Low Stock Only (&lt;5 Avail.)</span>
          </button>
        </div>
        
        <div className="overflow-x-auto">
          {subjectsLoading && !subjects ? (
            <div className="p-8 text-center text-slate-500">Loading inventory...</div>
          ) : subjectsError ? (
            <div className="p-8 text-center text-red-500 space-y-2">
              <p>Failed to load inventory: {subjectsError}</p>
              <button
                onClick={() => fetchSubjects(() => db.getSubjects())}
                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg"
              >
                Retry
              </button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-sm border-b border-slate-100 dark:border-slate-700">
                  <th className="p-4 font-medium">Subject</th>
                  <th className="p-4 font-medium">Category</th>
                  <th className="p-4 font-medium text-right">Opening</th>
                  <th className="p-4 font-medium text-right">Recovered</th>
                  <th className="p-4 font-medium text-right">Issued</th>
                  <th className="p-4 font-medium text-right text-red-500">Damaged</th>
                  <th className="p-4 font-medium text-right text-red-500">Lost</th>
                  <th className="p-4 font-medium text-right text-green-600">Available</th>
                  <th className="p-4 font-medium text-right" title="Average Condition (1=Damaged, 2=Normal, 3=Good)">Condition</th>
                  <th className="p-4 font-medium text-right" title="Condition points lost per checkout">Wear Rate</th>
                  <th className="p-4 font-medium text-center print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-300 text-sm">
                {tableRows}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Subject">
        <form onSubmit={handleAddSubject} className="space-y-4">
          <TextField 
            label="Subject Name"
            required
            placeholder="e.g. Mathematics"
            value={newSubject.name}
            onChange={e => setNewSubject({...newSubject, name: e.target.value})}
          />
          
          <TextField 
            label="Category"
            required
            placeholder="e.g. Science"
            value={newSubject.category}
            onChange={e => setNewSubject({...newSubject, category: e.target.value})}
          />

          <TextField 
            label="Opening Stock Count"
            required
            type="number"
            min="0"
            value={newSubject.openingCount}
            onChange={e => setNewSubject({...newSubject, openingCount: parseInt(e.target.value) || 0})}
          />

          <TextAreaField
            label="Shelf / Subject Notes (Optional)"
            placeholder="e.g. Shelf B2, 2025 Curriculum Edition"
            value={newSubject.notes}
            onChange={e => setNewSubject({...newSubject, notes: e.target.value})}
          />

          <div className="pt-4 flex space-x-3">
            <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)} className="flex-1">Cancel</Button>
            <Button type="submit" className="flex-1">Save Subject</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isIssueModalOpen} onClose={() => setIsIssueModalOpen(false)} title="Issue Book">
        <form onSubmit={handleIssueSubmit} className="space-y-4">
          <TextField 
            label="Subject"
            disabled
            className="cursor-not-allowed opacity-70"
            value={selectedSubjectName}
            readOnly
          />

          <TextField 
            label="Student Name"
            required
            list="student-names-list"
            placeholder="e.g. John Doe"
            value={issueData.studentName}
            onChange={e => setIssueData({...issueData, studentName: e.target.value})}
          />
          <datalist id="student-names-list">
            {knownStudentNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          
          <TextField 
            label="Class / Form"
            list="student-classes-list"
            placeholder="e.g. S.4"
            value={issueData.studentClass}
            onChange={e => setIssueData({...issueData, studentClass: e.target.value})}
          />
          <datalist id="student-classes-list">
            {knownStudentClasses.map((cls) => (
              <option key={cls} value={cls} />
            ))}
          </datalist>

          <SelectField 
            label="Outgoing Condition"
            value={issueData.conditionOut}
            onChange={e => setIssueData({...issueData, conditionOut: Number(e.target.value)})}
            options={[
              { value: '3', label: 'Good (3)' },
              { value: '2', label: 'Normal (2)' },
              { value: '1', label: 'Damaged (1)' },
            ]}
          />

          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <div><span className="font-bold">Rule ({activeRule?.roleOrGrade || 'DEFAULT'}):</span> Max {activeRule?.maxBooksAllowed || 2} book(s), {activeRule?.borrowDurationDays || 14} days loan duration.</div>
            <div className="font-semibold text-blue-900 dark:text-blue-100">Calculated Due Date: {formattedCalculatedDueDate}</div>
          </div>

          <div className="pt-4 flex space-x-3">
            <Button type="button" variant="secondary" onClick={() => setIsIssueModalOpen(false)} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={isIssuing} className="flex-1">{isIssuing ? 'Issuing...' : 'Confirm Issue'}</Button>
          </div>
        </form>
      </Modal>

      {/* Active Loans Directory Modal */}
      <Modal
        isOpen={isActiveLoansModalOpen}
        onClose={() => setIsActiveLoansModalOpen(false)}
        title={`Active Student Loans (${allActiveCheckouts.length})`}
      >
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search by student, class, or subject..."
            value={loansSearchQuery}
            onChange={(e) => setLoansSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
          />

          {filteredActiveLoans.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">
              No active student checkouts found.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredActiveLoans.map((loan) => {
                const isOverdue = new Date(loan.dueDate) < new Date()
                return (
                  <div key={loan.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                        {loan.studentName} {loan.studentClass ? `(${loan.studentClass})` : ''}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 truncate">
                        {loan.subject?.name || `Subject #${loan.subjectId}`} &bull;{' '}
                        <span className={isOverdue ? 'text-rose-600 font-semibold' : ''}>
                          Due {new Date(loan.dueDate).toLocaleDateString()}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<CalendarPlus size={13} />}
                        isLoading={renewingId === loan.id}
                        onClick={() => handleRenewActiveLoan(loan.id)}
                        title="Extend due date by 7 days"
                      >
                        +7d
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<RotateCcw size={13} />}
                        onClick={() => handleQuickReturnLoan(loan.id)}
                        title="Mark returned in Good condition"
                      >
                        Return
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Return Book Modal */}
      <Modal isOpen={isReturnModalOpen} onClose={() => setIsReturnModalOpen(false)} title={`Return Book: ${returnSubjectName}`}>
        {returnModalLoading ? (
          <div className="p-6 text-center text-slate-500">Loading active checkouts...</div>
        ) : activeCheckoutsForReturn.length === 0 ? (
          <div className="p-6 text-center text-slate-500">No active checkouts found for this subject.</div>
        ) : (
          <form onSubmit={handleReturnSubmitInInventory} className="space-y-4">
            <SelectField 
              label="Select Active Checkout to Return"
              value={selectedCheckoutIdToReturn}
              onChange={e => setSelectedCheckoutIdToReturn(Number(e.target.value))}
              options={activeCheckoutsOptions}
            />

            <SelectField 
              label="Incoming Book Condition"
              value={returnConditionIn}
              onChange={e => setReturnConditionIn(Number(e.target.value))}
              options={[
                { value: '3', label: 'Good (3)' },
                { value: '2', label: 'Fair / Normal (2)' },
                { value: '1', label: 'Damaged (1)' },
              ]}
            />

            {returnModalError && <p className="text-red-500 text-sm font-medium">{returnModalError}</p>}

            <div className="pt-4 flex space-x-3">
              <Button type="button" variant="secondary" onClick={() => setIsReturnModalOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" isLoading={returnModalSubmitting} icon={<RotateCcw size={16} />} className="flex-1">Confirm Return</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Subject">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <TextField 
            label="Subject Name"
            required
            value={editSubject.name}
            onChange={e => setEditSubject({...editSubject, name: e.target.value})}
          />
          
          <TextField 
            label="Category"
            required
            value={editSubject.category}
            onChange={e => setEditSubject({...editSubject, category: e.target.value})}
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField 
              label="Opening Stock"
              required
              type="number"
              min="0"
              value={editSubject.openingCount}
              onChange={e => setEditSubject({...editSubject, openingCount: parseInt(e.target.value) || 0})}
            />
            <TextField 
              label="Recovered Copies"
              required
              type="number"
              min="0"
              value={editSubject.recovered}
              onChange={e => setEditSubject({...editSubject, recovered: parseInt(e.target.value) || 0})}
            />
            <TextField 
              label="Damaged Copies"
              required
              type="number"
              min="0"
              value={editSubject.damaged}
              onChange={e => setEditSubject({...editSubject, damaged: parseInt(e.target.value) || 0})}
            />
            <TextField 
              label="Lost Copies"
              required
              type="number"
              min="0"
              value={editSubject.lost}
              onChange={e => setEditSubject({...editSubject, lost: parseInt(e.target.value) || 0})}
            />
          </div>

          <TextAreaField
            label="Shelf / Subject Notes"
            placeholder="e.g. Shelf B2, 2025 Curriculum Edition"
            value={editSubject.notes}
            onChange={e => setEditSubject({...editSubject, notes: e.target.value})}
          />

          <div className="pt-4 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="danger"
              icon={<Trash2 size={16} />}
              onClick={handleDeleteSubject}
            >
              Delete
            </Button>
            <div className="flex space-x-2">
              <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
