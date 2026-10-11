/**
 * Deterministic geometry check for model-written teaching SVGs.
 *
 * The vision self-review (visionProblems) is probabilistic, shares a tight
 * deadline, and sometimes blesses diagrams whose labels sit on top of lines,
 * points, or each other. This module computes EXACT bounding boxes — text via
 * approximate font metrics, shapes from their geometry — and reports every
 * contact. The findings feed the same review→repair loop as visual problems,
 * with concrete coordinates so the repairer can act instead of guessing.
 *
 * ponytail: bbox-level check only — no collision meshes, no path sampling.
 * A curve's bbox spans its extremes, so a label far from the curve's middle
 * can false-positive against it; the repair move that fixes that is cheap and
 * never wrong. Never throws: parse trouble returns [] (a diagram ships
 * un-reviewed rather than blocked on infrastructure).
 */

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Item {
  box: Box;
  kind: 'text' | 'shape';
  desc: string;
  /** Container-type shapes a label may legitimately sit inside. */
  container: boolean;
}

/** Approximate Arial advance widths (fraction of font-size) per char class. */
function charWidth(ch: string): number {
  if ('iljtf.,;:\'!|()[]- '.includes(ch)) return 0.3;
  if ('mwMW@'.includes(ch)) return 0.89;
  if (ch >= 'A' && ch <= 'Z') return 0.68;
  return 0.55;
}

function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch);
  return w * fontSize;
}

function num(el: string, attr: string): number | undefined {
  const m = el.match(new RegExp(`${attr}\\s*=\\s*"(-?[\\d.]+)(?:px)?"`));
  return m ? parseFloat(m[1]) : undefined;
}

/** font-size from attribute or inline style; undefined when neither. */
function fontSizeOf(el: string): number | undefined {
  const attr = num(el, 'font-size');
  if (attr !== undefined) return attr;
  const style = el.match(/font-size\s*:\s*(-?[\d.]+)(?:px)?/);
  return style ? parseFloat(style[1]) : undefined;
}

function unescapeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

/** All numbers of a `points` attribute as [x,y] pairs. */
function pointsBox(points: string, off: { dx: number; dy: number }): Box | undefined {
  const nums = (points.match(/-?[\d.]+/g) ?? []).map(parseFloat);
  if (nums.length < 4) return undefined;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    xs.push(nums[i] + off.dx);
    ys.push(nums[i + 1] + off.dy);
  }
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** Path `d` bbox: per-command coordinate extraction (arcs contribute only
 * their endpoint, not radii — avoids wild over-approximation). */
function pathBox(d: string, off: { dx: number; dy: number }): Box | undefined {
  const segments = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);
  if (!segments) return undefined;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const seg of segments) {
    const cmd = seg[0];
    const nums = (seg.slice(1).match(/-?[\d.]+/g) ?? []).map(parseFloat);
    if (cmd === 'Z' || cmd === 'z') continue;
    if (cmd === 'H' || cmd === 'h') nums.forEach((n) => xs.push(n + (cmd === 'H' ? off.dx : 0)));
    else if (cmd === 'V' || cmd === 'v') nums.forEach((n) => ys.push(n + (cmd === 'V' ? off.dy : 0)));
    else if (cmd === 'A' || cmd === 'a') {
      // params: rx ry rot large sweep x y — only the endpoint is a coordinate
      for (let i = 5; i + 1 < nums.length; i += 7) {
        xs.push(nums[i] + (cmd === 'A' ? off.dx : 0));
        ys.push(nums[i + 1] + (cmd === 'A' ? off.dy : 0));
      }
    } else {
      // M L C S Q T: alternating x,y
      for (let i = 0; i + 1 < nums.length; i += 2) {
        xs.push(nums[i] + (cmd === cmd.toUpperCase() ? off.dx : 0));
        ys.push(nums[i + 1] + (cmd === cmd.toUpperCase() ? off.dy : 0));
      }
    }
  }
  if (xs.length === 0 || ys.length === 0) return undefined;
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

