import { useState, useEffect, useMemo, useCallback } from 'react'
import { Download, Printer } from 'lucide-react'
import { exportToExcel, exportToCsv } from '../lib/exportUtils'
import { db } from '../lib/ipc-client'
import { calculateAvailable } from '../lib/utils'
import { Button } from '../components/Button'
import { useAsync } from '../hooks/useAsync'
import type { Subject, BorrowingRule } from '../lib/types'
import { AddSubjectModal } from '../components/inventory/AddSubjectModal'
import { IssueBookModal } from '../components/inventory/IssueBookModal'
import { EditSubjectModal } from '../components/inventory/EditSubjectModal'

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState('')
  const { data: subjects, isLoading: subjectsLoading, execute: fetchSubjects } = useAsync<Subject[]>()
  const [borrowingRules, setBorrowingRules] = useState<BorrowingRule[]>([])

  useEffect(() => {
    db.getBorrowingRules().then((res: any) => {
      if (res && res.success) setBorrowingRules(res.data || [])
    }).catch((err: any) => console.error(err))
  }, [])

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const fetchAllSubjects = useCallback(() => {
    fetchSubjects(async () => {
      const res = await db.getSubjects()
      if (res.success) return res.data
      throw new Error(res.error)
    })
  }, [fetchSubjects])

  useEffect(() => {
    fetchAllSubjects()
  }, [fetchAllSubjects])

  // ⚡ Bolt Optimization: Memoize the filtered array so it doesn't recalculate on modal keystrokes
  // Expected Impact: Prevents O(N) string matching on every keystroke when typing in modals.
  const filtered = useMemo(() =>
    (subjects || []).filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [subjects, searchTerm]
  )

  // ⚡ Bolt Optimization: Memoize callbacks so they don't change reference on every render
  // Expected Impact: Prevents child components (like memoized table rows) from breaking memoization.
  const openIssueModal = useCallback((sub: Subject) => {
    setSelectedSubject(sub)
    setIsIssueModalOpen(true)
  }, [])

  const openEditModal = useCallback((sub: Subject) => {
    setSelectedSubject(sub)
    setIsEditModalOpen(true)
  }, [])

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

  // ⚡ Bolt Optimization: Memoize the entire table body mapping loop
  // Expected Impact: Eliminates O(N) React render cycles for the table on every keystroke inside
  // the Add/Issue/Edit modal input fields, drastically reducing input latency.
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
  ), [filtered, openIssueModal, openEditModal])

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

      <AddSubjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          setIsAddModalOpen(false)
          fetchAllSubjects()
        }}
      />

      <IssueBookModal
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        onSuccess={() => {
          setIsIssueModalOpen(false)
          fetchAllSubjects()
        }}
        subject={selectedSubject}
        borrowingRules={borrowingRules}
      />

      <EditSubjectModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => {
          setIsEditModalOpen(false)
          fetchAllSubjects()
        }}
        subject={selectedSubject}
      />
    </div>
  )
}
