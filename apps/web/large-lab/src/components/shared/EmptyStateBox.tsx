import { type ReactNode } from 'react';

export interface EmptyStateBoxProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: 'primary' | 'secondary';
  children?: ReactNode;
}

export function EmptyStateBox({
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = 'primary',
  children,
}: EmptyStateBoxProps) {
  return (
    <div className="empty-state-box">
      <h4>{title}</h4>
      <p>{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          className={actionVariant === 'primary' ? 'btn-primary' : 'btn-secondary'}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
      {children}
    </div>
  );
}
