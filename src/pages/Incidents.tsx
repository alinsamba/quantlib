import { useEffect } from 'react'
import { Download, Printer } from 'lucide-react'
import { exportToExcel, exportToCsv } from '../lib/exportUtils'
import { db } from '../lib/ipc-client'
import { useAsync } from '../hooks/useAsync'
import { Button } from '../components/Button'
import type { Incident } from '../lib/types'

export default function Incidents() {
  const { data: incidents, isLoading, error, execute } = useAsync<Incident[]>()

  useEffect(() => {
    execute(async () => {
      const res = await db.getIncidents()
      if (res.success) return res.data
      throw new Error(res.error)
    })
  }, [execute])

  const handleExportExcel = () => {
    const data = (incidents || []).map(inc => ({
      'Date': new Date(inc.date).toLocaleDateString(),
      'Type': inc.type,
      'Subject': inc.subject?.name || '-',
      'Book Title': inc.bookTitle,
      'Responsible': inc.responsibleParty || '-',
      'Class': inc.studentClass || '-',
      'Condition': inc.condition || '-',
      'Action Taken': inc.actionTaken || '-',
      'Comment': inc.comment || '-'
    }))
    exportToExcel(data, 'QuantLib_Incidents')
  }

  const handleExportCsv = () => {
    const data = (incidents || []).map(inc => ({
      'Date': new Date(inc.date).toLocaleDateString(),
      'Type': inc.type,
      'Subject': inc.subject?.name || '-',
      'Book Title': inc.bookTitle,
      'Responsible': inc.responsibleParty || '-',
      'Class': inc.studentClass || '-',
      'Condition': inc.condition || '-',
      'Action Taken': inc.actionTaken || '-',
      'Comment': inc.comment || '-'
    }))
    exportToCsv(data, 'QuantLib_Incidents')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Incident Log</h1>
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
          <Button className="print:hidden">
            Log Incident
          </Button>
        </div>
      </div>

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
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-300 text-sm">
                {(incidents || []).map((inc) => (
                  <tr key={inc.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="p-4">{new Date(inc.date).toLocaleDateString()}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        inc.type === 'DAMAGED' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        inc.type === 'LOST' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {inc.type}
                      </span>
                    </td>
                    <td className="p-4">{inc.subject?.name || '-'}</td>
                    <td className="p-4 font-medium dark:text-white">{inc.bookTitle}</td>
                    <td className="p-4">{inc.responsibleParty || '-'}</td>
                    <td className="p-4">{inc.studentClass || '-'}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400">{inc.condition || '-'}</td>
                  </tr>
                ))}
                {(incidents || []).length === 0 && (
                   <tr>
                     <td colSpan={7} className="p-8 text-center text-slate-500 dark:text-slate-400">No incidents logged yet</td>
                   </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
