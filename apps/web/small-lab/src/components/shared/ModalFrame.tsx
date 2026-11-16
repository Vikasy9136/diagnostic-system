import { type CSSProperties, type ReactNode, useEffect } from 'react';

export interface ModalFrameProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  maxWidth?: string;
  bodyStyle?: CSSProperties;
  disableClose?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function ModalFrame({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = '560px',
  bodyStyle,
  disableClose = false,
  children,
  footer,
}: ModalFrameProps) {
  useEffect(() => {
    if (!open || disableClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, disableClose, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!disableClose) onClose();
      }}
    >
      <div
        className="modal-card"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            {subtitle && <div style={{ marginTop: '4px' }}>{subtitle}</div>}
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={disableClose}
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        <div
          className="modal-body"
          style={{
            maxHeight: '76vh',
            overflowY: 'auto',
            ...bodyStyle,
          }}
        >
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
