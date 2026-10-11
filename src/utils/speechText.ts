// Speakable-text pipeline for lesson read-aloud. Parses the markdown SOURCE:
// formatting markers never reach the ear, code is skipped, math is spoken.
// What buildSpeakable returns is exactly what the voice reads.
// NOTE: this file contains NO literal backslashes — every LaTeX backslash is
// built via B (String.fromCharCode(92)) so tool/escape layers can't corrupt it.

const B = String.fromCharCode(92); // one backslash
const BB = B + B; // pattern source for ONE literal backslash inside new RegExp

const GREEK: Record<string, string> = {
  alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon',
  zeta: 'zeta', eta: 'eta', theta: 'theta', iota: 'iota', kappa: 'kappa',
  lambda: 'lambda', mu: 'mu', nu: 'nu', xi: 'xi', pi: 'pi', rho: 'rho',
  sigma: 'sigma', tau: 'tau', upsilon: 'upsilon', phi: 'phi', varphi: 'phi',
  chi: 'chi', psi: 'psi', omega: 'omega',
  Gamma: 'capital Gamma', Delta: 'capital Delta', Theta: 'capital Theta',
  Lambda: 'capital Lambda', Sigma: 'capital Sigma', Phi: 'capital Phi',
  Psi: 'capital Psi', Omega: 'capital Omega',
};
const SYMBOLS: Record<string, string> = {
  times: 'times', cdot: 'times', div: 'divided by', pm: 'plus or minus',
  mp: 'minus or plus',
  leq: 'is less than or equal to', le: 'is less than or equal to',
  geq: 'is greater than or equal to', ge: 'is greater than or equal to',
  neq: 'is not equal to', ne: 'is not equal to', approx: 'is approximately',
  sim: 'is similar to', propto: 'is proportional to', infty: 'infinity',
  partial: 'partial', nabla: 'nabla', in: 'in', notin: 'not in',
  subset: 'is a subset of', subseteq: 'is a subset of or equal to',
  cup: 'union', cap: 'intersection', to: 'to', rightarrow: 'to',
  implies: 'implies', iff: 'if and only if', equiv: 'is equivalent to',
  ldots: 'dot dot dot', cdots: 'dot dot dot', dots: 'dot dot dot',
  prime: 'prime', circ: 'composed with', bullet: 'dot', star: 'star',
  angle: 'angle', perp: 'perpendicular to', mapsto: 'maps to',
  setminus: 'without', oplus: 'xor', otimes: 'tensor product',
};
const FUNCS: Record<string, string> = {
  sin: 'sine', cos: 'cosine', tan: 'tangent', log: 'log', ln: 'natural log',
  exp: 'exponential', min: 'minimum', max: 'maximum', det: 'determinant',
  gcd: 'g c d', deg: 'degrees', sup: 'supremum', inf: 'infimum',
};

/** LaTeX → speakable words. ponytail: rule-based, covers what lessons contain
 * (fracs, roots, powers, subs, greek, big ops, integrals, limits, common
 * symbols); unknown commands degrade to their name. Upgrade path: temml →
 * MathML → a real spoken-math renderer. */
