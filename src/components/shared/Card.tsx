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
      className={`rounded-xl bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm ${onClick ? 'cursor-pointer hover:border-cyan-600/50 hover:bg-slate-800/80 transition-all' : ''} ${className}`}
      onClick={onClick}
    >
      {header && <div className="px-3 py-3 sm:px-5 border-b border-slate-700/50">{header}</div>}
      <div className="p-3 sm:p-5">{children}</div>
      {footer && <div className="px-3 py-3 sm:px-5 border-t border-slate-700/50">{footer}</div>}
    </div>
  );
}
