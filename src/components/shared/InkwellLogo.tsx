export default function InkwellLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Inkwell bottle */}
      <path
        d="M6 9h12v2c0 1-.8 1.8-1.8 2l-.2 4c-.1 1.5-1.3 2.5-2.8 2.5H10.8c-1.5 0-2.7-1-2.8-2.5l-.2-4C6.8 12.8 6 12 6 11V9z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M6 9h12v2c0 1-.8 1.8-1.8 2l-.2 4c-.1 1.5-1.3 2.5-2.8 2.5H10.8c-1.5 0-2.7-1-2.8-2.5l-.2-4C6.8 12.8 6 12 6 11V9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Bottle rim */}
      <path
        d="M8 9V7.5c0-.3.2-.5.5-.5h7c.3 0 .5.2.5.5V9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Ink surface */}
      <ellipse cx="12" cy="10.5" rx="4.5" ry="1" fill="currentColor" opacity="0.4" />
      {/* Quill pen */}
      <path
        d="M15.5 3.5c.7-.3 1.5.1 1.5.9L16.5 8l-3.5 1.5L15.5 3.5z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M15.5 3.5c.7-.3 1.5.1 1.5.9L16.5 8l-3.5 1.5L15.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Pen shaft */}
      <line x1="16.5" y1="8" x2="18" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      {/* Pen nib tip */}
      <path
        d="M13 9.5l-.5 1.5 1.5-.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
