/**
 * Deterministic arrowhead repair for model-written teaching SVGs.
 *
 * GLM draws arrows as a <line> plus a small <polygon> triangle, and
 * routinely: detaches the head from the line end (20-80px gaps), flips it
 * backwards, writes heads far too small to survive the ~0.55x display scale
 * (sub-5px specks — user-visible "arrows not rendered" bug), or omits the
 * head entirely. The vision review only probabilistically catches these.
 *
 * repairArrowheads() rebuilds EVERY arrowhead polygon deterministically from
 * its line's real geometry: tip exactly at the line endpoint, 14px long,
 * 9px wide, pointing along the line. Lines with no adjacent head get one at
 * (x2,y2) (SVG start→end convention). Non-arrowhead polygons (chart shapes)
 * are left untouched. Idempotent.
 */

interface Line { x1: number; y1: number; x2: number; y2: number; raw: string }
interface Poly { pts: Array<[number, number]>; raw: string }

const HEAD_LEN = 14;
const HEAD_W = 9;
/** Max distance polygon-tip → line-end to consider them paired. */
const ATTACH_TOL = 30;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function polyCentroid(pts: Array<[number, number]>): [number, number] {
  const x = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return [x, y];
}

/** Looks like an arrowhead: exactly 3 points (triangle), NON-degenerate
 *  (area > 4px² — GLM sometimes writes zero-area slivers like
 *  "425,170 425,170 425,170"), size in plausible range. 4-point "kite"
 *  shapes are tick marks and 10-point stars are data markers — real model
 *  arrowheads are always simple triangles. */
function isArrowLike(pts: Array<[number, number]>): boolean {
  if (pts.length !== 3) return false;
  const area2 = Math.abs(
    (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) -
    (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]),
  );
  if (area2 < 8) return false; // 2x area of a real head is ≥ ~63
  const [cx, cy] = polyCentroid(pts);
  let maxD = 0;
  for (const p of pts) maxD = Math.max(maxD, dist(p[0], p[1], cx, cy));
  return maxD >= 3 && maxD <= 40;
}

/** Build a head polygon at end (ex, ey), pointing along (dx, dy) (normalized
 *  inside). Tip at the endpoint, base pulled back HEAD_LEN. `fill` comes from
 *  the old head (or the line's stroke) — an unfilled polygon renders black
 *  and vanishes on the dark background. */
function buildHead(ex: number, ey: number, dx: number, dy: number, fill: string): string {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux; // perpendicular
  const bx = ex - ux * HEAD_LEN, by = ey - uy * HEAD_LEN;
  const w = HEAD_W / 2;
  const p1 = `${ex},${ey}`;
  const p2 = `${(bx + nx * w).toFixed(1)},${(by + ny * w).toFixed(1)}`;
  const p3 = `${(bx - nx * w).toFixed(1)},${(by - ny * w).toFixed(1)}`;
  return `<polygon points="${p1} ${p2} ${p3}" fill="${fill}"/>`;
}

/** Extract fill="…" / stroke="…" from an SVG element string. */
function extractAttr(raw: string, name: string): string | undefined {
  const m = raw.match(new RegExp(`${name}=["']([^"']+)["']`));
  return m?.[1];
}

/**
 * Repair all arrowheads in `svg`. Returns { svg, fixed, added } where fixed =
 * rebuilt heads, added = heads created for headless lines.
 */
