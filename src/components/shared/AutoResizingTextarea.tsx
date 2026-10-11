import { useRef } from 'react';
import { useAutoResize, type UseAutoResizeOptions } from '../../hooks/useAutoResize';

export interface AutoResizingTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    UseAutoResizeOptions {}

const BASE_CLASS = 'input resize-none';

/**
 * A textarea that auto-resizes to fit its content.
 *
 * It grows taller as the user types (up to the available viewport space) and
 * shrinks back down when text is removed. Intended for the agent-creation
 * "system prompt" field and any other free-text form input.
 *
 * Use it like a normal controlled `<textarea>` — pass `value` and `onChange`.
 * Auto-resize behaviour can be tuned via `minHeight`, `maxHeight`, and
 * `maxViewportFraction` props.
 *
 * @example
 * <AutoResizingTextarea
 *   value={systemPrompt}
 *   onChange={(e) => setSystemPrompt(e.target.value)}
 *   placeholder="Describe how the agent should behave…"
 * />
 */
export default function AutoResizingTextarea({
  // auto-resize options (kept out of the DOM)
  minHeight,
  maxHeight,
  maxViewportFraction,
  listenToResize,
  // textarea props
  className = '',
  value,
  ...rest
}: AutoResizingTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const valueStr = typeof value === 'string' ? value : '';
  useAutoResize(ref, valueStr, {
    minHeight,
    maxHeight,
    maxViewportFraction,
    listenToResize,
  });

  return (
    <textarea
      ref={ref}
      className={`${BASE_CLASS} ${className}`}
      value={value}
      rows={1}
      {...rest}
    />
  );
}
