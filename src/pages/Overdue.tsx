import { useEffect, useState } from 'react'
import { Printer, Clock, AlertTriangle, CheckCircle } from 'lucide-react'
import { db } from '../lib/ipc-client'
import { useAsync } from '../hooks/useAsync'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { SelectField } from '../components/TextField'
import type { Checkout } from '../lib/types'

export default function Overdue() {
  const { data: overdueCheckouts, isLoading, error, execute } = useAsync<Checkout[]>()
  const [selectedCheckout, setSelectedCheckout] = useState<Checkout | null>(null)
  const [conditionIn, setConditionIn] = useState<number>(3)
  const [returning, setReturning] = useState(false)
  const [returnError, setReturnError] = useState('')

  useEffect(() => {
    execute(async () => {
      return db.getOverdueCheckouts()
    })
  }, [execute])

  const openReturnModal = (checkout: Checkout) => {
    setSelectedCheckout(checkout)
    setConditionIn(3)
    setReturnError('')
  }

  const handleReturnBook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCheckout) return

    setReturning(true)
    setReturnError('')
    try {
      await db.returnCheckout(selectedCheckout.id, conditionIn)
      setSelectedCheckout(null)
      execute(async () => db.getOverdueCheckouts())
    } catch (err: unknown) {
      setReturnError(err instanceof Error ? err.message : String(err))
    } finally {
      setReturning(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between mb-8 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Clock className="text-rose-500" />
            <span>Overdue Books</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Books that have passed their due date.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-sm"
        >
          <Printer size={16} />
          <span>Print Notices</span>
        </button>
      </div>

      {isLoading && !overdueCheckouts ? (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 text-center text-slate-500 print:hidden">
          Loading overdue checkouts...
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 p-8 rounded-xl shadow-sm border border-red-200 dark:border-red-800 text-center text-red-600 dark:text-red-400 print:hidden">
          {error}
        </div>
      ) : (overdueCheckouts || []).length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 text-center text-slate-500 print:hidden">
          No overdue books right now! Great job keeping track.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4 print:text-black">
          {overdueCheckouts?.map((checkout, index) => (
            <div
              key={index}
              className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:border-black print:border-2 print:shadow-none print:break-inside-avoid flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 rounded-lg print:bg-transparent print:p-0">
                      <AlertTriangle size={20} className="print:hidden" />
                    </div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white print:text-black">
                      Overdue Notice
                    </h3>
                  </div>
                  <Button
                    variant="secondary"
                    icon={<CheckCircle size={16} className="text-emerald-500" />}
                    onClick={() => openReturnModal(checkout)}
                    className="print:hidden text-xs"
                  >
                    Return Book
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider print:text-gray-600">
                      Student
                    </p>
                    <p className="font-medium text-slate-800 dark:text-white text-lg print:text-black">
                      {checkout.studentName} {checkout.studentClass ? `(${checkout.studentClass})` : ''}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider print:text-gray-600">
                      Book Details
                    </p>
                    <p className="font-medium text-slate-800 dark:text-white print:text-black">
                      {checkout.subject?.name}
                    </p>
                  </div>

                  <div className="flex justify-between items-center bg-rose-50 dark:bg-slate-900 p-3 rounded-lg print:bg-gray-100">
                    <div>
                      <p className="text-xs text-rose-600/70 dark:text-rose-400/70 uppercase tracking-wider print:text-black">
                        Due Date
                      </p>
                      <p className="font-bold text-rose-700 dark:text-rose-400 print:text-black">
                        {new Date(checkout.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-rose-600/70 dark:text-rose-400/70 uppercase tracking-wider print:text-black">
                        Days Overdue
                      </p>
                      <p className="font-bold text-rose-700 dark:text-rose-400 print:text-black">
                        {Math.max(
                          1,
                          Math.floor(
                            (new Date().getTime() - new Date(checkout.dueDate).getTime()) /
                              (1000 * 3600 * 24)
                          )
                        )}{' '}
                        days
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-700 print:border-gray-300 mt-4 text-sm text-slate-600 dark:text-slate-400 print:text-black">
                Please return this book to the library as soon as possible.
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={Boolean(selectedCheckout)}
        onClose={() => setSelectedCheckout(null)}
        title="Process Returned Book"
      >
        {selectedCheckout && (
          <form onSubmit={handleReturnBook} className="space-y-4">
            {returnError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
                {returnError}
              </div>
            )}

            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg space-y-1 text-sm">
              <p className="text-xs text-slate-500 uppercase font-semibold">Student</p>
              <p className="font-bold text-slate-800 dark:text-white">{selectedCheckout.studentName}</p>
              <p className="text-xs text-slate-500 uppercase font-semibold pt-2">Book Title / Subject</p>
              <p className="font-bold text-slate-800 dark:text-white">{selectedCheckout.subject?.name}</p>
            </div>

            <SelectField
              label="Book Condition On Return"
              value={String(conditionIn)}
              onChange={(e) => setConditionIn(Number(e.target.value))}
              options={[
                { label: 'Good (Condition 3.0)', value: '3' },
                { label: 'Normal Wear (Condition 2.0)', value: '2' },
                { label: 'Damaged (Condition 1.0)', value: '1' }
              ]}
            />

            <div className="flex space-x-3 justify-end pt-4">
              <Button variant="secondary" onClick={() => setSelectedCheckout(null)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={returning}>
                Confirm Return
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
