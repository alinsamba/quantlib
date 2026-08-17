import { useState, useEffect, useMemo, useCallback } from 'react'
import { Download, Printer, RotateCcw } from 'lucide-react'
import { exportToExcel, exportToCsv } from '../lib/exportUtils'
import { db } from '../lib/ipc-client'
import { calculateAvailable } from '../lib/utils'
import { Button } from '../components/Button'
import { TextField, SelectField } from '../components/TextField'
import { Modal } from '../components/Modal'
import { useAsync } from '../hooks/useAsync'
import type { Subject, BorrowingRule, Checkout } from '../lib/types'

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState('')
  const { data: subjects, isLoading: subjectsLoading, execute: fetchSubjects } = useAsync<Subject[]>()
  const [borrowingRules, setBorrowingRules] = useState<BorrowingRule[]>([])

  useEffect(() => {
    db.getBorrowingRules()
      .then((rules) => setBorrowingRules(rules || []))
      .catch((err: unknown) => console.error(err))
  }, [])

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newSubject, setNewSubject] = useState({ name: '', category: 'General', openingCount: 0 })

  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const [issueData, setIssueData] = useState({ subjectId: 0, studentName: '', studentClass: '', conditionOut: 3 })
  const [selectedSubjectName, setSelectedSubjectName] = useState('')

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editSubject, setEditSubject] = useState({ id: 0, name: '', category: '', openingCount: 0 })

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

  const handleAddSubject = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await db.addSubject({
        name: newSubject.name,
        category: newSubject.category,
        openingCount: Number(newSubject.openingCount)
      })
      
      setIsAddModalOpen(false)
      setNewSubject({ name: '', category: 'General', openingCount: 0 })
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
    (subjects || []).filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [subjects, searchTerm]
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

    for (const rule of borrowingRules) {
      const key = rule.roleOrGrade.toUpperCase()
      if (key.includes('-')) {
        const parts = key.split('-').map(p => p.trim())
        if (parts.length === 2) {
          const [start, end] = parts
          const startMatch = start.match(/^([A-Z.]+)(\d+)$/)
          const endMatch = end.match(/^([A-Z.]+)(\d+)$/)
          const classMatch = normalized.match(/^([A-Z.]+)(\d+)$/)
          if (startMatch && endMatch && classMatch) {
            const [, startPrefix, startNumStr] = startMatch
            const [, endPrefix, endNumStr] = endMatch
            const [, classPrefix, classNumStr] = classMatch
            if (classPrefix === startPrefix && classPrefix === endPrefix) {
              const startNum = parseInt(startNumStr, 10)
              const endNum = parseInt(endNumStr, 10)
              const classNum = parseInt(classNumStr, 10)
              if (classNum >= startNum && classNum <= endNum) return rule
            }
          }
        }
      }
    }
    return borrowingRules.find(r => r.roleOrGrade === 'DEFAULT') || borrowingRules[0]
  }, [borrowingRules, issueData.studentClass])

  // Memoize date calculation for due date
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

        if (clearanceRes && clearanceRes.success && clearanceRes.data) {
          const { activeCheckouts } = clearanceRes.data
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
      fetchSubjects(async () => {
        return db.getSubjects()
      })
    } catch (err: unknown) {
      console.error('Error issuing book', err)
      alert('Failed to issue book: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [subjectsMap, issueData, activeRule, fetchSubjects])

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
      const list = Array.isArray(res) ? res : (res?.data || [])
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
      fetchSubjects(async () => {
        const d = await db.getSubjects()
        return d.data
      })
    } catch (err: unknown) {
      console.error('Error returning checkout', err)
      setReturnModalError(err instanceof Error ? err.message : 'Failed to return book.')
    } finally {
      setReturnModalSubmitting(false)
    }
  }, [selectedCheckoutIdToReturn, returnConditionIn, fetchSubjects])

  const handleEditSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await db.updateSubject(editSubject.id, {
        name: editSubject.name,
        category: editSubject.category,
        openingCount: Number(editSubject.openingCount)
      })
        
      setIsEditModalOpen(false)
      fetchSubjects(async () => {
        return db.getSubjects()
      })
    } catch (err: unknown) {
      console.error('Error editing subject', err)
      alert('Failed to edit subject: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [editSubject, fetchSubjects])

  const openEditModal = useCallback((sub: Subject) => {
    setEditSubject({ id: sub.id, name: sub.name, category: sub.category || '', openingCount: sub.openingCount })
    setIsEditModalOpen(true)
  }, [])

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
      'Wear Rate': s.degradationRate ? s.degradationRate.toFixed(2) : '0.00'
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
      'Wear Rate': s.degradationRate ? s.degradationRate.toFixed(2) : '0.00'
    }))
    exportToCsv(data, 'QuantLib_Inventory')
  }, [filtered])

  // Memoize active checkout select options for return modal
  const activeCheckoutsOptions = useMemo(() => {
    return activeCheckoutsForReturn.map(c => ({
      value: c.id.toString(),
      label: `${c.studentName} ${c.studentClass ? `(${c.studentClass})` : ''} - Due: ${new Date(c.dueDate).toLocaleDateString()}`
    }))
  }, [activeCheckoutsForReturn])

  // Memoize table row elements and calculations
  const tableRows = useMemo(() => (
    <>
      {filtered.map((sub) => {
        const available = calculateAvailable(sub);
        return (
          <tr key={sub.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
            <td className="p-4 font-medium text-slate-900 dark:text-slate-100">{sub.name}</td>
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
            <td className="p-4 text-center">
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

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors duration-200">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <input
            type="text"
            placeholder="Search subjects..."
            className="w-full max-w-md px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="overflow-x-auto">
          {subjectsLoading && !subjects ? (
            <div className="p-8 text-center text-slate-500">Loading inventory...</div>
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
                  <th className="p-4 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 text-sm">
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
            placeholder="e.g. John Doe"
            value={issueData.studentName}
            onChange={e => setIssueData({...issueData, studentName: e.target.value})}
          />
          
          <TextField 
            label="Class / Form"
            placeholder="e.g. S.4"
            value={issueData.studentClass}
            onChange={e => setIssueData({...issueData, studentClass: e.target.value})}
          />

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
            <Button type="submit" className="flex-1">Confirm Issue</Button>
          </div>
        </form>
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

          <TextField 
            label="Opening Stock Count"
            required
            type="number"
            min="0"
            value={editSubject.openingCount}
            onChange={e => setEditSubject({...editSubject, openingCount: parseInt(e.target.value) || 0})}
          />

          <div className="pt-4 flex space-x-3">
            <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)} className="flex-1">Cancel</Button>
            <Button type="submit" className="flex-1">Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
