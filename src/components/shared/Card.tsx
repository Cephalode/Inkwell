import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
}

export default function Card({ children, className = '', header, footer, onClick }: CardProps) {
  return (
    <div
      className={`card ${onClick ? 'cursor-pointer transition-colors hover:border-[var(--color-accent)]' : ''} ${className}`}
      onClick={onClick}
    >
      {header && (
        <div className="px-3 py-3 sm:px-5" style={{ borderBottom: '1px solid var(--color-divider)' }}>
          {header}
        </div>
      )}
      <div className="p-3 sm:p-5">{children}</div>
      {footer && (
        <div className="px-3 py-3 sm:px-5" style={{ borderTop: '1px solid var(--color-divider)' }}>
          {footer}
        </div>
      )}
    </div>
  );
}
