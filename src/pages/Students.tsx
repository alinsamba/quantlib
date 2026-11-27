import { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Search, Download, Upload, Edit2, Trash2, ArrowUpCircle, GraduationCap, UserCheck } from 'lucide-react'
import { db } from '../lib/ipc-client'
import type { Student } from '../lib/types'
import { exportToExcel, exportToCsv, parseSpreadsheetFile } from '../lib/exportUtils'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { TextField, SelectField } from '../components/TextField'
import { EmptyState } from '../components/EmptyState'
import { useToast } from '../hooks/ToastContext'
import { ChalkArt } from '../components/theme/ChalkArt'

type DirectoryTab = 'STUDENTS' | 'TEACHERS'

const EMPTY_STUDENT_FORM = {
  name: '',
  studentClass: 'S1',
  sex: '',
  section: '',
  department: ''
}

const EMPTY_TEACHER_FORM = {
  name: '',
  studentClass: 'TEACHER',
  sex: '',
  section: '',
  department: ''
}

export default function Students() {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<DirectoryTab>('STUDENTS')
  const [records, setRecords] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  // Student filters
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedClass, setSelectedClass] = useState('ALL')
  const [selectedSection, setSelectedSection] = useState<'ALL' | 'BOARDING' | 'DAY'>('ALL')

  // Teacher filters
  const [teacherSearch, setTeacherSearch] = useState('')

  const [importNotice, setImportNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add/Edit Modal
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<DirectoryTab>('STUDENTS')
  const [editingRecord, setEditingRecord] = useState<Student | null>(null)
  const [formData, setFormData] = useState(EMPTY_STUDENT_FORM)
  const [submitting, setSubmitting] = useState(false)

  // Delete Confirm Modal
  const [recordToDelete, setRecordToDelete] = useState<Student | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Promote Classes Modal (Students only)
  const [isPromoteOpen, setIsPromoteOpen] = useState(false)
  const [graduateS4, setGraduateS4] = useState(false)
  const [graduateS6, setGraduateS6] = useState(true)
  const [promoting, setPromoting] = useState(false)

  const loadRecords = async () => {
    try {
      setLoading(true)
      const list = await db.getStudents()
      setRecords(list || [])
    } catch (err) {
      console.error('Failed to load directory', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecords()
  }, [])

  // Strictly separated lists
  const studentList = useMemo(
    () => records.filter((r) => r.studentClass.trim().toUpperCase() !== 'TEACHER'),
    [records]
  )

  const teacherList = useMemo(
    () => records.filter((r) => r.studentClass.trim().toUpperCase() === 'TEACHER'),
    [records]
  )

  const studentClasses = useMemo(() => {
    const set = new Set(studentList.map((s) => s.studentClass).filter(Boolean))
    return Array.from(set).sort()
  }, [studentList])

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    return studentList.filter((s) => {
      if (selectedClass !== 'ALL' && s.studentClass !== selectedClass) return false
      if (selectedSection !== 'ALL' && (s.section || '').toUpperCase() !== selectedSection) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.studentClass.toLowerCase().includes(q) ||
        (s.section || '').toLowerCase().includes(q)
      )
    })
  }, [studentList, studentSearch, selectedClass, selectedSection])

  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase()
    if (!q) return teacherList
    return teacherList.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.combination || '').toLowerCase().includes(q) ||
        (t.sex || '').toLowerCase().includes(q)
    )
  }, [teacherList, teacherSearch])

  const studentStats = useMemo(() => {
    const boarding = studentList.filter((s) => (s.section || '').toUpperCase() === 'BOARDING').length
    const day = studentList.filter((s) => (s.section || '').toUpperCase() === 'DAY').length
    return { total: studentList.length, boarding, day, classesCount: studentClasses.length }
  }, [studentList, studentClasses])

  const teacherStats = useMemo(() => {
    const female = teacherList.filter((t) => (t.sex || '').toUpperCase() === 'FEMALE').length
    const male = teacherList.filter((t) => (t.sex || '').toUpperCase() === 'MALE').length
    return { total: teacherList.length, female, male }
  }, [teacherList])

  const openAddStudent = () => {
    setFormMode('STUDENTS')
    setEditingRecord(null)
    setFormData(EMPTY_STUDENT_FORM)
    setIsFormOpen(true)
  }

  const openAddTeacher = () => {
    setFormMode('TEACHERS')
    setEditingRecord(null)
    setFormData(EMPTY_TEACHER_FORM)
    setIsFormOpen(true)
  }

  const openEditRecord = (record: Student) => {
    const isTeacher = record.studentClass.trim().toUpperCase() === 'TEACHER'
    setFormMode(isTeacher ? 'TEACHERS' : 'STUDENTS')
    setEditingRecord(record)
    setFormData({
      name: record.name,
      studentClass: isTeacher ? 'TEACHER' : record.studentClass,
      sex: record.sex || '',
      section: record.section || '',
      department: record.combination || ''
    })
    setIsFormOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    const finalClass = formMode === 'TEACHERS' ? 'TEACHER' : formData.studentClass.trim().toUpperCase()
    if (!finalClass) return

    setSubmitting(true)
    try {
      const payload = {
        name: formData.name.trim(),
        studentClass: finalClass,
        sex: formData.sex.trim() || null,
        section: formMode === 'STUDENTS' ? formData.section.trim() || null : null,
        house: null,
        combination: formMode === 'TEACHERS' ? formData.department.trim() || null : null
      }
      if (editingRecord) {
        await db.updateStudent(editingRecord.id, payload)
      } else {
        await db.addStudent(payload)
      }
      setIsFormOpen(false)
      setEditingRecord(null)
      await loadRecords()
    } catch (err) {
      showToast('Failed to save record: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!recordToDelete) return
    setDeleting(true)
    try {
      await db.deleteStudent(recordToDelete.id)
      showToast(`Removed ${recordToDelete.name}`, 'success')
      setRecordToDelete(null)
      await loadRecords()
    } catch (err) {
      showToast('Failed to delete record: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handlePromoteClasses = async () => {
    setPromoting(true)
    try {
      const res = await db.promoteStudents({ graduateS4, graduateS6 })
      setIsPromoteOpen(false)
      setImportNotice(
        `Class promotion complete: ${res.promoted} student(s) promoted${res.graduated > 0 ? `, ${res.graduated} graduated/removed` : ''}.`
      )
      await loadRecords()
    } catch (err) {
      showToast('Failed to promote classes: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setPromoting(false)
    }
  }

  const handleImportSpreadsheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportNotice(null)
    try {
      const rows = await parseSpreadsheetFile(file)
      let imported = 0
      for (const row of rows) {
        const rawName = String(row.Name || row.name || row['Student Name'] || row['Teacher Name'] || '').trim()
        const rawClass =
          activeTab === 'TEACHERS'
            ? 'TEACHER'
            : String(row.Class || row.studentClass || row.class || '').trim().toUpperCase()
        if (!rawName || !rawClass) continue
        try {
          await db.addStudent({
            name: rawName,
            studentClass: rawClass,
            sex: String(row.Sex || row.SEX || row.sex || '').trim() || null,
            section:
              activeTab === 'STUDENTS'
                ? String(row.Section || row.SECTION || row.section || '').trim() || null
                : null,
            house: null,
            combination:
              activeTab === 'TEACHERS'
                ? String(row.Department || row.Subject || row.department || '').trim() || null
                : null
          })
          imported++
        } catch {
          // Skip duplicates
        }
      }
      setImportNotice(
        `Imported ${imported} ${activeTab === 'TEACHERS' ? 'teacher(s)' : 'student(s)'} from ${file.name}.`
      )
      await loadRecords()
    } catch (err) {
      setImportNotice(`Import error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleExport = (format: 'xlsx' | 'csv') => {
    if (activeTab === 'TEACHERS') {
      const rows = filteredTeachers.map((t) => ({
        Name: t.name,
        Department: t.combination || '',
        Sex: t.sex || ''
      }))
      if (format === 'xlsx') exportToExcel(rows, 'quantlib_teachers')
      else exportToCsv(rows, 'quantlib_teachers')
    } else {
      const rows = filteredStudents.map((s) => ({
        Name: s.name,
        Class: s.studentClass,
        Sex: s.sex || '',
        Section: s.section || ''
      }))
      if (format === 'xlsx') exportToExcel(rows, 'quantlib_students')
      else exportToCsv(rows, 'quantlib_students')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + Dedicated Tab Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#fbf8f1] border-[1.5px] border-[#2b3a35] shadow-[2px_2px_0_#2b3a35] p-1 flex items-center justify-center flex-shrink-0">
            <ChalkArt name={activeTab === 'STUDENTS' ? 'learnerCap' : 'ledger'} size={38} />
          </div>
          <div>
            <h1 className="chalk-ink text-2xl font-extrabold tracking-tight">
              {activeTab === 'STUDENTS' ? 'Students Directory' : 'Teachers Directory'}
            </h1>
            <p className="chalk-muted text-sm">
              {activeTab === 'STUDENTS'
                ? 'Manage enrolled students (S1–S6) for book checkouts and end-of-term clearance.'
                : 'Manage teaching staff separately with their own borrowing limits and circulation records.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportSpreadsheet}
            className="hidden"
          />
          {activeTab === 'STUDENTS' && (
            <Button variant="ghost" size="sm" icon={<ArrowUpCircle size={15} />} onClick={() => setIsPromoteOpen(true)}>
              Promote
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={<Upload size={15} />} onClick={() => fileInputRef.current?.click()}>
            Import
          </Button>
          <Button variant="ghost" size="sm" icon={<Download size={15} />} onClick={() => handleExport('xlsx')}>
            Excel
          </Button>
          <Button variant="ghost" size="sm" icon={<Download size={15} />} onClick={() => handleExport('csv')}>
            CSV
          </Button>
          <div className="h-5 w-px bg-[#c8bca3] mx-0.5 hidden sm:block" />
          {activeTab === 'STUDENTS' ? (
            <Button size="sm" icon={<Plus size={15} />} onClick={openAddStudent}>
              Add Student
            </Button>
          ) : (
            <Button size="sm" icon={<Plus size={15} />} onClick={openAddTeacher}>
              Add Teacher
            </Button>
          )}
        </div>
      </div>

      {/* Students vs Teachers Segmented Switcher */}
      <div className="flex items-center justify-between gap-4">
        <div className="chalk-segmented inline-flex p-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('STUDENTS')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'STUDENTS' ? 'chalk-segmented-active' : 'text-[#4a5c55] hover:text-[#2b3a35]'
            }`}
          >
            <GraduationCap size={16} />
            <span>Students</span>
            <span className="text-xs tabular-nums px-2 py-0.5 rounded-full bg-[#e9dcc0] border border-[#2b3a35] text-[#2b3a35]">
              {studentList.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('TEACHERS')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'TEACHERS' ? 'chalk-segmented-active' : 'text-[#4a5c55] hover:text-[#2b3a35]'
            }`}
          >
            <UserCheck size={16} />
            <span>Teachers</span>
            <span className="text-xs tabular-nums px-2 py-0.5 rounded-full bg-[#e9dcc0] border border-[#2b3a35] text-[#2b3a35]">
              {teacherList.length}
            </span>
          </button>
        </div>
      </div>

      {importNotice && (
        <div className="p-3.5 rounded-xl bg-[#e9dcc0] border-[1.5px] border-[#2b3a35] text-sm text-[#2b3a35] flex justify-between items-center">
          <span>{importNotice}</span>
          <button
            type="button"
            onClick={() => setImportNotice(null)}
            className="text-xs font-bold underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ==================== STUDENTS TAB ==================== */}
      {activeTab === 'STUDENTS' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="chalk-card p-4">
              <p className="chalk-slate text-xs font-bold uppercase tracking-wide">Total Students</p>
              <p className="chalk-ink text-2xl font-extrabold tabular-nums mt-1">{studentStats.total}</p>
            </div>
            <div className="chalk-card p-4">
              <p className="chalk-slate text-xs font-bold uppercase tracking-wide">Classes</p>
              <p className="chalk-ink text-2xl font-extrabold tabular-nums mt-1">{studentStats.classesCount}</p>
            </div>
            <div className="chalk-card p-4">
              <p className="chalk-slate text-xs font-bold uppercase tracking-wide">Boarding</p>
              <p className="text-2xl font-extrabold tabular-nums text-[#b4690e] mt-1">{studentStats.boarding}</p>
            </div>
            <div className="chalk-card p-4">
              <p className="chalk-slate text-xs font-bold uppercase tracking-wide">Day</p>
              <p className="text-2xl font-extrabold tabular-nums text-[#1d5c43] mt-1">{studentStats.day}</p>
            </div>
          </div>

          <div className="chalk-card p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4a5c55]" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search students by name, class, or section..."
                  className="chalk-input w-full pl-10 pr-3.5 py-2 text-sm"
                />
              </div>

              <div className="chalk-segmented inline-flex p-1 self-start md:self-auto">
                {(['ALL', 'BOARDING', 'DAY'] as const).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setSelectedSection(sec)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedSection === sec ? 'chalk-segmented-active' : 'text-[#4a5c55] hover:text-[#2b3a35]'
                    }`}
                  >
                    {sec === 'ALL' ? 'All Sections' : sec === 'BOARDING' ? 'Boarding' : 'Day'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedClass('ALL')}
                className={`px-3 py-1 rounded-full text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                  selectedClass === 'ALL' ? 'chalk-pill-active' : 'chalk-pill'
                }`}
              >
                All ({studentList.length})
              </button>
              {studentClasses.map((cls) => {
                const count = studentList.filter((s) => s.studentClass === cls).length
                return (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setSelectedClass(cls)}
                    className={`px-3 py-1 rounded-full text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                      selectedClass === cls ? 'chalk-pill-active' : 'chalk-pill'
                    }`}
                  >
                    {cls} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          <div className="chalk-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">Sex</th>
                    <th className="py-3 px-4">Section</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c8bca3] text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center chalk-muted">
                        Loading students...
                      </td>
                    </tr>
                  ) : filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState
                          image="/assets/unslop/empty-students.webp"
                          chalkArt="learnerCap"
                          title={studentList.length === 0 ? 'No students enrolled yet' : 'No students match this filter'}
                          description={
                            studentList.length === 0
                              ? 'Add a student or import your class register spreadsheet to get started.'
                              : 'Try clearing your search or switching class/section pills.'
                          }
                          action={
                            studentList.length === 0 ? (
                              <Button size="sm" icon={<Plus size={15} />} onClick={openAddStudent}>
                                Add First Student
                              </Button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student) => (
                      <tr key={student.id} className="transition-colors">
                        <td className="py-3 px-4 font-semibold chalk-ink">{student.name}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#e9dcc0] border border-[#2b3a35] text-[#2b3a35]">
                            {student.studentClass}
                          </span>
                        </td>
                        <td className="py-3 px-4 chalk-muted">{student.sex || '—'}</td>
                        <td className="py-3 px-4">
                          {student.section ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${
                                student.section.toUpperCase() === 'BOARDING'
                                  ? 'bg-[#ecc472]/35 border-[#b4690e] text-[#7c4d08]'
                                  : 'bg-[#8fb5a5]/30 border-[#246b4f] text-[#1d5c43]'
                              }`}
                            >
                              {student.section}
                            </span>
                          ) : (
                            <span className="chalk-muted">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditRecord(student)}
                              className="p-1.5 rounded-lg text-[#2f5749] hover:text-[#2b3a35] hover:bg-[#e9dcc0] transition-colors cursor-pointer"
                              title="Edit student"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRecordToDelete(student)}
                              className="p-1.5 rounded-lg text-[#4a5c55] hover:text-[#a82c1d] hover:bg-[#a82c1d]/10 transition-colors cursor-pointer"
                              title="Remove student"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-[#c8bca3] text-xs chalk-muted tabular-nums">
              Showing {filteredStudents.length} of {studentList.length} student(s)
            </div>
          </div>
        </>
      )}

      {/* ==================== TEACHERS TAB ==================== */}
      {activeTab === 'TEACHERS' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="chalk-card p-4">
              <p className="chalk-slate text-xs font-bold uppercase tracking-wide">Total Teachers</p>
              <p className="chalk-ink text-2xl font-extrabold tabular-nums mt-1">{teacherStats.total}</p>
            </div>
            <div className="chalk-card p-4">
              <p className="chalk-slate text-xs font-bold uppercase tracking-wide">Female</p>
              <p className="text-2xl font-extrabold tabular-nums text-[#2f5749] mt-1">{teacherStats.female}</p>
            </div>
            <div className="chalk-card p-4">
              <p className="chalk-slate text-xs font-bold uppercase tracking-wide">Male</p>
              <p className="text-2xl font-extrabold tabular-nums text-[#1f5c7a] mt-1">{teacherStats.male}</p>
            </div>
          </div>

          <div className="chalk-card p-4">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4a5c55]" />
              <input
                type="text"
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                placeholder="Search teachers by name or department / subject..."
                className="chalk-input w-full pl-10 pr-3.5 py-2 text-sm"
              />
            </div>
          </div>

          <div className="chalk-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Teacher Name</th>
                    <th className="py-3 px-4">Department / Subject</th>
                    <th className="py-3 px-4">Sex</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c8bca3] text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center chalk-muted">
                        Loading teachers...
                      </td>
                    </tr>
                  ) : filteredTeachers.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState
                          image="/assets/unslop/empty-students.webp"
                          chalkArt="ledger"
                          title={teacherList.length === 0 ? 'No teachers added yet' : 'No teachers match your search'}
                          description={
                            teacherList.length === 0
                              ? 'Add teaching staff here so they appear in Teacher autocomplete on the Circulation Desk.'
                              : 'Try clearing your search query.'
                          }
                          action={
                            teacherList.length === 0 ? (
                              <Button size="sm" icon={<Plus size={15} />} onClick={openAddTeacher}>
                                Add First Teacher
                              </Button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredTeachers.map((teacher) => (
                      <tr key={teacher.id} className="transition-colors">
                        <td className="py-3 px-4 font-semibold chalk-ink">{teacher.name}</td>
                        <td className="py-3 px-4 chalk-muted">{teacher.combination || '—'}</td>
                        <td className="py-3 px-4 chalk-muted">{teacher.sex || '—'}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditRecord(teacher)}
                              className="p-1.5 rounded-lg text-[#2f5749] hover:text-[#2b3a35] hover:bg-[#e9dcc0] transition-colors cursor-pointer"
                              title="Edit teacher"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRecordToDelete(teacher)}
                              className="p-1.5 rounded-lg text-[#4a5c55] hover:text-[#a82c1d] hover:bg-[#a82c1d]/10 transition-colors cursor-pointer"
                              title="Remove teacher"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-[#c8bca3] text-xs chalk-muted tabular-nums">
              Showing {filteredTeachers.length} of {teacherList.length} teacher(s)
            </div>
          </div>
        </>
      )}

      {/* Add / Edit Modal (adapts cleanly to Student vs Teacher) */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={
          editingRecord
            ? formMode === 'TEACHERS'
              ? 'Edit Teacher'
              : 'Edit Student'
            : formMode === 'TEACHERS'
              ? 'Add Teacher'
              : 'Add Student'
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <TextField
            label="Full Name"
            required
            placeholder={formMode === 'TEACHERS' ? 'e.g. MR. OKELLO DAVID' : 'e.g. NABUKEERA BIRUNGI JOAN'}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          {formMode === 'STUDENTS' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Class"
                  required
                  placeholder="e.g. S1, S2, S5"
                  value={formData.studentClass}
                  onChange={(e) => setFormData({ ...formData, studentClass: e.target.value })}
                />
                <SelectField
                  label="Sex"
                  value={formData.sex}
                  onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                  options={[
                    { value: '', label: 'Unspecified' },
                    { value: 'FEMALE', label: 'FEMALE' },
                    { value: 'MALE', label: 'MALE' }
                  ]}
                />
              </div>
              <SelectField
                label="Section"
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                options={[
                  { value: '', label: 'Unspecified' },
                  { value: 'DAY', label: 'DAY' },
                  { value: 'BOARDING', label: 'BOARDING' }
                ]}
              />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Department / Subject (Optional)"
                placeholder="e.g. Sciences, Mathematics"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              />
              <SelectField
                label="Sex"
                value={formData.sex}
                onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                options={[
                  { value: '', label: 'Unspecified' },
                  { value: 'FEMALE', label: 'FEMALE' },
                  { value: 'MALE', label: 'MALE' }
                ]}
              />
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Saving...' : editingRecord ? 'Update' : formMode === 'TEACHERS' ? 'Add Teacher' : 'Add Student'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Promote Classes Modal (Students only) */}
      <Modal
        isOpen={isPromoteOpen}
        onClose={() => setIsPromoteOpen(false)}
        title="Promote Student Classes (New Academic Year)"
      >
        <div className="space-y-4 text-sm">
          <p className="chalk-muted">
            Advance students to the next class for the new school year. Teachers are kept completely separate and untouched.
          </p>
          <div className="bg-[#e9dcc0] border-[1.5px] border-[#2b3a35] rounded-xl p-3.5 space-y-1.5 text-xs tabular-nums">
            <p className="font-bold chalk-ink">Promotion Mapping:</p>
            <p className="chalk-ink">• S1 → S2 ({studentList.filter((s) => s.studentClass === 'S1').length} students)</p>
            <p className="chalk-ink">• S2 → S3 ({studentList.filter((s) => s.studentClass === 'S2').length} students)</p>
            <p className="chalk-ink">• S3 → S4 ({studentList.filter((s) => s.studentClass === 'S3').length} students)</p>
            <p className="chalk-ink">• S5 → S6 ({studentList.filter((s) => s.studentClass === 'S5').length} students)</p>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer chalk-ink">
              <input
                type="checkbox"
                checked={graduateS6}
                onChange={(e) => setGraduateS6(e.target.checked)}
                className="rounded border-[#2b3a35] text-[#a82c1d]"
              />
              <span>
                Graduate & remove current S6 ({studentList.filter((s) => s.studentClass === 'S6').length} students)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer chalk-ink">
              <input
                type="checkbox"
                checked={graduateS4}
                onChange={(e) => setGraduateS4(e.target.checked)}
                className="rounded border-[#2b3a35] text-[#a82c1d]"
              />
              <span>
                Graduate & remove current S4 ({studentList.filter((s) => s.studentClass === 'S4').length} students)
              </span>
            </label>
          </div>
          <div className="pt-3 flex gap-3">
            <Button type="button" variant="secondary" onClick={() => setIsPromoteOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="button" disabled={promoting} onClick={handlePromoteClasses} className="flex-1">
              {promoting ? 'Promoting...' : 'Run Promotion'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!recordToDelete}
        title={recordToDelete?.studentClass.toUpperCase() === 'TEACHER' ? 'Remove Teacher' : 'Remove Student'}
        message={
          recordToDelete
            ? `Remove ${recordToDelete.name} (${recordToDelete.studentClass}) from the ${
                recordToDelete.studentClass.toUpperCase() === 'TEACHER' ? 'teachers' : 'students'
              } directory?`
            : ''
        }
        confirmLabel="Remove"
        variant="danger"
        isLoading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setRecordToDelete(null)}
      />
    </div>
  )
}