export function latexToWords(src: string): string {
  let s = src;
  // Spacing/size/enclosing commands: pure formatting.
  s = s.replace(new RegExp(BB + '(?:left|right|big|Big|bigg|Bigg|,|;|:|!|quad|qquad|displaystyle|textstyle|limits)(?![A-Za-z])', 'g'), ' ');
  // One pass for bounds on big ops / integrals / lim: braced, unbraced, both,
  // or neither. " + B + 'to' inside lim lower bound reads as "approaches".
  const ops = 'sum|prod|coprod|int|iint|iiint|oint|lim';
  const TOK = '(?:' + BB + '[A-Za-z]+|-?[0-9]+|[A-Za-z])';
  const GRP = '(?:' + '{' + '([^{}]*)' + '}' + '|(' + TOK + '))';
  const BOUNDS = new RegExp(
    BB + '(' + ops + ')(?![A-Za-z])' +
      '(?:_\\s*' + GRP + ')?' +
      '(?:\\^\\s*' + GRP + ')?',
    'g',
  );
  s = s.replace(BOUNDS, (_m, op, loB, loT, hiB, hiT) => {
    const lo = loB ?? loT;
    const hi = hiB ?? hiT;
    if (op === 'lim') {
      const v = (lo ?? '').split(B + 'to').join(' approaches ');
      return ` ( limit as ${v} of ) `;
    }
    const name =
      op === 'oint' ? 'closed integral'
      : op === 'coprod' ? 'co product'
      : op.startsWith('int') ? 'integral'
      : op === 'prod' ? 'product'
      : op === 'sum' ? 'sum'
      : op;
    if (lo && hi) return ` ( ${name} from ${lo} to ${hi} of ) `;
    if (lo) return ` ( ${name} from ${lo} of ) `;
    if (hi) return ` ( ${name} up to ${hi} of ) `;
    return ` ( ${name} of ) `;
  });
  // \frac{a}{b} → "a over b" (loop nests nested fracs).
  const FRAC = new RegExp(BB + '[dt]?frac' + '\\s*\\{([^{}]*)\\}\\s*\\{([^{}]*)\\}', 'g');
  for (let i = 0; i < 5; i++) {
    s = s.replace(FRAC, (_m, a, b) => ` ( ${a} over ${b} ) `);
  }
  // \sqrt[n]{x} → "nth root of x", \sqrt{x} → "square root of x"
  s = s.replace(new RegExp(BB + 'sqrt\\s*\\[([^\\]]*)\\]\\s*\\{([^{}]*)\\}', 'g'),
    (_m, n, x) => ` ( ${n} th root of ${x} ) `);
  s = s.replace(new RegExp(BB + 'sqrt\\s*\\{([^{}]*)\\}', 'g'),
    (_m, x) => ` ( square root of ${x} ) `);
  // \text{...} / \mathrm{...} etc: keep the words.
  s = s.replace(new RegExp(BB + '(?:text|mathrm|mathbf|mathit|mathcal|textbf|textit|operatorname)\\s*\\{([^{}]*)\\}', 'g'), ' $1 ');
  // Superscripts: ^2 squared, ^3 cubed, ^{n} "to the n".
  s = s.replace(/\^\s*\{([^{}]*)\}/g, (_m, e) => ` ( to the ${e} ) `);
  s = s.replace(/\^\s*(-?\d+)/g, (_m, d) => (d === '2' ? ' squared ' : d === '3' ? ' cubed ' : ` ( to the ${d} ) `));
  s = s.replace(/\^\s*([A-Za-z])(?![A-Za-z])/g, (_m, l) => ` ( to the ${l} ) `);
  // Subscripts: _i → "sub i".
  s = s.replace(/_\s*\{([^{}]*)\}/g, (_m, e) => ` ( sub ${e} ) `);
  s = s.replace(/_\s*([A-Za-z0-9])(?![A-Za-z0-9])/g, (_m, l) => ` ( sub ${l} ) `);
  // Known symbols → words; unknown \commands → their name.
  s = s.replace(new RegExp(BB + '([A-Za-z]+)', 'g'), (_m, name: string) => {
    if (GREEK[name]) return ` ${GREEK[name]} `;
    if (SYMBOLS[name]) return ` ${SYMBOLS[name]} `;
    if (FUNCS[name]) return ` ${FUNCS[name]} `;
    return ` ${name} `;
  });
  // Braces become pauses.
  s = s.replace(/[{}]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Markdown source → speakable text. Code (blocks + inline) is dropped, images
 * become alt text, links keep the label, table/heading/quote/list/emphasis
 * markers are stripped, math ($$…$$, $…$, \(…\), \[…\]) is spoken via
 * latexToWords. */
export function buildSpeakable(md: string): string {
  let s = md;
  // Fenced code blocks: skipped entirely (reading code aloud is noise).
  s = s.replace(new RegExp('```[\\s\\S]*?```', 'g'), ' ');
  s = s.replace(new RegExp('~~~[\\s\\S]*?~~~', 'g'), ' ');
  // Display math first, then inline math.
  s = s.replace(new RegExp('\\$\\$([\\s\\S]+?)\\$\\$', 'g'), (_m, tex: string) => ` ${latexToWords(tex)}. `);
  s = s.replace(new RegExp(BB + '\\[([\\s\\S]+?)' + BB + '\\]', 'g'), (_m, tex: string) => ` ${latexToWords(tex)}. `);
  s = s.replace(new RegExp('\\$([^$\\n]+?)\\$', 'g'), (_m, tex: string) => ` ${latexToWords(tex)} `);
  s = s.replace(new RegExp(BB + '\\(([\\s\\S]+?)' + BB + '\\)', 'g'), (_m, tex: string) => ` ${latexToWords(tex)} `);
  // Images → alt text; links → label only.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Tables: drop divider rows, pipes become commas.
  s = s.replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, '');
  s = s.replace(/^\s*\|(.*)\|\s*$/gm, (_m, row: string) => row.replace(/\|/g, ','));
  // Headings, quotes, list bullets, emphasis, inline-code markers: formatting.
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/^\s*>\s?/gm, '');
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(\*|_)(.*?)\1/g, '$2');
  s = s.replace(/`([^`]*)`/g, '$1');
  // HTML comments / stray tags that survive markdown.
  s = s.replace(new RegExp('<!--[\\s\\S]*?-->', 'g'), '');
  return s.replace(/\n{2,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
}

/** Split into chunks ≤ max chars at paragraph, then sentence, boundaries. */
export function chunkSpeechText(text: string, max = 4000): string[] {
  const out: string[] = [];
  let cur = '';
  const push = (p: string) => {
    if (!p) return;
    if (!cur) cur = p;
    else if (cur.length + 2 + p.length <= max) cur += '\n\n' + p;
    else {
      out.push(cur);
      cur = p;
    }
  };
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= max) {
      push(para);
      continue;
    }
    // Oversize paragraph: fall back to sentence boundaries.
    for (const s of para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [para]) {
      if (s.length > max) {
        // ponytail: single monster "sentence" — hard split.
        for (let i = 0; i < s.length; i += max) push(s.slice(i, i + max));
      } else push(s.trim());
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Self-check: npx tsx src/utils/speechText.ts
if (typeof process !== 'undefined' && process.argv[1]?.includes('speechText')) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`FAIL: ${msg}`);
    console.log(`ok: ${msg}`);
  };
  assert(latexToWords(B + 'frac{a}{b}').includes('a over b'), 'frac → over');
  assert(latexToWords('x^2 + y^2 = r^2').includes('squared'), 'power of 2 → squared');
  assert(latexToWords(B + 'sqrt{x+1}').includes('square root of x'), 'sqrt spoken');
  assert(latexToWords(B + 'sqrt[3]{8}').includes('3 th root of 8'), 'cube root spoken');
  assert(latexToWords(B + 'alpha ' + B + 'times ' + B + 'beta').includes('alpha'), 'greek kept');
  assert(latexToWords(B + 'sum_{i=1}^{n} x_i').includes('sum from i=1 to n'), 'sum bounds spoken');
  const integ = latexToWords(B + 'int_0^' + B + 'infty e^{-x} dx');
  assert(integ.includes('integral from 0 to infinity'), 'unbraced integral bounds');
  assert(!integ.includes('^') && !integ.includes('_'), 'no stray sup/sub markers');
  assert(!latexToWords(B + 'frac{1}{2}').includes(B), 'no backslashes survive');
  const lim = latexToWords(B + 'lim_{x ' + B + 'to a} f(x)');
  assert(lim.includes('limit as x approaches a'), 'limit spoken');
  const md = [
    '# Title',
    '',
    'Plain **bold** and `code literal` and a [link](https://x.com).',
    '',
    '```js',
    'const hidden = true;',
    '```',
    '',
    'Inline math $E = mc^2$ and display:',
    '',
    '$$' + B + 'int_0^' + B + 'infty e^{-x} dx = 1$$',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
  ].join('\n');
  const sp = buildSpeakable(md);
  assert(!sp.includes('```'), 'code fence dropped');
  assert(!sp.includes('hidden'), 'code body dropped');
  assert(!sp.includes('**'), 'bold markers dropped');
  assert(!sp.includes('`'), 'inline code markers dropped');
  assert(!sp.includes(']('), 'link syntax dropped');
  assert(sp.includes('Title'), 'heading text kept');
  assert(sp.includes('squared'), 'inline math spoken');
  assert(sp.includes('integral from 0 to infinity'), 'display math spoken');
  assert(!sp.includes('$'), 'no dollar signs survive');
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ${'word '.repeat(60)}`).join('\n\n');
  const chunks = chunkSpeechText(long, 4000);
  assert(chunks.length > 1, `long text splits (${chunks.length} chunks)`);
  assert(chunks.every((c) => c.length <= 4000), 'chunks respect the cap');
  assert(chunkSpeechText('x'.repeat(9000), 4000).every((c) => c.length <= 4000), 'monster sentence hard-splits');
  console.log('all speechText checks passed');
}
