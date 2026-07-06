import { useState, useEffect } from 'react'
import { Printer, Clock, AlertTriangle } from 'lucide-react'
import { db } from '../lib/ipc-client'

export default function Overdue() {
  const [overdueCheckouts, setOverdueCheckouts] = useState<any[]>([])

  useEffect(() => {
    async function loadData() {
      const data = await db.getOverdueCheckouts()
      setOverdueCheckouts(data)
    }
    loadData()
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between mb-8 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Clock className="text-rose-500" />
            <span>Overdue Books</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Books that have passed their due date.</p>
        </div>
        <button 
          onClick={() => window.print()}
          className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-sm"
        >
          <Printer size={16} />
          <span>Print Notices</span>
        </button>
      </div>

      {overdueCheckouts.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 text-center text-slate-500 print:hidden">
          No overdue books right now! Great job keeping track.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4 print:text-black">
          {overdueCheckouts.map((checkout, index) => (
            <div key={index} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:border-black print:border-2 print:shadow-none print:break-inside-avoid">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 rounded-lg print:bg-transparent print:p-0">
                  <AlertTriangle size={20} className="print:hidden" />
                </div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-white print:text-black">Overdue Notice</h3>
              </div>
              
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider print:text-gray-600">Student</p>
                  <p className="font-medium text-slate-800 dark:text-white text-lg print:text-black">{checkout.studentName} {checkout.studentClass ? `(${checkout.studentClass})` : ''}</p>
                </div>
                
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider print:text-gray-600">Book Details</p>
                  <p className="font-medium text-slate-800 dark:text-white print:text-black">{checkout.subject?.name}</p>
                </div>
                
                <div className="flex justify-between items-center bg-rose-50 dark:bg-slate-900 p-3 rounded-lg print:bg-gray-100">
                  <div>
                    <p className="text-xs text-rose-600/70 dark:text-rose-400/70 uppercase tracking-wider print:text-black">Due Date</p>
                    <p className="font-bold text-rose-700 dark:text-rose-400 print:text-black">{new Date(checkout.dueDate).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-rose-600/70 dark:text-rose-400/70 uppercase tracking-wider print:text-black">Days Overdue</p>
                    <p className="font-bold text-rose-700 dark:text-rose-400 print:text-black">
                      {Math.max(1, Math.floor((new Date().getTime() - new Date(checkout.dueDate).getTime()) / (1000 * 3600 * 24)))} days
                    </p>
                  </div>
                </div>
                
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700 print:border-gray-300 mt-4 text-sm text-slate-600 dark:text-slate-400 print:text-black">
                  Please return this book to the library as soon as possible.
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
