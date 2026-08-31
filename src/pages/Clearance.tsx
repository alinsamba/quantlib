import { useState, useMemo, useCallback } from 'react'
import { Search, CheckCircle, AlertOctagon, Printer, BookOpen, AlertTriangle, DollarSign, CreditCard, ShieldCheck } from 'lucide-react'
import { Button } from '../components/Button'
import { TextField, SelectField } from '../components/TextField'
import { Modal } from '../components/Modal'
import { db } from '../lib/ipc-client'
import { roundCurrency } from '../lib/utils'
import type { ClearanceRecord, Checkout } from '../lib/types'

export default function Clearance() {
  const [studentName, setStudentName] = useState('')
  const [studentClass, setStudentClass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clearanceData, setClearanceData] = useState<ClearanceRecord | null>(null)

  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false)
  const [slipData, setSlipData] = useState<ClearanceRecord | null>(null)
  const [slipLoading, setSlipLoading] = useState(false)
  const [returningCheckout, setReturningCheckout] = useState<Checkout | null>(null)
  const [returnCondition, setReturnCondition] = useState<number>(3)
  const [returnSubmitting, setReturnSubmitting] = useState(false)

  // Fine Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  // Fine Waiver Modal State
  const [isWaiverModalOpen, setIsWaiverModalOpen] = useState(false)
  const [waiverReason, setWaiverReason] = useState('')
  const [approvedBy, setApprovedBy] = useState('LIBRARIAN')
  const [waiverLoading, setWaiverLoading] = useState(false)
  const [waiverError, setWaiverError] = useState('')

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
        alert('Failed to generate clearance slip: ' + (res?.error || 'Unknown error'))
      }
    } catch (err: unknown) {
      alert('Error generating clearance slip: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSlipLoading(false)
    }
  }, [clearanceData])

  const handleOpenPaymentModal = useCallback(() => {
    if (!clearanceData) return
    const rawTotalDue = clearanceData.totalAmountDue 
      ?? ((clearanceData.totalReplacementCharges || 0) + (clearanceData.totalOverdueFines || 0))
    const totalDue = roundCurrency(rawTotalDue)
    setPaymentAmount(totalDue)
    setPaymentMethod('Cash')
    setPaymentNotes('')
    setPaymentError('')
    setIsPaymentModalOpen(true)
  }, [clearanceData])

  const handleRecordPaymentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clearanceData) return
    setPaymentLoading(true)
    setPaymentError('')
    try {
      const res = await db.recordFinePayment({
        studentName: clearanceData.studentName,
        studentClass: clearanceData.studentClass || undefined,
        amount: Number(paymentAmount),
        paymentMethod,
        notes: paymentNotes
      })
      if (res && res.success && res.data) {
        setClearanceData(res.data)
        setIsPaymentModalOpen(false)
      } else {
        setPaymentError(res?.error || 'Failed to record payment.')
      }
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Error recording payment.')
    } finally {
      setPaymentLoading(false)
    }
  }, [clearanceData, paymentAmount, paymentMethod, paymentNotes])

  const handleOpenWaiverModal = useCallback(() => {
    if (!clearanceData) return
    setWaiverReason('')
    setApprovedBy('LIBRARIAN')
    setWaiverError('')
    setIsWaiverModalOpen(true)
  }, [clearanceData])

  const handleWaiveSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clearanceData) return
    if (!waiverReason.trim()) {
      setWaiverError('Please enter a reason for the waiver.')
      return
    }
    setWaiverLoading(true)
    setWaiverError('')
    try {
      const res = await db.waiveFine({
        studentName: clearanceData.studentName,
        studentClass: clearanceData.studentClass || undefined,
        reason: waiverReason.trim(),
        approvedBy: approvedBy.trim() || 'LIBRARIAN'
      })
      if (res && res.success && res.data) {
        setClearanceData(res.data)
        setIsWaiverModalOpen(false)
      } else {
        setWaiverError(res?.error || 'Failed to waive fine.')
      }
    } catch (err: unknown) {
      setWaiverError(err instanceof Error ? err.message : 'Error waiving fine.')
    } finally {
      setWaiverLoading(false)
    }
  }, [clearanceData, waiverReason, approvedBy])



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
    return slipData ? new Date(slipData.timestamp).toLocaleString() : ''
  }, [slipData])

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Student Clearance Slip Generator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Verify student borrowing status, check outstanding items or incidents, manage fine payments/waivers, and issue official End-of-Term clearance slips.
        </p>
      </div>

      {/* Student Search Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <TextField
            label="Student Name"
            placeholder="e.g. John Doe"
            required
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />
          <TextField
            label="Class / Grade (Optional)"
            placeholder="e.g. S.4, S.6, TEACHER"
            value={studentClass}
            onChange={(e) => setStudentClass(e.target.value)}
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
            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg">
                <BookOpen size={24} />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Active Checkouts</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{clearanceData.activeCheckouts.length}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Unresolved Incidents</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{clearanceData.unresolvedIncidents.length}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-2">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-lg">
                  <DollarSign size={24} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Replacement / Fine Charges</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">${clearanceData.totalReplacementCharges.toFixed(2)}</p>
                  <span className="text-[10px] text-slate-400">Overdue fines capped at max $15.00/book</span>
                </div>
              </div>

              {(clearanceData.totalReplacementCharges > 0 || clearanceData.unresolvedIncidents.length > 0) && (
                <div className="flex space-x-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <Button size="sm" variant="primary" icon={<CreditCard size={14} />} onClick={handleOpenPaymentModal} className="flex-1 text-xs py-1">
                    Accept Payment
                  </Button>
                  <Button size="sm" variant="secondary" icon={<ShieldCheck size={14} />} onClick={handleOpenWaiverModal} className="flex-1 text-xs py-1">
                    Waive Fine
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Active Checkouts List */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center space-x-2">
              <BookOpen size={18} className="text-blue-500" />
              <h3 className="font-semibold text-slate-800 dark:text-white">Active Checkouts ({clearanceData.activeCheckouts.length})</h3>
            </div>
            {clearanceData.activeCheckouts.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No active checkouts found.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/50">
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
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center space-x-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <h3 className="font-semibold text-slate-800 dark:text-white">Incidents & Damaged/Lost Items ({clearanceData.incidents.length})</h3>
            </div>
            {clearanceData.incidents.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No incidents on record.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/50">
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

      {/* Record Fine Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Record Fine Payment"
      >
        <form onSubmit={handleRecordPaymentSubmit} className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">
            <p><span className="font-semibold">Student:</span> {clearanceData?.studentName} {clearanceData?.studentClass ? `(${clearanceData.studentClass})` : ''}</p>
            <p><span className="font-semibold">Total Replacement Charges:</span> ${clearanceData?.totalReplacementCharges.toFixed(2)}</p>
          </div>

          <TextField
            label="Payment Amount ($)"
            type="number"
            step="0.01"
            required
            min={0}
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
          />

          <SelectField
            label="Payment Method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            options={[
              { value: 'Cash', label: 'Cash' },
              { value: 'Mobile Money', label: 'Mobile Money' },
              { value: 'Bank Transfer', label: 'Bank Transfer' },
              { value: 'Card', label: 'Card' }
            ]}
          />

          <TextField
            label="Notes / Receipt No. (Optional)"
            placeholder="e.g. Receipt #1042"
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
          />

          {paymentError && <p className="text-red-500 text-sm font-medium">{paymentError}</p>}

          <div className="pt-4 flex space-x-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={paymentLoading} icon={<CreditCard size={16} />}>
              Record Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Waive Fine Modal */}
      <Modal
        isOpen={isWaiverModalOpen}
        onClose={() => setIsWaiverModalOpen(false)}
        title="Waive Fine / Replacement Charges"
      >
        <form onSubmit={handleWaiveSubmit} className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-lg border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
            <p><span className="font-semibold">Student:</span> {clearanceData?.studentName} {clearanceData?.studentClass ? `(${clearanceData.studentClass})` : ''}</p>
            <p><span className="font-semibold">Outstanding Amount to Waive:</span> ${clearanceData?.totalReplacementCharges.toFixed(2)}</p>
          </div>

          <TextField
            label="Waiver Reason"
            required
            placeholder="e.g. Principal Exemption, Book Replaced, Hardship Waiver"
            value={waiverReason}
            onChange={(e) => setWaiverReason(e.target.value)}
          />

          <TextField
            label="Approved By"
            required
            placeholder="e.g. Head Teacher / Librarian Name"
            value={approvedBy}
            onChange={(e) => setApprovedBy(e.target.value)}
          />

          {waiverError && <p className="text-red-500 text-sm font-medium">{waiverError}</p>}

          <div className="pt-4 flex space-x-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setIsWaiverModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={waiverLoading} icon={<ShieldCheck size={16} />}>
              Confirm Fine Waiver
            </Button>
          </div>
        </form>
      </Modal>

      {/* Printable Clearance Slip Modal */}
      <Modal
        isOpen={isSlipModalOpen}
        onClose={() => setIsSlipModalOpen(false)}
        title="Official End-of-Term Clearance Slip"
      >
        {slipData && (
          <div className="space-y-6 print:space-y-4">
            <div id="clearance-slip-printable" className="p-6 bg-white dark:bg-slate-900 border rounded-xl space-y-6 text-slate-800 dark:text-slate-100">
              {/* Header / Branding */}
              <div className="text-center border-b pb-4 space-y-1">
                <h2 className="text-2xl font-extrabold tracking-wide uppercase text-blue-700 dark:text-blue-400">
                  {slipData.school.name}
                </h2>
                {slipData.school.motto && (
                  <p className="text-xs italic text-slate-500 dark:text-slate-400">"{slipData.school.motto}"</p>
                )}
                <div className="text-xs text-slate-500 dark:text-slate-400 flex justify-center space-x-4 pt-1">
                  <span>Academic Year: {slipData.school.academicYear || '2026'}</span>
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
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Student Name</p>
                  <p className="font-bold text-slate-900 dark:text-white text-base">{slipData.student.studentName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Class / Grade</p>
                  <p className="font-bold text-slate-900 dark:text-white text-base">{slipData.student.studentClass || 'N/A'}</p>
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
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg space-y-1 text-sm">
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
                  } catch (err: unknown) {
                    alert('Failed to return book: ' + (err instanceof Error ? err.message : String(err)))
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
    </div>
  )
}
