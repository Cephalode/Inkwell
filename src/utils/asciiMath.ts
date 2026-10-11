/**
 * ASCII pseudo-math → clean Unicode for display surfaces.
 *
 * The flow-lesson/quiz generators used to emit math like "mu_k", "x_i",
 * "||x_i − mu_k||²", "C_{k*}", "J^(t+1)" with no notation guidance, so every
 * surface (web Markdown, iOS Text, SVG <text> labels) showed raw ASCII
 * spell-outs. Web's Markdown.tsx runs remark-math with
 * singleDollarTextMath: false (currency fix), so LaTeX is NOT an option —
 * the only notation that renders identically on web, iOS, and inside SVG
 * text is Unicode math (μₖ, xᵢ, ‖xᵢ − μₖ‖², ᵗ⁺¹, ≤, Σ).
 *
 * normalizeMathText() converts the common ASCII patterns to that Unicode
 * form. It is applied server-side at generation time AND as a one-off
 * backfill over existing flow activity rows, so old and new content match.
 * It is deliberately conservative: anything it cannot map confidently is
 * left untouched (no corruption over prose, hyphenated words, or code).
 */

// Greek spell-outs → Unicode letters (case-sensitive, word-bounded).
const GREEK_LOWER: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω',
};
const GREEK_UPPER: Record<string, string> = Object.fromEntries(
  Object.entries(GREEK_LOWER).map(([name, ch]) => [
    name.charAt(0).toUpperCase() + name.slice(1),
    ch.toUpperCase(),
  ]),
);

const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍',
  ')': '₎', ',': ',', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ',
  l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ',
  v: 'ᵥ', x: 'ₓ',
};
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽',
  ')': '⁾', n: 'ⁿ', i: 'ⁱ', t: 'ᵗ', T: 'ᵀ',
};

/** Map every char of `run` through `map`; null when any char is unmappable
 *  (the caller then leaves the run untouched instead of corrupting it). */
function mapRun(run: string, map: Record<string, string>): string | null {
  let out = '';
  for (const ch of run) {
    const mapped = map[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

/** Per-char map with passthrough: unmappable chars are kept as-is. Only for
 *  EXPLICITLY braced runs (`C_{k*}` → `ₖ*`) — the braces mark it as math, so
 *  a stray `*` or space must survive rather than block the whole conversion. */
function mapRunKeep(run: string, map: Record<string, string>): string {
  let out = '';
  for (const ch of run) out += map[ch] ?? ch;
  return out;
}

/** Subscripts: C_{k*} → Cₖ* , x_i → xᵢ , argmin_k → argminₖ.
 *  Braced form keeps unmappable chars (explicit math); bare form is all-or-
 *  nothing, capped at a 1–3 char alnum run so prose underscores never travel. */
function convertSubscripts(s: string): string {
  s = s.replace(/_\{([^{}\n]+)\}/g, (_m, run: string) => mapRunKeep(run, SUBSCRIPT));
  s = s.replace(/_([A-Za-z0-9]{1,3})(?![A-Za-z0-9])/g, (m, run: string) => mapRun(run, SUBSCRIPT) ?? m);
  return s;
}

/** Superscripts: J^(t+1) → Jᵗ⁺¹ , C_k^t → Cₖᵗ , 2^n → 2ⁿ.
 *  Braced and parenthesized forms are all-or-nothing (a prose "(see note)"
 *  must never become gibberish); bare is all-or-nothing too. */
function convertSuperscripts(s: string): string {
  s = s.replace(/\^\{([^{}\n]+)\}/g, (m, run: string) => mapRun(run, SUPERSCRIPT) ?? m);
  s = s.replace(/\^\(([^()\n]{1,12})\)/g, (m, run: string) => mapRun(run, SUPERSCRIPT) ?? m);
  s = s.replace(/\^([A-Za-z0-9]{1,3})(?![A-Za-z0-9])/g, (m, run: string) => mapRun(run, SUPERSCRIPT) ?? m);
  return s;
}

/** Norm bars: ||x_i − mu_k||² → ‖xᵢ − μₖ‖². Only when the inner run looks
 *  like math (has a letter/digit, no code punctuation) — `a || b` cannot
 *  match anyway (inner excludes `|`), and `f(x); return` style fragments are
 *  rejected by the punctuation guard. */
function convertNorms(s: string): string {
  return s.replace(/\|\|([^|\n]{1,80}?)\|\|/g, (m, inner: string) => {
    if (!/[A-Za-z0-9]/.test(inner)) return m;
    if (/[;=`"'{}]|\/\//.test(inner)) return m;
    return `‖${inner}‖`;
  });
}

/** Greek spell-outs: mu_k → μ_k , Sigma → Σ. Letters-only boundaries — `\b`
 *  fails here because `_` counts as a word char (`mu_k` would never match). */
function convertGreek(s: string): string {
  for (const [name, ch] of Object.entries(GREEK_LOWER)) {
    s = s.replace(new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`, 'g'), ch);
  }
  for (const [name, ch] of Object.entries(GREEK_UPPER)) {
    s = s.replace(new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`, 'g'), ch);
  }
  return s;
}

/** Spaced operators: a - b → a − b , a >= b → a ≥ b , a -> b → a → b.
 *  Only near-unspaced/spaced binary forms are converted, so hyphenated
 *  compounds ("state-of-the-art") and unspaced ranges (10-12) are never
 *  touched. The char before the hyphen may be `_` (identifiers like x_i) and
 *  the space before it optional (diagram labels write `x_i- mu_k`). Must run
 *  BEFORE sub/superscripts: ᵢ/ₖ are not in [A-Za-z0-9], so a ` - ` next to
 *  an already-converted subscript would no longer match. */
function convertOperators(s: string): string {
  return s
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/!=/g, '≠')
    .replace(/~=/g, '≈')
    .replace(/([A-Za-z0-9)\]_]) ?- (?=[A-Za-z0-9(\[\u0370-\u03ff])/g, '$1 − ')
    .replace(/([A-Za-z0-9)\]_]) ?-> (?=[A-Za-z0-9(\[\u0370-\u03ff])/g, '$1 → ');
}

/** Full prose normalization. Order matters: greek first (so `mu_k` becomes
 *  `μ_k`), then operators (plain letters still around the ` - `), then
 *  sub/superscripts, then norm bars. */
export function normalizeMathText(s: string): string {
  if (!s) return s;
  // `*` as multiplication (a * b → a · b) only when the text carries no
  // markdown bold — `**` pairs would corrupt.
  const mult = s.includes('**') ? s : s.replace(/([A-Za-z0-9)\]]) \* (?=[A-Za-z0-9(\[])/g, '$1 · ');
  return convertNorms(convertSuperscripts(convertSubscripts(convertOperators(convertGreek(mult)))));
}

/** Normalize just the text inside <text>…</text> (and <tspan>) nodes of a
 *  teaching SVG. Attributes (x/y/font-size/fill) are never touched. */
export function normalizeSvgMath(svg: string): string {
  return svg
    .replace(/(<tspan[^>]*>)([^<]*)(<\/tspan>)/g, (_m, open: string, txt: string, close: string) => open + normalizeMathText(txt) + close)
    .replace(/(<text[^>]*>)([^<]*)(<\/text>)/g, (_m, open: string, txt: string, close: string) => open + normalizeMathText(txt) + close);
}
