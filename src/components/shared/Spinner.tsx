export default function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }[size];
  return (
    <div
      className={`${s} border-2 rounded-full animate-spin`}
      style={{ borderColor: 'var(--color-neutral-300)', borderTopColor: 'var(--color-accent)' }}
    />
  );
}
