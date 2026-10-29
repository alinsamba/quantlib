import { useEffect, useRef, useState } from 'react'
import { Download, Upload, Printer, Plus, CheckCircle2 } from 'lucide-react'
import { exportToExcel, exportToCsv, parseSpreadsheetFile } from '../lib/exportUtils'
import { db } from '../lib/ipc-client'
import { useAsync } from '../hooks/useAsync'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { TextField, SelectField, TextAreaField } from '../components/TextField'
import type { Incident, Subject } from '../lib/types'

export default function Incidents() {
  const { data: incidents, isLoading, error, execute } = useAsync<Incident[]>()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [modalError, setModalError] = useState('')
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    type: 'DAMAGED',
    subjectId: '',
    bookTitle: '',
    responsibleParty: '',
    studentClass: '',
    condition: '',
    actionTaken: '',
    comment: ''
  })

  useEffect(() => {
    execute(async () => {
      return db.getIncidents()
    })
  }, [execute])

  const openModal = async () => {
    setModalError('')
    setIsModalOpen(true)
    try {
      const list = await db.getSubjects()
      setSubjects(list || [])
    } catch {
      // ignore error loading subjects
    }
  }

  const handleResolve = async (inc: Incident) => {
    setResolvingId(inc.id)
    try {
      await db.resolveIncident({ id: inc.id, resolutionNotes: 'Resolved by Librarian' })
      execute(async () => db.getIncidents())
    } catch (err: unknown) {
      console.error('Failed to resolve incident:', err)
    } finally {
      setResolvingId(null)
    }
  }

  const handleImportSpreadsheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportNotice(null)
    try {
      const rows = await parseSpreadsheetFile(file)
      const subjectList = await db.getSubjects()
      let imported = 0
      for (const row of rows) {
        const rawTitle = String(row['Book Title'] || row.bookTitle || row.Title || row.title || '').trim()
        if (!rawTitle) continue
        const rawType = String(row.Type || row.type || 'DAMAGED').trim().toUpperCase()
        const validType = ['DAMAGED', 'LOST', 'RECOVERED', 'DONATION', 'NEW'].includes(rawType) ? rawType : 'DAMAGED'
        const rawSubjectName = String(row.Subject || row.subject || '').trim()
        const matchedSub = subjectList?.find((s) => s.name.toLowerCase() === rawSubjectName.toLowerCase())

        await db.addIncident({
          type: validType,
          subjectId: matchedSub ? matchedSub.id : null,
          bookTitle: rawTitle,
          responsibleParty: String(row.Responsible || row.responsibleParty || '').trim() || undefined,
          studentClass: String(row.Class || row.studentClass || '').trim() || undefined,
          condition: String(row.Condition || row.condition || '').trim() || undefined,
          actionTaken: String(row['Action Taken'] || row.actionTaken || 'PENDING').trim() || undefined,
          comment: String(row.Comment || row.comment || '').trim() || undefined
        })
        imported++
      }
      setImportNotice(`Successfully imported ${imported} incident record(s) from ${file.name}.`)
      execute(async () => db.getIncidents())
    } catch (err: unknown) {
      setImportNotice(`Import error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.bookTitle.trim()) {
      setModalError('Book title is required.')
      return
    }

    setSubmitting(true)
    setModalError('')
    try {
      await db.addIncident({
        type: formData.type,
        subjectId: formData.subjectId ? Number(formData.subjectId) : null,
        bookTitle: formData.bookTitle.trim(),
        responsibleParty: formData.responsibleParty.trim() || undefined,
        studentClass: formData.studentClass.trim() || undefined,
        condition: formData.condition.trim() || undefined,
        actionTaken: formData.actionTaken.trim() || undefined,
        comment: formData.comment.trim() || undefined
      })

      setIsModalOpen(false)
      setFormData({
        type: 'DAMAGED',
        subjectId: '',
        bookTitle: '',
        responsibleParty: '',
        studentClass: '',
        condition: '',
        actionTaken: '',
        comment: ''
      })
      execute(async () => db.getIncidents())
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleExportExcel = () => {
    const data = (incidents || []).map((inc) => ({
      Date: new Date(inc.date).toLocaleDateString(),
      Type: inc.type,
      Subject: inc.subject?.name || '-',
      'Book Title': inc.bookTitle,
      Responsible: inc.responsibleParty || '-',
      Class: inc.studentClass || '-',
      Condition: inc.condition || '-',
      'Action Taken': inc.actionTaken || '-',
      Comment: inc.comment || '-'
    }))
    exportToExcel(data, 'QuantLib_Incidents')
  }

  const handleExportCsv = () => {
    const data = (incidents || []).map((inc) => ({
      Date: new Date(inc.date).toLocaleDateString(),
      Type: inc.type,
      Subject: inc.subject?.name || '-',
      'Book Title': inc.bookTitle,
      Responsible: inc.responsibleParty || '-',
      Class: inc.studentClass || '-',
      Condition: inc.condition || '-',
      'Action Taken': inc.actionTaken || '-',
      Comment: inc.comment || '-'
    }))
    exportToCsv(data, 'QuantLib_Incidents')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Incident Log</h1>
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
          <Button icon={<Plus size={18} />} onClick={openModal} className="print:hidden">
            Log Incident
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
        <div className="overflow-x-auto">
          {isLoading && !incidents ? (
            <div className="p-8 text-center text-slate-500">Loading incidents...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-sm border-b border-slate-100 dark:border-slate-700">
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">Type</th>
                  <th className="p-4 font-medium">Subject</th>
                  <th className="p-4 font-medium">Book Title</th>
                  <th className="p-4 font-medium">Responsible</th>
                  <th className="p-4 font-medium">Class</th>
                  <th className="p-4 font-medium">Condition</th>
                  <th className="p-4 font-medium">Action / Status</th>
                  <th className="p-4 font-medium">Notes</th>
                  <th className="p-4 font-medium text-right print:hidden">Resolve</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-300 text-sm">
                {(incidents || []).map((inc) => {
                  const statusUpper = (inc.actionTaken || 'PENDING').toUpperCase()
                  const isResolved =
                    statusUpper.includes('RESOLVED') ||
                    statusUpper.includes('PAID') ||
                    statusUpper.includes('WAIVED') ||
                    statusUpper.includes('ADJUSTED')
                  const canResolve =
                    !isResolved && (inc.type === 'DAMAGED' || inc.type === 'LOST')

                  return (
                    <tr key={inc.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="p-4 whitespace-nowrap">{new Date(inc.date).toLocaleDateString()}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            inc.type === 'DAMAGED'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : inc.type === 'LOST'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : inc.type === 'NEW' || inc.type === 'DONATION'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          }`}
                        >
                          {inc.type}
                        </span>
                      </td>
                      <td className="p-4">{inc.subject?.name || '-'}</td>
                      <td className="p-4 font-medium dark:text-white">{inc.bookTitle}</td>
                      <td className="p-4">{inc.responsibleParty || '-'}</td>
                      <td className="p-4">{inc.studentClass || '-'}</td>
                      <td className="p-4 text-slate-500 dark:text-slate-400">{inc.condition || '-'}</td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                            isResolved
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {inc.actionTaken || 'PENDING'}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title={inc.comment || ''}>
                        {inc.comment || '-'}
                      </td>
                      <td className="p-4 text-right print:hidden">
                        {canResolve ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<CheckCircle2 size={14} />}
                            isLoading={resolvingId === inc.id}
                            onClick={() => handleResolve(inc)}
                            title={inc.type === 'DAMAGED' ? 'Mark repaired & restore to stock' : 'Mark found/resolved & restore to stock'}
                          >
                            Resolve
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {(incidents || []).length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-500 dark:text-slate-400">
                      No incidents logged yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Log New Incident">
        <form onSubmit={handleSubmit} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
              {modalError}
            </div>
          )}

          <SelectField
            label="Incident Type"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            options={[
              { label: 'Damaged Book', value: 'DAMAGED' },
              { label: 'Lost Book', value: 'LOST' },
              { label: 'Recovered Book', value: 'RECOVERED' },
              { label: 'Donation (+Stock)', value: 'DONATION' },
              { label: 'New Stock Addition (+Stock)', value: 'NEW' }
            ]}
          />

          <SelectField
            label="Associated Subject (Optional)"
            value={formData.subjectId}
            onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
            options={[
              { label: '-- Select Subject --', value: '' },
              ...subjects.map((s) => ({ label: s.name, value: String(s.id) }))
            ]}
          />

          <TextField
            label="Book Title"
            required
            placeholder="e.g. Physics Principles & Applications Vol. 1"
            value={formData.bookTitle}
            onChange={(e) => setFormData({ ...formData, bookTitle: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Responsible Party / Student"
              placeholder="e.g. John Doe"
              value={formData.responsibleParty}
              onChange={(e) => setFormData({ ...formData, responsibleParty: e.target.value })}
            />

            <TextField
              label="Class / Form"
              placeholder="e.g. S.4 North"
              value={formData.studentClass}
              onChange={(e) => setFormData({ ...formData, studentClass: e.target.value })}
            />
          </div>

          <TextField
            label="Condition Details"
            placeholder="e.g. Water damage on cover, missing pages"
            value={formData.condition}
            onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
          />

          <TextField
            label="Action Taken"
            placeholder="e.g. Fine issued $5.00, Replacement requested"
            value={formData.actionTaken}
            onChange={(e) => setFormData({ ...formData, actionTaken: e.target.value })}
          />

          <TextAreaField
            label="Comments / Additional Notes"
            placeholder="e.g. Spilled in cafeteria during lunch break"
            value={formData.comment}
            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
          />

          <div className="flex space-x-3 justify-end pt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting}>
              Log Incident
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
