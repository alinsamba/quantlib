import { useState, useMemo, useEffect } from 'react'
import { Modal } from '../Modal'
import { TextField, SelectField } from '../TextField'
import { Button } from '../Button'
import { db } from '../../lib/ipc-client'
import { calculateAvailable } from '../../lib/utils'
import type { Subject, BorrowingRule } from '../../lib/types'

interface IssueBookModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  subject: Subject | null
  borrowingRules: BorrowingRule[]
}

export function IssueBookModal({ isOpen, onClose, onSuccess, subject, borrowingRules }: IssueBookModalProps) {
  const [issueData, setIssueData] = useState({ studentName: '', studentClass: '', conditionOut: 3 })

  // Reset state when modal opens with a new subject
  useEffect(() => {
    if (isOpen) {
      setIssueData({ studentName: '', studentClass: '', conditionOut: 3 })
    }
  }, [isOpen, subject])

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

  const calculatedDueDateStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + (activeRule?.borrowDurationDays || 14))
    return d.toISOString().split('T')[0]
  }, [activeRule])

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject) return

    try {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (activeRule?.borrowDurationDays || 14))

      if (calculateAvailable(subject) <= 0) {
        alert('No available books for this subject.')
        return
      }

      const res = await db.addCheckout({
        subjectId: subject.id,
        studentName: issueData.studentName,
        studentClass: issueData.studentClass,
        conditionOut: Number(issueData.conditionOut),
        dueDate
      })
      if (!res.success) throw new Error(res.error)

      onSuccess()
    } catch (err: unknown) {
      console.error('Error issuing book', err)
      alert('Failed to issue book: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Issue Book">
      <form onSubmit={handleIssueSubmit} className="space-y-4">
        <TextField
          label="Subject"
          disabled
          className="cursor-not-allowed opacity-70"
          value={subject?.name || ''}
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
          <div className="font-semibold text-blue-900 dark:text-blue-100">Calculated Due Date: {new Date(calculatedDueDateStr).toLocaleDateString()}</div>
        </div>

        <div className="pt-4 flex space-x-3">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" className="flex-1">Confirm Issue</Button>
        </div>
      </form>
    </Modal>
  )
}
