import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, CheckCircle, AlertOctagon, Printer, BookOpen, AlertTriangle, Users } from 'lucide-react'
import { Button } from '../components/Button'
import { SelectField, AutocompleteField } from '../components/TextField'
import { Modal } from '../components/Modal'
import { useToast } from '../hooks/ToastContext'
import { db } from '../lib/ipc-client'
import type { ClearanceRecord, Checkout, Student, Incident } from '../lib/types'

export default function Clearance() {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<'CLASS' | 'INDIVIDUAL'>('CLASS')
  const [studentName, setStudentName] = useState('')
  const [studentClass, setStudentClass] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [allCheckouts, setAllCheckouts] = useState<Checkout[]>([])
  const [allIncidents, setAllIncidents] = useState<Incident[]>([])
  const [sheetClass, setSheetClass] = useState('ALL')
  const [holdsOnly, setHoldsOnly] = useState(false)

  const refreshDirectoryData = useCallback(() => {
    Promise.all([
      db.getStudents().catch(() => []),
      db.getActiveCheckouts().catch(() => []),
      db.getIncidents().catch(() => [])
    ]).then(([studs, loans, incs]) => {
      setStudents(studs || [])
      setAllCheckouts(loans || [])
      setAllIncidents(incs || [])
    })
  }, [])

  useEffect(() => {
    refreshDirectoryData()
  }, [refreshDirectoryData])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clearanceData, setClearanceData] = useState<ClearanceRecord | null>(null)

  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false)
  const [slipData, setSlipData] = useState<ClearanceRecord | null>(null)
  const [slipLoading, setSlipLoading] = useState(false)
  const [returningCheckout, setReturningCheckout] = useState<Checkout | null>(null)
  const [returnCondition, setReturnCondition] = useState<number>(3)
  const [returnSubmitting, setReturnSubmitting] = useState(false)

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = studentName.trim()
    const trimmedClass = studentClass.trim()

    if (!trimmedName) {
      setError('Please enter a student name to search.')
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await db.getClearanceStatus({
        studentName: trimmedName,
        studentClass: trimmedClass || undefined
      })
      if (res && res.success && res.data) {
        setClearanceData(res.data)
      } else {
        setError(res?.error || 'Failed to retrieve student clearance status.')
        setClearanceData(null)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during search.')
      setClearanceData(null)
    } finally {
      setLoading(false)
    }
  }, [studentName, studentClass])

  const handleGenerateSlip = useCallback(async () => {
    if (!clearanceData) return
    setSlipLoading(true)
    try {
      const res = await db.generateClearanceSlip({
        studentName: clearanceData.studentName.trim(),
        studentClass: clearanceData.studentClass?.trim() || undefined
      })
      if (res && res.success && res.data) {
        setSlipData(res.data)
        setIsSlipModalOpen(true)
      } else {
        showToast('Failed to generate clearance slip: ' + (res?.error || 'Unknown error'), 'error')
      }
    } catch (err: unknown) {
      showToast('Error generating clearance slip: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setSlipLoading(false)
    }
  }, [clearanceData, showToast])

  // Memoize incidents table rows and date formatting
  const incidentsRows = useMemo(() => {
    if (!clearanceData?.incidents) return null

    const unresolvedSet = new Set((clearanceData.unresolvedIncidents || []).map(u => u.id))

    return clearanceData.incidents.map((incident) => {
      const isUnresolved = unresolvedSet.has(incident.id)
      const dateStr = new Date(incident.date).toLocaleDateString()

      return (
        <tr key={incident.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
          <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
            {incident.bookTitle}
          </td>
          <td className="p-3">
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                incident.type === 'LOST'
                  ? 'bg-rose-100 text-rose-700'
                  : incident.type === 'DAMAGED'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {incident.type}
            </span>
          </td>
          <td className="p-3 text-slate-600 dark:text-slate-400">
            {dateStr}
          </td>
          <td className="p-3">
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                isUnresolved
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {incident.actionTaken || (isUnresolved ? 'UNRESOLVED' : 'RESOLVED')}
            </span>
          </td>
        </tr>
      )
    })
  }, [clearanceData?.incidents, clearanceData?.unresolvedIncidents])

  // Memoize date formatting for clearance slip
  const slipTimestampStr = useMemo(() => {
    return (slipData && slipData.timestamp) ? new Date(slipData.timestamp).toLocaleString() : ''
  }, [slipData])

  // Class-wide clearance summary rows
  const classSheetRows = useMemo(() => {
    const activeByStudent = new Map<string, Checkout[]>()
    for (const c of allCheckouts) {
      const key = c.studentName.trim().toLowerCase()
      const list = activeByStudent.get(key) || []
      list.push(c)
      activeByStudent.set(key, list)
    }

    const unresolvedByStudent = new Map<string, Incident[]>()
    for (const inc of allIncidents) {
      const party = (inc.responsibleParty || '').trim().toLowerCase()
      if (!party) continue
      const isDamageOrLoss = inc.type === 'DAMAGED' || inc.type === 'LOST'
      const action = (inc.actionTaken || '').toUpperCase()
      const isResolved = action.includes('RESOLVED') || action.includes('REPLACED') || action.includes('WAIVED') || action.includes('PAID')
      if (isDamageOrLoss && !isResolved) {
        const list = unresolvedByStudent.get(party) || []
        list.push(inc)
        unresolvedByStudent.set(party, list)
      }
    }

    return students
      .filter((s) => sheetClass === 'ALL' || s.studentClass === sheetClass)
      .map((s) => {
        const key = s.name.trim().toLowerCase()
        const loans = activeByStudent.get(key) || []
        const issues = unresolvedByStudent.get(key) || []
        const isHold = loans.length > 0 || issues.length > 0
        return {
          student: s,
          activeLoansCount: loans.length,
          unresolvedIncidentsCount: issues.length,
          status: isHold ? ('HOLD' as const) : ('CLEARED' as const)
        }
      })
      .filter((r) => (!holdsOnly ? true : r.status === 'HOLD'))
  }, [students, allCheckouts, allIncidents, sheetClass, holdsOnly])

  const sheetClasses = useMemo(() => {
    return Array.from(new Set(students.map((s) => s.studentClass).filter(Boolean))).sort()
  }, [students])

  const handleCheckStudentFromSheet = async (s: Student) => {
    setStudentName(s.name)
    setStudentClass(s.studentClass)
    setActiveTab('INDIVIDUAL')
    setError('')
    setLoading(true)
    try {
      const res = await db.getClearanceStatus({
        studentName: s.name,
        studentClass: s.studentClass
      })
      if (res && res.success && res.data) {
        setClearanceData(res.data)
      } else {
        setError(res?.error || 'Failed to retrieve student clearance status.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during lookup.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">End-of-Term Library Clearance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Print class-wide clearance sheets for class teachers/bursar, or look up individual students and issue clearance slips.
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-[#191F1E] p-1 text-sm font-medium self-start">
          <button
            type="button"
            onClick={() => setActiveTab('CLASS')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              activeTab === 'CLASS'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Users size={15} />
            Class Clearance Sheet
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('INDIVIDUAL')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              activeTab === 'INDIVIDUAL'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Search size={15} />
            Individual Slip
          </button>
        </div>
      </div>

      {/* CLASS CLEARANCE SHEET VIEW */}
      {activeTab === 'CLASS' && (
        <div className="space-y-4">
          <div className="chalk-card p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSheetClass('ALL')}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  sheetClass === 'ALL'
                    ? 'bg-[#1F6F54] dark:bg-[#2E9472] text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                All ({students.length})
              </button>
              {sheetClasses.map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setSheetClass(cls)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    sheetClass === cls
                      ? 'bg-[#1F6F54] dark:bg-[#2E9472] text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {cls}
                </button>
              ))}
              <label className="ml-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={holdsOnly}
                  onChange={(e) => setHoldsOnly(e.target.checked)}
                  className="rounded border-slate-300 text-[#1F6F54]"
                />
                Holds Only
              </label>
            </div>
            <Button variant="secondary" size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>
              Print Class Sheet
            </Button>
          </div>

          <div
            data-statutory-document
            className="chalk-card chalk-card overflow-hidden print:border-black print:shadow-none"
          >
            <div className="p-4 border-b border-[#E3E6DE] dark:border-[#27302E] flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white print:text-black">
                  Library Clearance Sheet — {sheetClass === 'ALL' ? 'All Classes' : sheetClass}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 print:text-black">
                  {classSheetRows.filter((r) => r.status === 'CLEARED').length} Cleared ·{' '}
                  {classSheetRows.filter((r) => r.status === 'HOLD').length} On Hold · Generated{' '}
                  {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E3E6DE] dark:border-[#27302E] bg-slate-50 dark:bg-[#141A19] text-xs uppercase text-slate-500 dark:text-slate-400">
                    <th className="p-3">#</th>
                    <th className="p-3">Student / Borrower</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Unreturned Books</th>
                    <th className="p-3">Damaged / Lost</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right print:hidden">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {classSheetRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No students match this filter.
                      </td>
                    </tr>
                  ) : (
                    classSheetRows.map((row, idx) => (
                      <tr key={row.student.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20">
                        <td className="p-3 text-slate-400 text-xs">{idx + 1}</td>
                        <td className="p-3 font-medium text-slate-900 dark:text-white print:text-black">
                          {row.student.name}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300 print:text-black">
                          {row.student.studentClass}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300 print:text-black">
                          {row.activeLoansCount}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300 print:text-black">
                          {row.unresolvedIncidentsCount}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              row.status === 'CLEARED'
                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="p-3 text-right print:hidden">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCheckStudentFromSheet(row.student)}
                          >
                            Slip / Details
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* INDIVIDUAL LOOKUP VIEW */}
      {activeTab === 'INDIVIDUAL' && (
      <>
      {/* Student Search Card */}
      <div className="chalk-card p-6">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <AutocompleteField
            label="Student Name"
            placeholder="e.g. John Doe"
            required
            value={studentName}
            onChange={(val) => {
              setStudentName(val)
              const match = students.find((s) => s.name.toLowerCase() === val.trim().toLowerCase())
              if (match) setStudentClass(match.studentClass)
            }}
            options={students.map((s) => ({ value: s.name, badge: s.studentClass }))}
          />
          <AutocompleteField
            label="Class / Grade (Optional)"
            placeholder="e.g. S1, S4, TEACHER"
            value={studentClass}
            onChange={(val) => setStudentClass(val)}
            options={Array.from(new Set(students.map((s) => s.studentClass))).sort().map((cls) => ({ value: cls }))}
          />
          <div>
            <Button
              type="submit"
              className="w-full"
              isLoading={loading}
              icon={<Search size={18} />}
            >
              Check Clearance
            </Button>
          </div>
        </form>
        {error && <p className="text-red-500 text-sm mt-3 font-medium">{error}</p>}
      </div>

      {/* Clearance Results */}
      {clearanceData && (
        <div className="space-y-6">
          {/* Status Header Banner */}
          <div
            className={`p-6 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              clearanceData.status === 'CLEARED'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center space-x-4">
              {clearanceData.status === 'CLEARED' ? (
                <CheckCircle className="w-12 h-12 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertOctagon className="w-12 h-12 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              )}
              <div>
                <div className="flex items-center space-x-3">
                  <span
                    className={`inline-block px-3 py-1 text-xs font-extrabold rounded-full tracking-wider uppercase ${
                      clearanceData.status === 'CLEARED'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {clearanceData.status}
                  </span>
                  <h2 className="text-xl font-bold">{clearanceData.studentName}</h2>
                  {clearanceData.studentClass && (
                    <span className="text-sm font-semibold opacity-80">({clearanceData.studentClass})</span>
                  )}
                </div>
                <p className="text-sm mt-1 opacity-90">
                  {clearanceData.status === 'CLEARED'
                    ? 'Student is fully cleared. All library materials have been returned and no unresolved charges exist.'
                    : 'Clearance withheld. The student has active checkouts or unresolved incident reports.'}
                </p>
              </div>
            </div>

            <Button
              onClick={handleGenerateSlip}
              isLoading={slipLoading}
              icon={<Printer size={18} />}
              variant={clearanceData.status === 'CLEARED' ? 'primary' : 'secondary'}
            >
              Generate Clearance Slip
            </Button>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="chalk-card p-5 flex items-center space-x-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-[#1F6F54] rounded-lg">
                <BookOpen size={24} />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Active Checkouts</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{clearanceData.activeCheckouts.length}</p>
              </div>
            </div>

            <div className="chalk-card p-5 flex items-center space-x-4">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Unresolved Incidents</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{clearanceData.unresolvedIncidents.length}</p>
              </div>
            </div>

            <div className="chalk-card p-5 flex items-center space-x-4">
              <div className={`p-3 rounded-lg flex-shrink-0 ${clearanceData.status === 'CLEARED' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600'}`}>
                {clearanceData.status === 'CLEARED' ? <CheckCircle size={24} /> : <AlertOctagon size={24} />}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Clearance Decision</p>
                <p className="text-lg font-bold text-slate-800 dark:text-white">
                  {clearanceData.status === 'CLEARED' ? 'Cleared for End of Term' : 'Hold — Return / Replace Books'}
                </p>
                <span className="text-xs text-slate-400">No cash late fines — return or replace items to clear</span>
              </div>
            </div>
          </div>

          {/* Active Checkouts List */}
          <div className="chalk-card overflow-hidden">
            <div className="p-4 border-b border-[#E3E6DE] dark:border-[#27302E] bg-slate-50 dark:bg-[#141A19] flex items-center space-x-2">
              <BookOpen size={18} className="text-blue-500" />
              <h3 className="font-semibold text-slate-800 dark:text-white">Active Checkouts ({clearanceData.activeCheckouts.length})</h3>
            </div>
            {clearanceData.activeCheckouts.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No active checkouts found.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E3E6DE] dark:border-[#27302E] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-[#191F1E]/80">
                    <th className="p-3 font-medium">Subject / Book</th>
                    <th className="p-3 font-medium">Checkout Date</th>
                    <th className="p-3 font-medium">Due Date</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {clearanceData.activeCheckouts.map((checkout) => {
                    const isOverdue = new Date(checkout.dueDate) < new Date()
                    return (
                      <tr key={checkout.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                          {checkout.subject?.name || `Subject #${checkout.subjectId}`}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">
                          {new Date(checkout.checkoutDate).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">
                          {new Date(checkout.dueDate).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              isOverdue
                                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {isOverdue ? 'OVERDUE' : 'ACTIVE'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setReturningCheckout(checkout)
                              setReturnCondition(3)
                            }}
                            className="text-xs py-1 px-2"
                          >
                            Return
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Incidents List */}
          <div className="chalk-card overflow-hidden">
            <div className="p-4 border-b border-[#E3E6DE] dark:border-[#27302E] bg-slate-50 dark:bg-[#141A19] flex items-center space-x-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <h3 className="font-semibold text-slate-800 dark:text-white">Incidents & Damaged/Lost Items ({clearanceData.incidents.length})</h3>
            </div>
            {clearanceData.incidents.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No incidents on record.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E3E6DE] dark:border-[#27302E] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-[#191F1E]/80">
                    <th className="p-3 font-medium">Book Title</th>
                    <th className="p-3 font-medium">Incident Type</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Action / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {incidentsRows}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Printable Clearance Slip Modal */}
      <Modal
        isOpen={isSlipModalOpen}
        onClose={() => setIsSlipModalOpen(false)}
        title="Official End-of-Term Clearance Slip"
      >
        {slipData && (
          <div className="space-y-6 print:space-y-4">
            <div id="clearance-slip-printable" data-statutory-document className="p-6 bg-white dark:bg-[#141A19] border rounded-xl space-y-6 text-slate-800 dark:text-slate-100">
              {/* Header / Branding */}
              <div className="text-center border-b pb-4 space-y-1">
                <h2 className="text-2xl font-extrabold tracking-wide uppercase text-blue-700 dark:text-[#3FB08A]">
                  {slipData.school?.name || 'Mentor High School'}
                </h2>
                {slipData.school?.motto && (
                  <p className="text-xs italic text-slate-500 dark:text-slate-400">"{slipData.school.motto}"</p>
                )}
                <div className="text-xs text-slate-500 dark:text-slate-400 flex justify-center space-x-4 pt-1">
                  <span>Academic Year: {slipData.school?.academicYear || '2026'}</span>
                  <span>|</span>
                  <span>Issued: {slipTimestampStr}</span>
                </div>
              </div>

              {/* Clearance Certificate Header */}
              <div className="text-center">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Official Document</span>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white uppercase">Library Clearance Certificate</h3>
              </div>

              {/* Student Details Box */}
              <div className="bg-slate-50 dark:bg-[#191F1E] p-4 rounded-lg border border-[#E3E6DE] dark:border-[#27302E] grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Student Name</p>
                  <p className="font-bold text-slate-900 dark:text-white text-base">{slipData.student?.studentName || slipData.studentName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Class / Grade</p>
                  <p className="font-bold text-slate-900 dark:text-white text-base">{slipData.student?.studentClass || slipData.studentClass || 'N/A'}</p>
                </div>
              </div>

              {/* Clearance Decision Box */}
              <div
                className={`p-4 rounded-lg border text-center font-bold text-sm ${
                  slipData.status === 'CLEARED'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                <div className="text-lg uppercase tracking-wider mb-1">
                  CLEARANCE STATUS: <span className="underline">{slipData.status}</span>
                </div>
                <p className="text-xs font-normal opacity-90">{slipData.clearanceDecision}</p>
              </div>

              {/* Details Summary */}
              <div className="space-y-2 text-xs">
                <h4 className="font-bold uppercase text-slate-600 dark:text-slate-400">Obligation Summary</h4>
                <div className="border rounded divide-y text-slate-700 dark:text-slate-300">
                  <div className="p-2 flex justify-between">
                    <span>Active Borrowed Books:</span>
                    <span className="font-bold">{slipData.activeCheckouts.length}</span>
                  </div>
                  <div className="p-2 flex justify-between">
                    <span>Unresolved Incidents:</span>
                    <span className="font-bold">{slipData.unresolvedIncidents.length}</span>
                  </div>
                  <div className="p-2 flex justify-between">
                    <span>Outstanding Charges / Replacement Fees:</span>
                    <span className="font-bold">${slipData.totalReplacementCharges.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Signatures Line */}
              <div className="pt-8 border-t grid grid-cols-2 gap-8 text-xs text-center">
                <div>
                  <div className="border-b border-slate-400 mb-2 h-10"></div>
                  <p className="font-bold text-slate-700 dark:text-slate-300">Librarian Signature & Stamp</p>
                  <p className="text-slate-400 text-[10px]">Date: __________________</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 mb-2 h-10"></div>
                  <p className="font-bold text-slate-700 dark:text-slate-300">Head Teacher / Principal</p>
                  <p className="text-slate-400 text-[10px]">Date: __________________</p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex space-x-3 justify-end pt-2 print:hidden">
              <Button variant="secondary" onClick={() => setIsSlipModalOpen(false)}>
                Close
              </Button>
              <Button icon={<Printer size={18} />} onClick={() => window.print()}>
                Print Clearance Slip
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(returningCheckout)}
        onClose={() => setReturningCheckout(null)}
        title="Return Book to Clear Obligation"
      >
        {returningCheckout && (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-[#141A19] p-4 rounded-lg space-y-1 text-sm">
              <p className="text-xs text-slate-500 uppercase font-semibold">Student</p>
              <p className="font-bold text-slate-800 dark:text-white">{returningCheckout.studentName}</p>
              <p className="text-xs text-slate-500 uppercase font-semibold pt-2">Book Title / Subject</p>
              <p className="font-bold text-slate-800 dark:text-white">{returningCheckout.subject?.name}</p>
            </div>

            <SelectField
              label="Condition On Return"
              value={String(returnCondition)}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReturnCondition(Number(e.target.value))}
              options={[
                { label: 'Good (Condition 3.0)', value: '3' },
                { label: 'Normal Wear (Condition 2.0)', value: '2' },
                { label: 'Damaged (Condition 1.0)', value: '1' }
              ]}
            />

            <div className="flex space-x-3 justify-end pt-4">
              <Button variant="secondary" onClick={() => setReturningCheckout(null)}>
                Cancel
              </Button>
              <Button
                isLoading={returnSubmitting}
                onClick={async () => {
                  setReturnSubmitting(true)
                  try {
                    await db.returnCheckout(returningCheckout.id, returnCondition)
                    setReturningCheckout(null)
                    // Refresh clearance using active record student identifier
                    const targetStudent = returningCheckout.studentName?.trim() || clearanceData?.studentName?.trim() || studentName.trim()
                    const targetClass = returningCheckout.studentClass?.trim() || clearanceData?.studentClass?.trim() || studentClass.trim() || undefined
                    const res = await db.getClearanceStatus({
                      studentName: targetStudent,
                      studentClass: targetClass
                    })
                    if (res && res.success && res.data) {
                      setClearanceData(res.data)
                    }
                    refreshDirectoryData()
                  } catch (err: unknown) {
                    showToast('Failed to return book: ' + (err instanceof Error ? err.message : String(err)), 'error')
                  } finally {
                    setReturnSubmitting(false)
                  }
                }}
              >
                Confirm Return
              </Button>
            </div>
          </div>
        )}
      </Modal>
      </>
      )}
    </div>
  )
}
