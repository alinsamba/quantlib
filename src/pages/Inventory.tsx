import { useState, useEffect } from 'react'
import { db } from '../lib/ipc-client'

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState('')
  const [subjects, setSubjects] = useState<any[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newSubject, setNewSubject] = useState({ name: '', category: 'General', openingCount: 0 })

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
          + Add Subject
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <input
            type="text"
            placeholder="Search subjects..."
            className="w-full max-w-md px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-100">
                <th className="p-4 font-medium">Subject</th>
                <th className="p-4 font-medium">Category</th>
                <th className="p-4 font-medium text-right">Opening</th>
                <th className="p-4 font-medium text-right">Recovered</th>
                <th className="p-4 font-medium text-right">Issued</th>
                <th className="p-4 font-medium text-right text-red-500">Damaged</th>
                <th className="p-4 font-medium text-right text-red-500">Lost</th>
                <th className="p-4 font-medium text-right text-green-600">Available</th>
                <th className="p-4 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 text-sm">
              {filtered.map((sub) => {
                const available = sub.openingCount + sub.recovered - sub.issued - sub.damaged - sub.lost;
                return (
                  <tr key={sub.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-medium text-slate-900">{sub.name}</td>
                    <td className="p-4 text-slate-500">{sub.category}</td>
                    <td className="p-4 text-right">{sub.openingCount}</td>
                    <td className="p-4 text-right text-blue-600">{sub.recovered}</td>
                    <td className="p-4 text-right text-amber-600">{sub.issued}</td>
                    <td className="p-4 text-right text-red-500">{sub.damaged}</td>
                    <td className="p-4 text-right text-red-500">{sub.lost}</td>
                    <td className="p-4 text-right font-bold text-green-600">{available}</td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center space-x-2">
                        <button className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors text-xs font-medium">Issue</button>
                        <button className="text-slate-600 hover:bg-slate-100 px-2 py-1 rounded transition-colors text-xs font-medium">Edit</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                 <tr>
                   <td colSpan={9} className="p-8 text-center text-slate-500">No subjects found</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">Add New Subject</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleAddSubject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject Name</label>
                <input required type="text" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="e.g. Mathematics" value={newSubject.name} onChange={e => setNewSubject({...newSubject, name: e.target.value})} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <input required type="text" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="e.g. Science" value={newSubject.category} onChange={e => setNewSubject({...newSubject, category: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Opening Stock Count</label>
                <input required type="number" min="0" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={newSubject.openingCount} onChange={e => setNewSubject({...newSubject, openingCount: parseInt(e.target.value) || 0})} />
              </div>

              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">Save Subject</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
