import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      // Focus trap for Tab and Shift+Tab
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === modalRef.current) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Focus modal container on initial open without interfering with subsequent input typing
    const timer = setTimeout(() => {
      modalRef.current?.focus();
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previousActiveElementRef.current?.focus();
    };
  }, [isOpen]);
  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-[#2b3a35]/45 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        ref={modalRef}
        tabIndex={-1}
        className="chalk-modal bg-white dark:bg-[#191F1E] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-[#E3E6DE] dark:border-[#27302E] outline-none animate-fade-in"
      >
        <div className="chalk-modal-header bg-[#F5F6F2] dark:bg-[#141A19] p-4 border-b border-[#E3E6DE] dark:border-[#27302E] flex justify-between items-center">
          <h3 id="modal-title" className="chalk-ink text-base font-bold text-[#18201D] dark:text-[#EEF2EF]">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-[#5E6B65] hover:text-[#18201D] dark:text-[#94A39D] dark:hover:text-[#EEF2EF] transition-colors p-1 rounded-lg hover:bg-[#e9dcc0] cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