export function repairArrowheads(svg: string): { svg: string; fixed: number; added: number } {
  const lines: Array<{ m: RegExpMatchArray; l: Line }> = [];
  for (const m of svg.matchAll(/<line\b[^>]*\/>/g)) {
    const attr = (name: string) => {
      const a = m[0].match(new RegExp(`${name}=["']([\\d.-]+)["']`));
      return a ? +a[1] : NaN;
    };
    lines.push({ m, l: { x1: attr('x1'), y1: attr('y1'), x2: attr('x2'), y2: attr('y2'), raw: m[0] } });
  }
  const polys: Array<{ m: RegExpMatchArray; p: Poly }> = [];
  for (const m of svg.matchAll(/<polygon\b[^>]*points=["']([^"']+)["'][^>]*\/>/g)) {
    const pts = m[1].trim().split(/\s+/).map((s) => s.split(',').map(Number) as [number, number]);
    if (pts.every((p) => p.length === 2 && p.every((n) => Number.isFinite(n)))) {
      polys.push({ m, p: { pts, raw: m[0] } });
    }
  }

  const arrowish = polys.filter((x) => isArrowLike(x.p.pts));
  const usedPolys = new Set<Poly>();
  let fixed = 0;
  let added = 0;
  const inserts: Array<{ end: [number, number]; head: string }> = [];

  // Pass 1: pair each arrow-like polygon with its nearest line end; rebuild it.
  const rebuiltPolyRaw = new Map<string, string>();
  for (const poly of arrowish) {
    let best: { line: Line; end: [number, number]; d: number } | null = null;
    for (const { l } of lines) {
      for (const end of [[l.x1, l.y1], [l.x2, l.y2]] as Array<[number, number]>) {
        const tip = poly.p.pts.reduce((bestPt, p) =>
          dist(p[0], p[1], end[0], end[1]) < dist(bestPt[0], bestPt[1], end[0], end[1]) ? p : bestPt,
        );
        const d = dist(tip[0], tip[1], end[0], end[1]);
        if (!best || d < best.d) best = { line: l, end, d };
      }
    }
    if (!best || best.d > ATTACH_TOL) continue; // decorative polygon, leave alone
    usedPolys.add(poly.p);
    const { line: l, end } = best;
    const isStart = end[0] === l.x1 && end[1] === l.y1;
    const dx = isStart ? l.x1 - l.x2 : l.x2 - l.x1;
    const dy = isStart ? l.y1 - l.y2 : l.y2 - l.y1;
    // Fill: the old head's own fill, else the paired line's stroke.
    const fill = extractAttr(poly.m[0], 'fill') ?? extractAttr(l.raw, 'stroke') ?? '#a8a29a';
    rebuiltPolyRaw.set(poly.p.raw, buildHead(end[0], end[1], dx, dy, fill));
    fixed++;
  }

  // Pass 2: lines with NO arrow-like head near either end get one at (x2,y2).
  // Zero-length lines are skipped — they have no direction, and building a
  // head for them produces a degenerate sliver (the idempotency bug).
  for (const { m, l } of lines) {
    if (Math.abs(l.x2 - l.x1) < 0.5 && Math.abs(l.y2 - l.y1) < 0.5) continue;
    const hasHead = arrowish.some((poly) => {
      if (usedPolys.has(poly.p)) {
        for (const end of [[l.x1, l.y1], [l.x2, l.y2]] as Array<[number, number]>) {
          const tip = poly.p.pts.reduce((bp, p) =>
            dist(p[0], p[1], end[0], end[1]) < dist(bp[0], bp[1], end[0], end[1]) ? p : bp,
          );
          if (dist(tip[0], tip[1], end[0], end[1]) <= ATTACH_TOL) return true;
        }
      }
      return false;
    });
    if (!hasHead && Number.isFinite(l.x2) && Number.isFinite(l.y2)) {
      const fill = extractAttr(m[0], 'stroke') ?? '#a8a29a';
      inserts.push({ end: [l.x2, l.y2], head: buildHead(l.x2, l.y2, l.x2 - l.x1, l.y2 - l.y1, fill) });
      added++;
    }
  }

  let out = svg;
  // Drop zero-area sliver polygons (GLM junk — invisible, but they confuse
  // later passes and bloat the markup).
  for (const poly of polys) {
    if (poly.p.pts.length === 3) {
      const area2 = Math.abs(
        (poly.p.pts[1][0] - poly.p.pts[0][0]) * (poly.p.pts[2][1] - poly.p.pts[0][1]) -
        (poly.p.pts[2][0] - poly.p.pts[0][0]) * (poly.p.pts[1][1] - poly.p.pts[0][1]),
      );
      if (area2 < 1) out = out.replace(poly.p.raw, '');
    }
  }
  for (const [raw, head] of rebuiltPolyRaw) out = out.replace(raw, head);
  // Insert added heads after the LAST </svg>-preceding element: append before
  // </svg> keeps them on top (paint order) so heads are never hidden by shapes.
  if (inserts.length) {
    const heads = inserts.map((i) => i.head).join('');
    out = out.replace(/<\/svg>\s*$/, heads + '</svg>');
  }
  return { svg: out, fixed, added };
}
