import React from 'react';
import Button from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4 opacity-50">{icon}</div>
      <h3 className="mb-2" style={{ fontSize: 18 }}>{title}</h3>
      <p className="max-w-sm mb-6" style={{ fontSize: 14, opacity: 0.6 }}>{description}</p>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
