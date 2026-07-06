import { useState, useEffect } from 'react'
import { db } from '../lib/ipc-client'
import { calculateAvailable } from '../lib/utils'

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState('')
  const [subjects, setSubjects] = useState<any[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newSubject, setNewSubject] = useState({ name: '', category: 'General', openingCount: 0 })

  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const defaultIssueData = { subjectId: 0, studentName: '', studentClass: '', conditionOut: 3 }
  const [issueData, setIssueData] = useState(defaultIssueData)
  const [selectedSubjectName, setSelectedSubjectName] = useState('')

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editSubject, setEditSubject] = useState({ id: 0, name: '', category: '', openingCount: 0 })

  async function load() {
    try {
      const data = await db.getSubjects()
      setSubjects(data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await db.addSubject({
        name: newSubject.name,
        category: newSubject.category,
        openingCount: Number(newSubject.openingCount)
      })
      setIsAddModalOpen(false)
      setNewSubject({ name: '', category: 'General', openingCount: 0 })
      load() // Refresh list
    } catch (err) {
      console.error('Error adding subject', err)
      alert('Failed to add subject')
    }
  }

  const filtered = subjects.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 14) // default 14 days
      const subject = subjects.find((sub) => sub.id === issueData.subjectId)

      if (!subject || calculateAvailable(subject) <= 0) {
        alert('No available books for this subject.')
        return
      }

      await db.addCheckout({
        subjectId: issueData.subjectId,
        studentName: issueData.studentName,
        studentClass: issueData.studentClass,
        conditionOut: Number(issueData.conditionOut),
        dueDate
      })
      setIsIssueModalOpen(false)
      setIssueData({ subjectId: 0, studentName: '', studentClass: '', conditionOut: 3 })
      load() // Refresh inventory counts
    } catch (err) {
      console.error('Error issuing book', err)
      alert('Failed to issue book')
    }
  }

  const openIssueModal = (sub: any) => {
    setIssueData({ ...defaultIssueData, subjectId: sub.id })
    setSelectedSubjectName(sub.name)
    setIsIssueModalOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await db.updateSubject(editSubject.id, {
        name: editSubject.name,
        category: editSubject.category,
        openingCount: Number(editSubject.openingCount)
      })
      setIsEditModalOpen(false)
      load() // Refresh list
    } catch (err) {
      console.error('Error editing subject', err)
      alert('Failed to edit subject')
    }
  }

  const openEditModal = (sub: any) => {
    setEditSubject({ id: sub.id, name: sub.name, category: sub.category || '', openingCount: sub.openingCount })
    setIsEditModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Inventory</h1>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
          + Add Subject
        </button>
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
                      {sub.averageCondition < 2.0 && <span className="text-red-500 ml-1 font-bold" title="Replacement Warning">!</span>}
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
                   <td colSpan={9} className="p-8 text-center text-slate-500 dark:text-slate-400">No subjects found</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-transparent dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Add New Subject</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleAddSubject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject Name</label>
                <input required type="text" className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all" placeholder="e.g. Mathematics" value={newSubject.name} onChange={e => setNewSubject({...newSubject, name: e.target.value})} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <input required type="text" className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all" placeholder="e.g. Science" value={newSubject.category} onChange={e => setNewSubject({...newSubject, category: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Opening Stock Count</label>
                <input required type="number" min="0" className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all" value={newSubject.openingCount} onChange={e => setNewSubject({...newSubject, openingCount: parseInt(e.target.value) || 0})} />
              </div>

              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">Save Subject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isIssueModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-transparent dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Issue Book</h2>
              <button onClick={() => setIsIssueModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleIssueSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject</label>
                <input type="text" disabled className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 cursor-not-allowed" value={selectedSubjectName} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Student Name</label>
                <input required type="text" className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all" placeholder="e.g. John Doe" value={issueData.studentName} onChange={e => setIssueData({...issueData, studentName: e.target.value})} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class / Form</label>
                <input type="text" className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all" placeholder="e.g. S.4" value={issueData.studentClass} onChange={e => setIssueData({...issueData, studentClass: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Outgoing Condition</label>
                <select 
                  className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all"
                  value={issueData.conditionOut}
                  onChange={e => setIssueData({...issueData, conditionOut: Number(e.target.value)})}
                >
                  <option value={3}>Good (3)</option>
                  <option value={2}>Normal (2)</option>
                  <option value={1}>Damaged (1)</option>
                </select>
              </div>

              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setIsIssueModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">Confirm Issue</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-transparent dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Edit Subject</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject Name</label>
                <input required type="text" className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all" value={editSubject.name} onChange={e => setEditSubject({...editSubject, name: e.target.value})} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <input required type="text" className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all" value={editSubject.category} onChange={e => setEditSubject({...editSubject, category: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Opening Stock Count</label>
                <input required type="number" min="0" className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all" value={editSubject.openingCount} onChange={e => setEditSubject({...editSubject, openingCount: parseInt(e.target.value) || 0})} />
              </div>

              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
