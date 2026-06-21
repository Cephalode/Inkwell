import {
  useCallback,
  useEffect,
  useLayoutEffect,
  type RefObject,
} from 'react';

export interface UseAutoResizeOptions {
  /** Minimum height in px. The textarea won't shrink below this. Default: 0. */
  minHeight?: number;
  /** Explicit maximum height in px. Takes precedence over `maxViewportFraction`. */
  maxHeight?: number;
  /**
   * Fraction of the viewport (`window.innerHeight`) the textarea may grow to,
   * used when no explicit `maxHeight` is provided. Default: 0.6 (≈60vh).
   *
   * This keeps the textarea from outgrowing the available space on the page on
   * both desktop and mobile.
   */
  maxViewportFraction?: number;
  /** Recompute height on window resize / orientation change. Default: true. */
  listenToResize?: boolean;
}

/** Resolve the effective max height (px) from an explicit cap or the viewport. */
function computeMaxHeight(maxHeight?: number, maxViewportFraction = 0.6): number {
  if (typeof maxHeight === 'number' && maxHeight > 0) return maxHeight;
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;
  return Math.max(120, Math.round(window.innerHeight * maxViewportFraction));
}

/**
 * Auto-resize a textarea to fit its content.
 *
 * - Grows taller as the user types more, up to a max height constrained by the
 *   available viewport space (`maxViewportFraction`) or an explicit `maxHeight`.
 * - Shrinks back down when content is removed (height is reset to `auto` before
 *   each measurement so `scrollHeight` reflects the true content height).
 * - Re-measures on every `input` event, whenever `value` changes, and on window
 *   resize / orientation change (mobile).
 *
 * Works for both controlled (`value`/`onChange`) and uncontrolled textareas.
 *
 * @param ref   Ref attached to the `<textarea>`.
 * @param value Current value (pass the controlled value so programmatic changes
 *              also resize; pass `''` for uncontrolled usage).
 * @param options Sizing options.
 *
 * @example
 * const ref = useRef<HTMLTextAreaElement>(null);
 * useAutoResize(ref, value);
 * return <textarea ref={ref} value={value} onChange={...} />;
 */
export function useAutoResize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  options: UseAutoResizeOptions = {},
): void {
  const {
    minHeight = 0,
    maxHeight,
    maxViewportFraction = 0.6,
    listenToResize = true,
  } = options;

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Reset first so `scrollHeight` reflects the *actual* content height — this
    // is what lets the textarea shrink when text is deleted.
    el.style.height = 'auto';

    const contentHeight = el.scrollHeight;
    const max = computeMaxHeight(maxHeight, maxViewportFraction);
    const next = Math.max(minHeight, Math.min(contentHeight, max));

    el.style.height = `${next}px`;

    // Only show a scrollbar once the content exceeds the available max height.
    el.style.overflowY = contentHeight > max ? 'auto' : 'hidden';
  }, [ref, minHeight, maxHeight, maxViewportFraction]);

  // Resize synchronously before paint whenever the value changes.
  useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  // Also resize on raw `input` events (covers uncontrolled usage + is the most
  // responsive path even for controlled inputs).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('input', resize);
    return () => el.removeEventListener('input', resize);
  }, [ref, resize]);

  // Recompute on viewport changes (desktop resize + mobile orientation change),
  // since the viewport-constrained max height may shift.
  useEffect(() => {
    if (!listenToResize) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(resize);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [resize, listenToResize]);
}
