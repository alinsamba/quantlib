import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Plus, Trash2, Edit2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { Modal } from '../../components/Modal'
import { db } from '../../lib/ipc-client'
import type { BorrowingRule } from '../../lib/types'

export function BorrowingRules() {
  const [borrowingRules, setBorrowingRules] = useState<BorrowingRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [ruleFormData, setRuleFormData] = useState({ id: 0, roleOrGrade: '', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0 })
  const [ruleError, setRuleError] = useState('')

  const fetchRules = useCallback(async () => {
    setRulesLoading(true)
    try {
      const res = await db.getBorrowingRules()
      if (res && res.success) {
        setBorrowingRules(res.data || [])
      }
    } catch (err: unknown) {
      console.error('Failed to fetch borrowing rules:', err)
    } finally {
      setRulesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const handleOpenAddRule = () => {
    setRuleFormData({ id: 0, roleOrGrade: '', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0 })
    setRuleError('')
    setIsRuleModalOpen(true)
  }

  const handleOpenEditRule = (rule: BorrowingRule) => {
    setRuleFormData({
      id: rule.id,
      roleOrGrade: rule.roleOrGrade,
      maxBooksAllowed: rule.maxBooksAllowed,
      borrowDurationDays: rule.borrowDurationDays,
      finePerDay: rule.finePerDay
    })
    setRuleError('')
    setIsRuleModalOpen(true)
  }

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    setRuleError('')
    try {
      const res = await db.saveBorrowingRule({
        id: ruleFormData.id || undefined,
        roleOrGrade: ruleFormData.roleOrGrade,
        maxBooksAllowed: Number(ruleFormData.maxBooksAllowed),
        borrowDurationDays: Number(ruleFormData.borrowDurationDays),
        finePerDay: Number(ruleFormData.finePerDay)
      })
      if (res.success) {
        setIsRuleModalOpen(false)
        fetchRules()
      } else {
        setRuleError(res.error || 'Failed to save rule')
      }
    } catch (err: unknown) {
      setRuleError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const handleDeleteRule = async (id: number) => {
    if (!confirm('Are you sure you want to delete this borrowing rule?')) return
    try {
      const res = await db.deleteBorrowingRule(id)
      if (res.success) {
        fetchRules()
      } else {
        alert(res.error || 'Failed to delete rule')
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6">
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center space-x-2">
            <BookOpen size={20} className="text-blue-500" />
            <span>Borrowing Rules</span>
          </h2>
          <Button size="sm" icon={<Plus size={16} />} onClick={handleOpenAddRule}>
            Add Rule
          </Button>
        </div>

        {rulesLoading ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading rules...</div>
        ) : (
          <div className="space-y-3">
            {borrowingRules.map((rule) => (
              <div key={rule.id} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{rule.roleOrGrade}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex space-x-3">
                    <span>Max Books: {rule.maxBooksAllowed}</span>
                    <span>•</span>
                    <span>Duration: {rule.borrowDurationDays} days</span>
                    <span>•</span>
                    <span>Fine: ${rule.finePerDay.toFixed(2)}/day</span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button variant="secondary" size="sm" icon={<Edit2 size={16} />} onClick={() => handleOpenEditRule(rule)} className="p-2" aria-label="Edit Rule" />
                  {rule.roleOrGrade !== 'DEFAULT' && (
                    <Button variant="secondary" size="sm" icon={<Trash2 size={16} />} onClick={() => handleDeleteRule(rule.id)} className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 border-rose-100 dark:border-rose-900/50" aria-label="Delete Rule" />
                  )}
                </div>
              </div>
            ))}
            {borrowingRules.length === 0 && (
              <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No specific borrowing rules defined.</div>
            )}
          </div>
        )}
      </div>

      {/* Borrowing Rule Add/Edit Modal */}
      <Modal isOpen={isRuleModalOpen} onClose={() => setIsRuleModalOpen(false)} title={ruleFormData.id ? "Edit Borrowing Rule" : "Add Borrowing Rule"}>
        <form onSubmit={handleSaveRule} className="space-y-4">
          <TextField
            label="Role or Grade Level"
            required
            placeholder="e.g. S.1-S.4, S.5-S.6, TEACHER"
            value={ruleFormData.roleOrGrade}
            onChange={(e) => setRuleFormData({ ...ruleFormData, roleOrGrade: e.target.value })}
            disabled={ruleFormData.roleOrGrade === 'DEFAULT'}
          />
          <TextField
            label="Max Books Allowed"
            type="number"
            required
            min={1}
            value={ruleFormData.maxBooksAllowed}
            onChange={(e) => setRuleFormData({ ...ruleFormData, maxBooksAllowed: parseInt(e.target.value, 10) || 1 })}
          />
          <TextField
            label="Borrow Duration (Days)"
            type="number"
            required
            min={1}
            value={ruleFormData.borrowDurationDays}
            onChange={(e) => setRuleFormData({ ...ruleFormData, borrowDurationDays: parseInt(e.target.value, 10) || 1 })}
          />
          <TextField
            label="Fine Per Overdue Day ($)"
            type="number"
            step="0.01"
            min={0}
            value={ruleFormData.finePerDay}
            onChange={(e) => setRuleFormData({ ...ruleFormData, finePerDay: parseFloat(e.target.value) || 0 })}
          />
          {ruleError && <div className="text-red-500 text-sm font-medium">{ruleError}</div>}
          <div className="pt-4 flex space-x-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setIsRuleModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Save Rule
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
