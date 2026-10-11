import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  color?: 'cyan' | 'teal' | 'green' | 'yellow' | 'red' | 'gray' | 'purple';
  className?: string;
}

// Broadsheet: badges read as small uppercase labels tinted from the token
// palette, not saturated pills.
const colors: Record<NonNullable<BadgeProps['color']>, React.CSSProperties> = {
  cyan: {
    color: 'var(--color-accent-700)',
    background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-accent) 35%, transparent)',
  },
  teal: {
    color: 'var(--color-accent-600)',
    background: 'color-mix(in srgb, var(--color-accent-500) 12%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-accent-500) 35%, transparent)',
  },
  green: {
    color: 'var(--color-success)',
    background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-success) 35%, transparent)',
  },
  yellow: {
    color: 'var(--color-warning)',
    background: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)',
  },
  red: {
    color: 'var(--color-danger)',
    background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-danger) 35%, transparent)',
  },
  gray: {
    color: 'var(--color-neutral-700)',
    background: 'color-mix(in srgb, var(--color-neutral-500) 15%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-neutral-500) 40%, transparent)',
  },
  purple: {
    color: 'var(--color-accent-2-700)',
    background: 'color-mix(in srgb, var(--color-accent-2-700) 12%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-accent-2-700) 35%, transparent)',
  },
};

export default function Badge({ children, color = 'cyan', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${className}`}
      style={{ borderRadius: 'var(--radius-sm)', ...colors[color] }}
    >
      {children}
    </span>
  );
}
