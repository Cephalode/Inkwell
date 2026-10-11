import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  /** Whether the dialog is currently shown. */
  open: boolean;
  /** Dialog title, e.g. "Delete deck?". */
  title: string;
  /** Body message, typically names the item, e.g. "Delete 'Biology Chapter 3'?". */
  message: string;
  /** Label for the destructive action button. */
  confirmLabel?: string;
  /** Label for the cancel button. */
  cancelLabel?: string;
  /** Called when the user confirms (clicks the destructive button). */
  onConfirm: () => void;
  /** Called when the user cancels (Escape, backdrop click, or cancel button). */
  onCancel: () => void;
}

/**
 * A lightweight, accessible confirmation modal rendered via a portal.
 *
 * Closes (calls `onCancel`) on:
 *  - Escape key press
 *  - Clicking the backdrop
 *
 * Only proceeds with `onConfirm` on an explicit confirm-button click.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-[fadeIn_0.1s_ease-out]"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="card w-full max-w-sm p-5 space-y-4"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="space-y-1.5">
          <h2 id="confirm-dialog-title" style={{ fontSize: 16 }}>
            {title}
          </h2>
          <p id="confirm-dialog-message" style={{ fontSize: 14, opacity: 0.65 }}>
            {message}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn btn-secondary" autoFocus>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="btn btn-danger">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
