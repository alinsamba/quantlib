import { Modal } from './Modal'
import { Button } from './Button'
import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger'
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          {variant === 'danger' && (
            <div className="p-2 rounded-xl bg-[#a82c1d]/12 border-[1.5px] border-[#a82c1d] text-[#a82c1d] flex-shrink-0">
              <AlertTriangle size={20} />
            </div>
          )}
          <p className="chalk-ink text-sm text-[#2b3a35] leading-relaxed">{message}</p>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-[#c8bca3]">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
