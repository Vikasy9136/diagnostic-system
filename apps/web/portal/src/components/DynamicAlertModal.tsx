import { useEffect } from 'react';

export type DynamicAlertVariant = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface DynamicAlertState {
  isOpen: boolean;
  variant: DynamicAlertVariant;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}

export const INITIAL_DYNAMIC_ALERT: DynamicAlertState = {
  isOpen: false,
  variant: 'info',
  title: '',
  message: '',
};

interface DynamicAlertModalProps {
  alertState: DynamicAlertState;
  onClose: () => void;
}

export function DynamicAlertModal({ alertState, onClose }: DynamicAlertModalProps) {
  useEffect(() => {
    if (!alertState.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alertState.isOpen, onClose]);

  if (!alertState.isOpen) return null;

  const isConfirm = alertState.variant === 'confirm' || Boolean(alertState.onConfirm);

  const renderIcon = () => {
    switch (alertState.variant) {
      case 'success':
        return (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
      case 'error':
        return (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      case 'warning':
        return (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'confirm':
        return (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        );
      default:
        return (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
    }
  };

  return (
    <div
      className="labsetu-alert-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="labsetu-alert-title"
      onClick={onClose}
    >
      <div className="labsetu-alert-card" onClick={(e) => e.stopPropagation()}>
        <div className={`labsetu-alert-strip ${alertState.variant}`} />

        <button
          type="button"
          className="labsetu-alert-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="labsetu-alert-body">
          <div className={`labsetu-alert-icon-badge ${alertState.variant}`}>
            {renderIcon()}
          </div>

          <h3 id="labsetu-alert-title" className="labsetu-alert-title">
            {alertState.title}
          </h3>

          <p className="labsetu-alert-message">{alertState.message}</p>

          {alertState.detail && (
            <div className="labsetu-alert-detail">{alertState.detail}</div>
          )}
        </div>

        <div className="labsetu-alert-footer">
          {isConfirm && (
            <button type="button" className="btn-secondary" onClick={onClose}>
              {alertState.cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            type="button"
            className={
              alertState.variant === 'error'
                ? 'labsetu-alert-btn-danger'
                : 'btn-primary'
            }
            onClick={() => {
              const confirmCb = alertState.onConfirm;
              onClose();
              if (confirmCb) confirmCb();
            }}
          >
            {alertState.confirmLabel || (isConfirm ? 'Confirm' : 'Got It')}
          </button>
        </div>
      </div>
    </div>
  );
}

