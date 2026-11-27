import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  AlertTriangle,
  Clock,
  CheckCircle2,
  CalendarPlus,
  UserCheck,
  GraduationCap,
  XCircle
} from 'lucide-react'
import { db } from '../lib/ipc-client'
import { calculateAvailable } from '../lib/utils'
import { useTheme } from '../hooks/ThemeContext'
import type { Subject, Checkout, Student } from '../lib/types'
import { Button } from '../components/Button'
import { ConfirmModal } from '../components/ConfirmModal'
import { TextField, SelectField, AutocompleteField } from '../components/TextField'
import { EmptyState } from '../components/EmptyState'
import { ChalkHero } from '../components/ChalkHero'
import { ChalkArt } from '../components/theme/ChalkArt'

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return formatDateInput(d)
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default function CirculationDesk() {
  const { theme } = useTheme()
  const isChalk = theme === 'chalk'
  const navigate = useNavigate()
  const borrowerInputRef = useRef<HTMLInputElement>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [activeCheckouts, setActiveCheckouts] = useState<Checkout[]>([])
  const [loading, setLoading] = useState(true)

  // Quick Issue Form
  const [borrowerType, setBorrowerType] = useState<'STUDENT' | 'TEACHER'>('STUDENT')
  const [borrowerName, setBorrowerName] = useState('')
  const [borrowerClass, setBorrowerClass] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [bookNote, setBookNote] = useState('')
  const [dueDateStr, setDueDateStr] = useState(() => addDays(7))
  const [conditionOut, setConditionOut] = useState(3)
  const [issuing, setIssuing] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Quick Return Filter & Inline Return State
  const [loanSearch, setLoanSearch] = useState('')
  const [loanFilter, setLoanFilter] = useState<'ALL' | 'OVERDUE' | 'DUE_TODAY'>('ALL')
  const [returningId, setReturningId] = useState<number | null>(null)
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [loanToMarkLost, setLoanToMarkLost] = useState<Checkout | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [subs, studs, loans] = await Promise.all([
        db.getSubjects(),
        db.getStudents().catch(() => []),
        db.getActiveCheckouts()
      ])
      setSubjects(subs || [])
      setStudents(studs || [])
      setActiveCheckouts(loans || [])
    } catch (err) {
      console.error('Failed to load circulation desk data', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const matchedStudent = useMemo(() => {
    const q = borrowerName.trim().toLowerCase()
    if (!q) return null
    return students.find((s) => s.name.toLowerCase() === q) || null
  }, [borrowerName, students])

  const borrowerLoans = useMemo(() => {
    const q = borrowerName.trim().toLowerCase()
    if (!q) return []
    return activeCheckouts.filter((c) => c.studentName.trim().toLowerCase() === q)
  }, [borrowerName, activeCheckouts])

  const borrowerHasOverdue = useMemo(() => {
    const now = Date.now()
    return borrowerLoans.some((c) => new Date(c.dueDate).getTime() < now)
  }, [borrowerLoans])

  const directoryOptions = useMemo(() => {
    if (borrowerType === 'TEACHER') {
      return students.filter((s) => s.studentClass.toUpperCase() === 'TEACHER')
    }
    return students.filter((s) => s.studentClass.toUpperCase() !== 'TEACHER')
  }, [students, borrowerType])

  const handleBorrowerNameChange = (val: string) => {
    setBorrowerName(val)
    const match = students.find((s) => s.name.toLowerCase() === val.trim().toLowerCase())
    if (match) {
      setBorrowerClass(match.studentClass)
      if (match.studentClass.toUpperCase() === 'TEACHER') {
        setBorrowerType('TEACHER')
        setDueDateStr(addDays(30))
      } else if ((match.section || '').toUpperCase() === 'DAY') {
        setDueDateStr(addDays(0))
      } else {
        setDueDateStr(addDays(7))
      }
    }
  }

  const handleBorrowerTypeSwitch = (nextType: 'STUDENT' | 'TEACHER') => {
    setBorrowerType(nextType)
    if (nextType === 'TEACHER') {
      setBorrowerClass('TEACHER')
      setDueDateStr(addDays(30))
    } else {
      if (borrowerClass.toUpperCase() === 'TEACHER') setBorrowerClass('')
      setDueDateStr(addDays(7))
    }
  }

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)
    const name = borrowerName.trim()
    const sid = Number(subjectId)
    if (!name || !sid) return

    if (borrowerHasOverdue) {
      setFeedback({
        type: 'error',
        text: `Borrowing blocked: ${name} has overdue book(s) that must be returned before issuing a new book.`
      })
      return
    }

    setIssuing(true)
    try {
      const dueIso = `${dueDateStr}T23:59:59.000Z`
      await db.addCheckout({
        subjectId: sid,
        studentName: name,
        studentClass: borrowerClass.trim() || (borrowerType === 'TEACHER' ? 'TEACHER' : undefined),
        dueDate: dueIso,
        conditionOut,
        bookNote: bookNote.trim() || null
      })

      const subName = subjects.find((s) => s.id === sid)?.name || 'Book'
      setFeedback({
        type: 'success',
        text: `Issued ${subName}${bookNote.trim() ? ` (${bookNote.trim()})` : ''} to ${name}.`
      })
      setSubjectId('')
      setBookNote('')
      setConditionOut(3)
      await loadAll()
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setIssuing(false)
    }
  }

  const handleQuickReturn = async (loan: Checkout, conditionIn: number) => {
    setProcessingId(loan.id)
    setFeedback(null)
    try {
      await db.returnCheckout(loan.id, conditionIn)
      if (conditionIn === 1) {
        await db.addIncident({
          type: 'DAMAGED',
          subjectId: loan.subjectId,
          bookTitle: loan.bookNote || loan.subject?.name || 'Book',
          condition: 'Returned Damaged',
          responsibleParty: loan.studentName,
          studentClass: loan.studentClass || undefined,
          reportedBy: 'LIBRARIAN',
          comment: 'Logged automatically from Circulation Desk return'
        })
      }
      setReturningId(null)
      setFeedback({
        type: 'success',
        text: `Returned ${loan.subject?.name || 'book'} from ${loan.studentName}${conditionIn === 1 ? ' (flagged as Damaged)' : ''}.`
      })
      await loadAll()
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setProcessingId(null)
    }
  }

  const handleRenew = async (loan: Checkout) => {
    setProcessingId(loan.id)
    setFeedback(null)
    try {
      await db.renewCheckout({ id: loan.id, extraDays: 7 })
      setFeedback({
        type: 'success',
        text: `Extended due date by 7 days for ${loan.studentName}.`
      })
      await loadAll()
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setProcessingId(null)
    }
  }

  const handleMarkLost = (loan: Checkout) => {
    setLoanToMarkLost(loan)
  }

  const confirmMarkLost = async () => {
    const loan = loanToMarkLost
    if (!loan) return
    setProcessingId(loan.id)
    setFeedback(null)
    try {
      await db.addIncident({
        type: 'LOST',
        subjectId: loan.subjectId,
        bookTitle: loan.bookNote || loan.subject?.name || 'Book',
        condition: 'Lost by borrower',
        responsibleParty: loan.studentName,
        studentClass: loan.studentClass || undefined,
        reportedBy: 'LIBRARIAN',
        comment: 'Reported lost at Circulation Desk'
      })
      setLoanToMarkLost(null)
      setFeedback({
        type: 'success',
        text: `Marked book as LOST for ${loan.studentName} and added to Incident Log / Clearance Hold.`
      })
      await loadAll()
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setProcessingId(null)
    }
  }

  const now = new Date()
  const stats = useMemo(() => {
    let overdue = 0
    let dueToday = 0
    let issuedToday = 0
    for (const c of activeCheckouts) {
      const due = new Date(c.dueDate)
      const out = new Date(c.checkoutDate)
      if (due.getTime() < now.getTime()) overdue++
      if (isSameDay(due, now)) dueToday++
      if (isSameDay(out, now)) issuedToday++
    }
    return { active: activeCheckouts.length, overdue, dueToday, issuedToday }
  }, [activeCheckouts])

  const filteredLoans = useMemo(() => {
    const q = loanSearch.trim().toLowerCase()
    const nowMs = Date.now()
    const today = new Date()
    return activeCheckouts.filter((c) => {
      const due = new Date(c.dueDate)
      if (loanFilter === 'OVERDUE' && due.getTime() >= nowMs) return false
      if (loanFilter === 'DUE_TODAY' && !isSameDay(due, today)) return false
      if (!q) return true
      return (
        c.studentName.toLowerCase().includes(q) ||
        (c.studentClass || '').toLowerCase().includes(q) ||
        (c.subject?.name || '').toLowerCase().includes(q) ||
        (c.bookNote || '').toLowerCase().includes(q)
      )
    })
  }, [activeCheckouts, loanSearch, loanFilter])

  const availableSubjects = useMemo(() => {
    return [...subjects].sort((a, b) => a.name.localeCompare(b.name))
  }, [subjects])

  return (
    <div className="space-y-6 animate-fade-in">
      {isChalk ? (
        <ChalkHero
          activeLoans={stats.active}
          issuedToday={stats.issuedToday}
          dueToday={stats.dueToday}
          overdueCount={stats.overdue}
          loanFilter={loanFilter}
          onFilterChange={setLoanFilter}
          onFocusIssue={() => borrowerInputRef.current?.focus()}
          onOpenClearance={() => navigate('/clearance')}
        />
      ) : (
      /* Chalk & Cloth Desk Hero Banner — exact sampled left-edge hex #182120 for seamless blend */
      <section className="relative overflow-hidden rounded-2xl bg-[#182120] border border-[#27302E] text-[#EEF2EF] shadow-xs">
        <img
          src="/assets/unslop/desk-banner.webp"
          alt=""
          aria-hidden="true"
          className="hidden md:block absolute right-0 top-0 h-full w-auto max-w-[58%] object-cover object-right select-none pointer-events-none"
          style={{
            maskImage: 'linear-gradient(to right, transparent 0%, black 22%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 22%)'
          }}
        />
        <div className="relative z-10 p-6 sm:p-7 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#63C7A4]">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#EEF2EF] mt-1">
            Circulation Desk
          </h1>
          <p className="text-sm text-[#A4B2AC] mt-1.5">
            {stats.active === 0
              ? 'All books are neatly on the shelves. Ready for the next break.'
              : `${stats.active} active loan${stats.active === 1 ? '' : 's'} out right now${stats.overdue > 0 ? ` — ${stats.overdue} overdue` : ''}.`}
          </p>

          {/* Compact interactive daily metrics strip */}
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <button
              type="button"
              onClick={() => setLoanFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold tabular-nums transition-colors cursor-pointer border ${
                loanFilter === 'ALL'
                  ? 'bg-[#2E9472] border-[#2E9472] text-white'
                  : 'bg-[#121615]/70 border-[#2C3634] text-[#D7E0DC] hover:border-[#3E4C49]'
              }`}
            >
              Active · {stats.active}
            </button>
            <div className="px-3 py-1.5 rounded-xl text-xs font-semibold tabular-nums bg-[#121615]/70 border border-[#2C3634] text-[#63C7A4]">
              Issued Today · {stats.issuedToday}
            </div>
            <button
              type="button"
              onClick={() => setLoanFilter('DUE_TODAY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold tabular-nums transition-colors cursor-pointer border ${
                loanFilter === 'DUE_TODAY'
                  ? 'bg-[#D49A3A] border-[#D49A3A] text-[#121615]'
                  : 'bg-[#121615]/70 border-[#2C3634] text-[#E2B05C] hover:border-[#D49A3A]/50'
              }`}
            >
              Due Today · {stats.dueToday}
            </button>
            <button
              type="button"
              onClick={() => setLoanFilter('OVERDUE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold tabular-nums transition-colors cursor-pointer border ${
                loanFilter === 'OVERDUE'
                  ? 'bg-[#C8553D] border-[#C8553D] text-white'
                  : 'bg-[#121615]/70 border-[#2C3634] text-[#E4836E] hover:border-[#C8553D]/50'
              }`}
            >
              Overdue · {stats.overdue}
            </button>
          </div>
        </div>
      </section>
      )}

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-[#1F6F54]/10 dark:bg-[#2E9472]/15 border-[#1F6F54]/30 dark:border-[#2E9472]/40 text-[#195C45] dark:text-[#7CD3B5]'
              : 'bg-[#C8553D]/10 dark:bg-[#C8553D]/15 border-[#C8553D]/30 text-[#B04731] dark:text-[#E89886]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-xs font-semibold underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-column Desk Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: Quick Issue */}
        <div className="chalk-card lg:col-span-5 bg-white dark:bg-[#191F1E] border border-[#E3E6DE] dark:border-[#27302E] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="chalk-ink text-base font-bold text-[#18201D] dark:text-[#EEF2EF] flex items-center gap-2.5">
              {isChalk ? (
                <ChalkArt name="stamp" size={28} />
              ) : (
                <img src="/assets/unslop/icon-desk.svg" alt="" className="w-6 h-6 object-contain" />
              )}
              Quick Issue Book
            </h2>
            <div className="chalk-segmented inline-flex rounded-xl bg-[#ECEFE8] dark:bg-[#121615] p-0.5 text-xs font-medium border border-[#E3E6DE] dark:border-[#27302E]">
              <button
                type="button"
                onClick={() => handleBorrowerTypeSwitch('STUDENT')}
                className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  borrowerType === 'STUDENT'
                    ? 'chalk-segmented-active bg-white dark:bg-[#232C2A] text-[#18201D] dark:text-[#EEF2EF] shadow-xs'
                    : 'text-[#5E6B65] dark:text-[#94A39D]'
                }`}
              >
                <GraduationCap size={13} />
                Student
              </button>
              <button
                type="button"
                onClick={() => handleBorrowerTypeSwitch('TEACHER')}
                className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  borrowerType === 'TEACHER'
                    ? 'chalk-segmented-active bg-white dark:bg-[#232C2A] text-[#18201D] dark:text-[#EEF2EF] shadow-xs'
                    : 'text-[#5E6B65] dark:text-[#94A39D]'
                }`}
              >
                <UserCheck size={13} />
                Teacher
              </button>
            </div>
          </div>

          <form onSubmit={handleIssue} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <AutocompleteField
                  ref={borrowerInputRef}
                  label={borrowerType === 'TEACHER' ? 'Teacher Name' : 'Student Name'}
                  required
                  placeholder={borrowerType === 'TEACHER' ? 'e.g. Mr. Okello' : 'Start typing student name...'}
                  value={borrowerName}
                  onChange={handleBorrowerNameChange}
                  options={directoryOptions.map((s) => ({
                    value: s.name,
                    badge: s.studentClass
                  }))}
                />
              </div>
              <TextField
                label="Class / Role"
                placeholder="e.g. S2"
                value={borrowerClass}
                onChange={(e) => setBorrowerClass(e.target.value)}
              />
            </div>

            {(matchedStudent || borrowerLoans.length > 0) && (
              <div
                className={`p-3 rounded-xl text-xs border ${
                  borrowerHasOverdue
                    ? 'bg-[#C8553D]/10 border-[#C8553D]/30 text-[#B04731] dark:text-[#E89886]'
                    : 'bg-[#F5F6F2] dark:bg-[#121615] border-[#E3E6DE] dark:border-[#27302E] text-[#4B5852] dark:text-[#A4B2AC]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {matchedStudent
                      ? `${matchedStudent.studentClass}${matchedStudent.section ? ` · ${matchedStudent.section}` : ''}${matchedStudent.combination ? ` · ${matchedStudent.combination}` : ''}`
                      : borrowerClass || borrowerType}
                  </span>
                  <span className="tabular-nums">
                    Active loans: <strong>{borrowerLoans.length}</strong>
                  </span>
                </div>
                {borrowerHasOverdue && (
                  <p className="mt-1 font-semibold flex items-center gap-1">
                    <AlertTriangle size={13} />
                    Has overdue book(s) — return overdue items before issuing new books.
                  </p>
                )}
              </div>
            )}

            <SelectField
              label="Subject"
              required
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              options={[
                { value: '', label: 'Select a subject...' },
                ...availableSubjects.map((s) => {
                  const avail = calculateAvailable(s)
                  return {
                    value: String(s.id),
                    label: `${s.name} (${avail} available)`
                  }
                })
              ]}
            />

            <TextField
              label="Book Title / Copy # (Optional)"
              placeholder="e.g. MK Biology Bk 2 #04"
              value={bookNote}
              onChange={(e) => setBookNote(e.target.value)}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#5E6B65] dark:text-[#94A39D]">
                  Return Due Date
                </label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: 'Today', days: 0 },
                    { label: '3d', days: 3 },
                    { label: '7d', days: 7 },
                    { label: '14d', days: 14 },
                    { label: '30d', days: 30 }
                  ].map((preset) => {
                    const target = addDays(preset.days)
                    const active = dueDateStr === target
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setDueDateStr(target)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          active
                            ? 'chalk-pill-active bg-[#1F6F54] dark:bg-[#2E9472] text-white'
                            : 'chalk-pill bg-[#ECEFE8] dark:bg-[#121615] text-[#5E6B65] dark:text-[#94A39D] hover:text-[#18201D] dark:hover:text-[#EEF2EF]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <input
                type="date"
                required
                value={dueDateStr}
                onChange={(e) => setDueDateStr(e.target.value)}
                className="chalk-input w-full px-3.5 py-2 text-sm bg-[#F5F6F2] dark:bg-[#121615] text-[#18201D] dark:text-[#EEF2EF] border border-[#DDE1D8] dark:border-[#27302E] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F6F54]/25 dark:focus:ring-[#2E9472]/30 focus:border-[#1F6F54] dark:focus:border-[#2E9472]"
              />
            </div>

            <SelectField
              label="Book Condition Out"
              value={String(conditionOut)}
              onChange={(e) => setConditionOut(Number(e.target.value))}
              options={[
                { value: '3', label: 'Good (3)' },
                { value: '2', label: 'Fair / Normal (2)' },
                { value: '1', label: 'Damaged / Worn (1)' }
              ]}
            />

            <Button
              type="submit"
              className="w-full py-2.5"
              disabled={issuing || borrowerHasOverdue || !borrowerName.trim() || !subjectId}
            >
              {issuing ? 'Issuing...' : 'Issue Book'}
            </Button>
          </form>
        </div>

        {/* RIGHT: Active Loans & Quick Return */}
        <div className="chalk-card lg:col-span-7 bg-white dark:bg-[#191F1E] border border-[#E3E6DE] dark:border-[#27302E] rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="chalk-ink text-base font-bold text-[#18201D] dark:text-[#EEF2EF] flex items-center gap-2.5">
              {isChalk ? (
                <ChalkArt name="books" size={28} />
              ) : (
                <img src="/assets/unslop/icon-inventory.svg" alt="" className="w-6 h-6 object-contain" />
              )}
              <span>Quick Return & Active Loans</span>
              <span className="chalk-pill text-xs font-bold tabular-nums px-2 py-0.5 rounded-full bg-[#ECEFE8] dark:bg-[#121615] text-[#5E6B65] dark:text-[#94A39D]">
                {filteredLoans.length}
              </span>
            </h2>
            <div className="relative flex-1 sm:max-w-xs">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5c55]" />
              <input
                type="text"
                value={loanSearch}
                onChange={(e) => setLoanSearch(e.target.value)}
                placeholder="Search borrower, class, book..."
                className="chalk-input w-full pl-8 pr-3 py-1.5 text-sm rounded-xl border border-[#DDE1D8] dark:border-[#27302E] bg-[#F5F6F2] dark:bg-[#121615] text-[#18201D] dark:text-[#EEF2EF] placeholder:text-[#8A9690] focus:outline-none focus:ring-2 focus:ring-[#2E9472]/30"
              />
            </div>
          </div>

          <div className="divide-y divide-[#ECEFE8] dark:divide-[#232C2A] max-h-[560px] overflow-y-auto pr-1">
            {loading ? (
              <div className="py-12 text-center text-sm text-[#7C8A84]">Loading active loans...</div>
            ) : filteredLoans.length === 0 ? (
              <EmptyState
                compact
                image="/assets/unslop/empty-loans.webp"
                title={activeCheckouts.length === 0 ? 'All books are on the shelves' : 'No matching loans'}
                description={
                  activeCheckouts.length === 0
                    ? 'Issue a textbook on the left and it will appear here for one-click return, renewal, or loss logging.'
                    : 'Try clearing your search or switching the filter pill above.'
                }
              />
            ) : (
              filteredLoans.map((loan) => {
                const due = new Date(loan.dueDate)
                const isOverdue = due.getTime() < Date.now()
                const daysOverdue = isOverdue
                  ? Math.max(1, Math.ceil((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24)))
                  : 0
                const isPickingReturn = returningId === loan.id
                const isBusy = processingId === loan.id

                return (
                  <div key={loan.id} className="py-3.5 flex flex-col gap-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[#18201D] dark:text-[#EEF2EF] truncate">
                            {loan.studentName}
                          </span>
                          {loan.studentClass && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#1F6F54]/12 dark:bg-[#2E9472]/20 text-[#1F6F54] dark:text-[#63C7A4]">
                              {loan.studentClass}
                            </span>
                          )}
                          {isOverdue && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#C8553D]/15 text-[#B04731] dark:text-[#E89886] flex items-center gap-1 tabular-nums">
                              <Clock size={11} />
                              {daysOverdue}d overdue
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[#4B5852] dark:text-[#C0CBC6] mt-0.5">
                          <span className="font-medium">{loan.subject?.name || `Subject #${loan.subjectId}`}</span>
                          {loan.bookNote && (
                            <span className="text-[#7C8A84]"> — {loan.bookNote}</span>
                          )}
                        </p>
                        <p className="text-xs text-[#7C8A84] mt-0.5 tabular-nums">
                          Issued {new Date(loan.checkoutDate).toLocaleDateString()} · Due {due.toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!isPickingReturn ? (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => setReturningId(loan.id)}
                            >
                              Return
                            </Button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRenew(loan)}
                              title="Renew +7 days"
                              className="p-1.5 rounded-xl border border-[#DDE1D8] dark:border-[#2C3634] text-[#5E6B65] dark:text-[#94A39D] hover:bg-[#ECEFE8] dark:hover:bg-[#232C2A] transition-colors cursor-pointer"
                            >
                              <CalendarPlus size={15} />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleMarkLost(loan)}
                              title="Mark Lost"
                              className="p-1.5 rounded-xl border border-[#C8553D]/30 text-[#C8553D] dark:text-[#E4836E] hover:bg-[#C8553D]/10 transition-colors cursor-pointer"
                            >
                              <XCircle size={15} />
                            </button>
                          </>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5 bg-[#F5F6F2] dark:bg-[#121615] p-1.5 rounded-xl border border-[#DDE1D8] dark:border-[#27302E]">
                            <span className="text-[11px] font-medium text-[#5E6B65] dark:text-[#94A39D] px-1">
                              Condition:
                            </span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleQuickReturn(loan, 3)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#1F6F54] hover:bg-[#195C45] text-white cursor-pointer"
                            >
                              Good
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleQuickReturn(loan, 2)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#D49A3A] hover:bg-[#BD872E] text-[#121615] cursor-pointer"
                            >
                              Fair
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleQuickReturn(loan, 1)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#C8553D] hover:bg-[#B04731] text-white cursor-pointer"
                            >
                              Damaged
                            </button>
                            <button
                              type="button"
                              onClick={() => setReturningId(null)}
                              className="px-2 py-1 text-xs text-[#5E6B65] hover:text-[#18201D] dark:text-[#94A39D] dark:hover:text-[#EEF2EF] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!loanToMarkLost}
        title="Mark Book as Lost"
        message={
          loanToMarkLost
            ? `Mark "${loanToMarkLost.subject?.name || 'Book'}" borrowed by ${loanToMarkLost.studentName} as LOST? This will place a clearance hold on the borrower.`
            : ''
        }
        confirmLabel="Mark Lost"
        variant="danger"
        isLoading={loanToMarkLost ? processingId === loanToMarkLost.id : false}
        onConfirm={confirmMarkLost}
        onCancel={() => setLoanToMarkLost(null)}
      />
    </div>
  )
}
