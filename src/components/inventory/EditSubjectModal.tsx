import { useState, useEffect } from 'react'
import { Modal } from '../Modal'
import { TextField } from '../TextField'
import { Button } from '../Button'
import { db } from '../../lib/ipc-client'
import type { Subject } from '../../lib/types'

interface EditSubjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  subject: Subject | null
}

export function EditSubjectModal({ isOpen, onClose, onSuccess, subject }: EditSubjectModalProps) {
  const [editSubject, setEditSubject] = useState({ id: 0, name: '', category: '', openingCount: 0 })

  useEffect(() => {
    if (subject && isOpen) {
      setEditSubject({
        id: subject.id,
        name: subject.name,
        category: subject.category || '',
        openingCount: subject.openingCount
      })
    }
  }, [subject, isOpen])

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await db.updateSubject(editSubject.id, {
        name: editSubject.name,
        category: editSubject.category,
        openingCount: Number(editSubject.openingCount)
      })
      if (!res.success) throw new Error(res.error)

      onSuccess()
    } catch (err: unknown) {
      console.error('Error editing subject', err)
      alert('Failed to edit subject: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Subject">
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
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" className="flex-1">Save Changes</Button>
        </div>
      </form>
    </Modal>
  )
}
