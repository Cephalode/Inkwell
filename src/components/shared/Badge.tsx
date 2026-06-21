import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  color?: 'cyan' | 'teal' | 'green' | 'yellow' | 'red' | 'gray' | 'purple';
  className?: string;
}

const colors = {
  cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  teal: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  green: 'bg-green-500/20 text-green-300 border-green-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  red: 'bg-red-500/20 text-red-300 border-red-500/30',
  gray: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

export default function Badge({ children, color = 'cyan', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[color]} ${className}`}>
      {children}
    </span>
  );
}