function intersects(a: Box, b: Box): boolean {
  return Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 0.5 && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 0.5;
}

function containedIn(small: Box, big: Box, margin: number): boolean {
  return small.x1 >= big.x1 + margin && small.x2 <= big.x2 - margin && small.y1 >= big.y1 + margin && small.y2 <= big.y2 - margin;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function boxStr(b: Box): string {
  return `x ${round1(b.x1)}-${round1(b.x2)}, y ${round1(b.y1)}-${round1(b.y2)}`;
}

/**
 * Returns one human-readable fix instruction per geometric contact, or []
 * when the SVG is clean (or could not be parsed). Coordinates are in viewBox
 * units — the same space the repairer writes.
 */
export function svgOverlapProblems(svg: string): string[] {
  try {
    const vb = svg.match(/viewBox\s*=\s*"[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
    const W = vb ? parseFloat(vb[1]) : 800;
    const H = vb ? parseFloat(vb[2]) : 400;

    const items: Item[] = [];
    // Track <g transform="translate(dx[, ]dy)"> nesting so grouped elements
    // land at their real positions. Any rotate/scale in the chain → give up.
    const tagRe = /<g[^>]*>|<\/g>|<text[^>]*>[\s\S]*?<\/text>|<(rect|circle|ellipse|line|polygon|polyline|path)\b[^>]*\/?>/g;
    const groupStack: Array<{ dx: number; dy: number }> = [];
    const offset = () => groupStack.reduce((acc, g) => ({ dx: acc.dx + g.dx, dy: acc.dy + g.dy }), { dx: 0, dy: 0 });

    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(svg)) !== null) {
      const tag = m[0];
      if (tag.startsWith('<g')) {
        const tf = tag.match(/transform\s*=\s*"([^"]*)"/)?.[1] ?? '';
        if (/rotate|scale|matrix/.test(tf)) return [];
        const t = tf.match(/translate\s*\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/);
        groupStack.push(t ? { dx: parseFloat(t[1]), dy: parseFloat(t[2]) } : { dx: 0, dy: 0 });
      } else if (tag.startsWith('</g>')) {
        groupStack.pop();
      } else if (tag.startsWith('<text')) {
        const off = offset();
        // tspans with their own x/y would need per-run boxes — bail rather
        // than misreport (model output rarely uses them).
        if (/<tspan[^>]*\bx\s*=/.test(tag)) return [];
        const content = unescapeEntities(
          tag
            .replace(/^<text[^>]*>/, '')
            .replace(/<\/text>$/, '')
            .replace(/<[^>]+>/g, '')
            .trim(),
        );
        if (!content) continue;
        let x = num(tag, 'x');
        const y = num(tag, 'y');
        if (x === undefined || y === undefined) continue;
        const fontSize = fontSizeOf(tag) ?? 20;
        const anchor = tag.match(/text-anchor\s*=\s*"(start|middle|end)"/)?.[1] ?? 'start';
        x += off.dx;
        const baseline = y + off.dy;
        const w = textWidth(content, fontSize);
        const x1 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
        // central/dominant-baseline shifts the box; handle the common ones
        const central = /dominant-baseline\s*=\s*"(central|middle)|alignment-baseline\s*=\s*"(central|middle)/.test(tag);
        const halfH = fontSize * (central ? 0.55 : 0.72);
        items.push({
          kind: 'text',
          desc: `text "${content.length > 40 ? `${content.slice(0, 37)}…` : content}"`,
          container: false,
          box: { x1, y1: baseline - halfH, x2: x1 + w, y2: baseline + fontSize * 0.21 },
        });
      } else {
        const off = offset();
        const kind = m[1] as 'rect' | 'circle' | 'ellipse' | 'line' | 'polygon' | 'polyline' | 'path';
        let box: Box | undefined;
        if (kind === 'rect') {
          const x = num(tag, 'x') ?? 0;
          const y = num(tag, 'y') ?? 0;
          const w = num(tag, 'width');
          const h = num(tag, 'height');
          if (w === undefined || h === undefined) continue;
          box = { x1: x + off.dx, y1: y + off.dy, x2: x + off.dx + w, y2: y + off.dy + h };
        } else if (kind === 'circle') {
          const cx = num(tag, 'cx');
          const cy = num(tag, 'cy');
          const r = num(tag, 'r');
          if (cx === undefined || cy === undefined || r === undefined) continue;
          box = { x1: cx - r + off.dx, y1: cy - r + off.dy, x2: cx + r + off.dx, y2: cy + r + off.dy };
        } else if (kind === 'ellipse') {
          const cx = num(tag, 'cx');
          const cy = num(tag, 'cy');
          const rx = num(tag, 'rx');
          const ry = num(tag, 'ry');
          if (cx === undefined || cy === undefined || rx === undefined || ry === undefined) continue;
          box = { x1: cx - rx + off.dx, y1: cy - ry + off.dy, x2: cx + rx + off.dx, y2: cy + ry + off.dy };
        } else if (kind === 'line') {
          const a = num(tag, 'x1');
          const b = num(tag, 'y1');
          const c = num(tag, 'x2');
          const d = num(tag, 'y2');
          if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
          box = {
            x1: Math.min(a, c) + off.dx,
            y1: Math.min(b, d) + off.dy,
            x2: Math.max(a, c) + off.dx,
            y2: Math.max(b, d) + off.dy,
          };
        } else if (kind === 'polygon' || kind === 'polyline') {
          box = pointsBox(tag.match(/points\s*=\s*"([^"]*)"/)?.[1] ?? '', off);
        } else {
          box = pathBox(tag.match(/\bd\s*=\s*"([^"]*)"/)?.[1] ?? '', off);
        }
        if (!box) continue;
        const isBg = box.x1 <= 5 && box.y1 <= 5 && box.x2 >= W - 5 && box.y2 >= H - 5;
        if (isBg) continue; // the canvas background rect touches everything
        // Pad by the stroke: a zero-height line bbox (horizontal line) would
        // otherwise never "intersect" anything under the >0 contact rule.
        const PAD = 2.5;
        box = { x1: box.x1 - PAD, y1: box.y1 - PAD, x2: box.x2 + PAD, y2: box.y2 + PAD };
        items.push({ kind: 'shape', desc: `${kind} (bbox ${boxStr(box)})`, container: kind === 'rect' || kind === 'ellipse', box });
      }
    }

    const problems: string[] = [];
    const texts = items.filter((i) => i.kind === 'text');
    const shapes = items.filter((i) => i.kind === 'shape');

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const over = (b: Box) => Math.min(t.box.x2, b.x2) - Math.max(t.box.x1, b.x1);
      const overY = (b: Box) => Math.min(t.box.y2, b.y2) - Math.max(t.box.y1, b.y1);
      for (let j = 0; j < texts.length; j++) {
        if (j <= i) continue;
        const o = texts[j];
        if (intersects(t.box, o.box)) {
          problems.push(
            `Text labels overlap each other: ${t.desc} (bbox ${boxStr(t.box)}) and ${o.desc} (bbox ${boxStr(o.box)}) share ${round1(over(o.box))}x${round1(overY(o.box))} units — separate them vertically by at least ${round1(Math.max(t.box.y2 - t.box.y1, o.box.y2 - o.box.y1))} units or move one sideways clear of the other.`,
          );
        }
      }
      for (const s of shapes) {
        if (!intersects(t.box, s.box)) continue;
        if (s.container && containedIn(t.box, s.box, 3)) continue; // label inside its box — fine
        problems.push(
          `Text overlaps a shape: ${t.desc} (bbox ${boxStr(t.box)}) intersects ${s.desc} by ${round1(over(s.box))}x${round1(overY(s.box))} units — move the text so its whole box clears ${s.desc.split(' ')[0]} by at least 6 units (any direction with space).`,
        );
      }
    }
    return problems.slice(0, 8);
  } catch {
    return [];
  }
}
