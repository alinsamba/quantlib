import { useState } from 'react'
import { Modal } from '../Modal'
import { TextField } from '../TextField'
import { Button } from '../Button'
import { db } from '../../lib/ipc-client'

interface AddSubjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AddSubjectModal({ isOpen, onClose, onSuccess }: AddSubjectModalProps) {
  const [newSubject, setNewSubject] = useState({ name: '', category: 'General', openingCount: 0 })

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await db.addSubject({
        name: newSubject.name,
        category: newSubject.category,
        openingCount: Number(newSubject.openingCount)
      })
      if (!res.success) throw new Error(res.error)

      setNewSubject({ name: '', category: 'General', openingCount: 0 })
      onSuccess()
    } catch (err: unknown) {
      console.error('Error adding subject', err)
      alert('Failed to add subject: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Subject">
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
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" className="flex-1">Save Subject</Button>
        </div>
      </form>
    </Modal>
  )
}
