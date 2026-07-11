import { useState, useEffect, useMemo } from 'react'
import { Download, Printer } from 'lucide-react'
import { exportToExcel, exportToCsv } from '../lib/exportUtils'
import { db } from '../lib/ipc-client'
import { calculateAvailable } from '../lib/utils'
import { Button } from '../components/Button'
import { TextField, SelectField } from '../components/TextField'
import { Modal } from '../components/Modal'
import { useAsync } from '../hooks/useAsync'
import type { Subject } from '../lib/types'

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState('')
  const { data: subjects, isLoading: subjectsLoading, execute: fetchSubjects } = useAsync<Subject[]>()

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newSubject, setNewSubject] = useState({ name: '', category: 'General', openingCount: 0 })

  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const defaultIssueData = { subjectId: 0, studentName: '', studentClass: '', conditionOut: 3 }
  const [issueData, setIssueData] = useState(defaultIssueData)
  const [selectedSubjectName, setSelectedSubjectName] = useState('')

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editSubject, setEditSubject] = useState({ id: 0, name: '', category: '', openingCount: 0 })

  useEffect(() => {
    fetchSubjects(async () => {
      const res = await db.getSubjects()
      if (res.success) return res.data
      throw new Error(res.error)
    })
  }, [fetchSubjects])

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await db.addSubject({
        name: newSubject.name,
        category: newSubject.category,
        openingCount: Number(newSubject.openingCount)
      })
      if (!res.success) throw new Error(res.error)
      
      setIsAddModalOpen(false)
      setNewSubject({ name: '', category: 'General', openingCount: 0 })
      fetchSubjects(async () => {
        const d = await db.getSubjects()
        return d.data
      })
    } catch (err: unknown) {
      console.error('Error adding subject', err)
      alert('Failed to add subject: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const filtered = (subjects || []).filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))

  const subjectsMap = useMemo(() => {
    const map = new Map<number, Subject>()
    for (const subject of subjects || []) {
      map.set(subject.id, subject)
    }
    return map
  }, [subjects])

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 14) // default 14 days
      const subject = subjectsMap.get(issueData.subjectId)

      if (!subject || calculateAvailable(subject) <= 0) {
        alert('No available books for this subject.')
        return
      }

      const res = await db.addCheckout({
        subjectId: issueData.subjectId,
        studentName: issueData.studentName,
        studentClass: issueData.studentClass,
        conditionOut: Number(issueData.conditionOut),
        dueDate
      })
      if (!res.success) throw new Error(res.error)

      setIsIssueModalOpen(false)
      setIssueData({ subjectId: 0, studentName: '', studentClass: '', conditionOut: 3 })
      fetchSubjects(async () => {
        const d = await db.getSubjects()
        return d.data
      })
    } catch (err: unknown) {
      console.error('Error issuing book', err)
      alert('Failed to issue book: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const openIssueModal = (sub: Subject) => {
    setIssueData({ ...defaultIssueData, subjectId: sub.id })
    setSelectedSubjectName(sub.name)
    setIsIssueModalOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await db.updateSubject(editSubject.id, {
        name: editSubject.name,
        category: editSubject.category,
        openingCount: Number(editSubject.openingCount)
      })
      if (!res.success) throw new Error(res.error)
        
      setIsEditModalOpen(false)
      fetchSubjects(async () => {
        const d = await db.getSubjects()
        return d.data
      })
    } catch (err: unknown) {
      console.error('Error editing subject', err)
      alert('Failed to edit subject: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const openEditModal = (sub: Subject) => {
    setEditSubject({ id: sub.id, name: sub.name, category: sub.category || '', openingCount: sub.openingCount })
    setIsEditModalOpen(true)
  }

  const handleExportExcel = () => {
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
  }

  const handleExportCsv = () => {
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
  }

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

          <div className="pt-4 flex space-x-3">
            <Button type="button" variant="secondary" onClick={() => setIsIssueModalOpen(false)} className="flex-1">Cancel</Button>
            <Button type="submit" className="flex-1">Confirm Issue</Button>
          </div>
        </form>
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
