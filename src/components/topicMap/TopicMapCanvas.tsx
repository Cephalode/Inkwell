import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PiCrosshairSimpleDuotone } from 'react-icons/pi';
import { FOUNDATION_COURSE, type TopicMap, type TopicNode } from '../../types/topicMap';
import { FOUNDATION_HUE, courseHue } from '../../utils/buildTopicMap';
import { courseAngle, isHidden, isKnown, seedPositions, stepSimulation, type SimState } from '../../utils/topicMapSim';

// ── Imperative layout engine ───────────────────────────────────────────────
// Positions, pan/zoom and pointer gestures live outside React state: the
// requestAnimationFrame loop writes straight to the elements, and React only
// re-renders for hover and selection.

interface View {
  tx: number;
  ty: number;
  k: number;
}

interface Drag {
  id: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
}

interface Pan {
  sx: number;
  sy: number;
  tx0: number;
  ty0: number;
  moved: boolean;
}

interface Engine {
  sim: SimState;
  view: View;
  size: { w: number; h: number };
  drag: Drag | null;
  pan: Pan | null;
  /** Once the viewer pans, zooms or drags, the camera stops following the layout. */
  userTouched: boolean;
}

interface Els {
  nodes: Map<string, HTMLElement>;
  edges: Map<string, SVGLineElement>;
  clusters: Map<string, HTMLElement>;
  world: HTMLDivElement | null;
  svgGroup: SVGGElement | null;
}

interface Data {
  map: TopicMap;
  hidden: ReadonlySet<string>;
}

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

const edgeKey = (a: string, b: string) => `${a}|${b}`;

const simInput = (engine: Engine, data: Data) => ({
  ...engine.size,
  topics: data.map.topics,
  edges: data.map.edges,
  courseIds: data.map.courses.map((c) => c.id),
  hidden: data.hidden,
  dragId: engine.drag?.id ?? null,
});

function applyView(engine: Engine, els: Els): void {
  const v = engine.view;
  els.svgGroup?.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.k})`);
  if (els.world) els.world.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.k})`;
}

/**
 * Where each visible course's label goes: the prototype's fixed spot on the rim,
 * or just past the course's outermost node when a long branch reaches further.
 */
function clusterPoints(engine: Engine, els: Els, data: Data): Map<string, { x: number; y: number; hw: number }> {
  const ns = engine.sim.nodes;
  const { w, h } = engine.size;
  const cx = w / 2;
  const cy = h / 2;
  const pts = new Map<string, { x: number; y: number; hw: number }>();
  data.map.courses.forEach((c, i) => {
    if (data.hidden.has(c.id)) return;
    const el = els.clusters.get(c.id);
    const hw = el ? el.offsetWidth / 2 : 40;
    const a = courseAngle(i, data.map.courses.length);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const fixed = ux * ux * 0.42 * w + uy * uy * (Math.min(w, h) / h) * 0.465 * h;
    let reach = -Infinity;
    for (const t of data.map.topics) {
      const p = ns[t.id];
      if (t.courseId !== c.id || !p) continue;
      reach = Math.max(reach, (p.x - cx) * ux + (p.y - cy) * uy);
    }
    // Clear the outermost node's caption (hangs ~14px below, ~45px to each side).
    const margin = 30 + 14 * Math.max(0, uy) + (45 + hw) * Math.abs(ux);
    const dist = Math.max(fixed, reach + margin);
    pts.set(c.id, { x: cx + ux * dist, y: cy + uy * dist, hw });
  });
  return pts;
}

/** Writes simulated positions to the node buttons, edge lines and course labels. */
function applyPositions(engine: Engine, els: Els, data: Data): void {
  const ns = engine.sim.nodes;
  const labels = clusterPoints(engine, els, data);
  for (const [id, p] of labels) {
    const el = els.clusters.get(id);
    if (!el) continue;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }
  for (const [id, el] of els.nodes) {
    const p = ns[id];
    if (!p) continue;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }
  for (const [key, el] of els.edges) {
    const sep = key.indexOf('|');
    const a = ns[key.slice(0, sep)];
    const b = ns[key.slice(sep + 1)];
    if (!a || !b) continue;
    el.setAttribute('x1', String(a.x));
    el.setAttribute('y1', String(a.y));
    el.setAttribute('x2', String(b.x));
    el.setAttribute('y2', String(b.y));
  }
}

/** Pans/zooms so the whole layout — nodes and course labels — is in view (never past 1:1). */
function fitView(engine: Engine, els: Els, data: Data): void {
  const ns = engine.sim.nodes;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of data.map.topics) {
    const p = ns[t.id];
    if (!p || isHidden(t, data.hidden)) continue;
    minX = Math.min(minX, p.x - 45);
    minY = Math.min(minY, p.y - 15);
    maxX = Math.max(maxX, p.x + 45);
    maxY = Math.max(maxY, p.y + 30);
  }
  for (const p of clusterPoints(engine, els, data).values()) {
    minX = Math.min(minX, p.x - p.hw);
    minY = Math.min(minY, p.y - 8);
    maxX = Math.max(maxX, p.x + p.hw);
    maxY = Math.max(maxY, p.y + 8);
  }
  if (!Number.isFinite(minX)) return;
  const { w, h } = engine.size;
  const pad = 16;
  const k = Math.min(1, w / (maxX - minX + pad * 2), h / (maxY - minY + pad * 2));
  engine.view = { k, tx: (w - k * (minX + maxX)) / 2, ty: (h - k * (minY + maxY)) / 2 };
  applyView(engine, els);
}

/** One animation frame: cool the simulation, step it, paint, and follow it with the camera. */
function tick(engine: Engine, els: Els, data: Data): void {
  const sim = engine.sim;
  if (sim.alpha <= 0.015) return;
  sim.alpha *= 0.992;
  stepSimulation(sim, simInput(engine, data));
  applyPositions(engine, els, data);
  if (!engine.userTouched) fitView(engine, els, data);
}

function zoomAt(engine: Engine, els: Els, mx: number, my: number, deltaY: number): void {
  const v = engine.view;
  const k0 = v.k;
  const k1 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k0 * Math.exp(-deltaY * 0.0015)));
  v.tx = mx - (mx - v.tx) * (k1 / k0);
  v.ty = my - (my - v.ty) * (k1 / k0);
  v.k = k1;
  applyView(engine, els);
}

function pointerMove(engine: Engine, els: Els, data: Data, clientX: number, clientY: number): void {
  const { drag, pan } = engine;
  if (drag) {
    const dx = clientX - drag.sx;
    const dy = clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    const n = engine.sim.nodes[drag.id];
    if (n) {
      n.x = drag.ox + dx / engine.view.k;
      n.y = drag.oy + dy / engine.view.k;
      n.vx = 0;
      n.vy = 0;
    }
    engine.sim.alpha = Math.max(engine.sim.alpha, 0.45);
    applyPositions(engine, els, data);
  } else if (pan) {
    if (Math.abs(clientX - pan.sx) + Math.abs(clientY - pan.sy) > 4) pan.moved = true;
    engine.view.tx = pan.tx0 + clientX - pan.sx;
    engine.view.ty = pan.ty0 + clientY - pan.sy;
    applyView(engine, els);
  }
}

// ── Component ──────────────────────────────────────────────────────────────

interface TopicMapCanvasProps {
  map: TopicMap;
  /** Course ids toggled off with the "Show" chips. */
  hidden: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  height?: number;
}

/**
 * The topic map's drawing surface: SVG links under DOM nodes, both inside one
 * pan/zoom transform; the Study Desk prototype's canvas, driven by real data.
 */
export default function TopicMapCanvas({ map, hidden, selectedId, onSelect, height = 560 }: TopicMapCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const svgGroupRef = useRef<SVGGElement>(null);
  const nodeEls = useRef(new Map<string, HTMLElement>());
  const edgeEls = useRef(new Map<string, SVGLineElement>());
  const clusterEls = useRef(new Map<string, HTMLElement>());
  const engineRef = useRef<Engine>({
    sim: { nodes: {}, alpha: 1, branchOff: null },
    view: { tx: 0, ty: 0, k: 1 },
    size: { w: 600, h: height },
    drag: null,
    pan: null,
    userTouched: false,
  });
  const dataRef = useRef<Data>({ map, hidden });
  const selectionRef = useRef({ selectedId, onSelect });

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverEdgeCourses, setHoverEdgeCourses] = useState<string[] | null>(null);
  const [hoverCluster, setHoverCluster] = useState<string | null>(null);

  const els = (): Els => ({
    nodes: nodeEls.current,
    edges: edgeEls.current,
    clusters: clusterEls.current,
    world: worldRef.current,
    svgGroup: svgGroupRef.current,
  });

  useEffect(() => {
    dataRef.current = { map, hidden };
    const engine = engineRef.current;
    engine.sim.branchOff = null;
    seedPositions(engine.sim, simInput(engine, dataRef.current));
    engine.sim.alpha = 1;
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps -- hidden is tracked by the effect below

  useEffect(() => {
    dataRef.current = { ...dataRef.current, hidden };
    const engine = engineRef.current;
    engine.sim.alpha = Math.max(engine.sim.alpha, 0.7);
  }, [hidden]);

  useEffect(() => {
    selectionRef.current = { selectedId, onSelect };
  }, [selectedId, onSelect]);

  // After every commit the freshly rendered elements need their positions.
  useLayoutEffect(() => {
    applyPositions(engineRef.current, els(), dataRef.current);
    applyView(engineRef.current, els());
  });

  // Measure the canvas; keep the simulation's frame in sync with its box.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (!w || !h) return;
      const engine = engineRef.current;
      engine.size = { w, h };
      seedPositions(engine.sim, simInput(engine, dataRef.current));
      engine.sim.alpha = Math.max(engine.sim.alpha, 0.5);
      applyPositions(engine, els(), dataRef.current);
    });
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom (needs a non-passive listener), pointer drag/pan, and the layout loop.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const engine = engineRef.current;
      engine.userTouched = true;
      const r = cv.getBoundingClientRect();
      zoomAt(engine, els(), e.clientX - r.left, e.clientY - r.top, e.deltaY);
    };
    const onMove = (e: PointerEvent) => pointerMove(engineRef.current, els(), dataRef.current, e.clientX, e.clientY);
    const onUp = () => {
      const engine = engineRef.current;
      const { drag, pan } = engine;
      engine.drag = null;
      engine.pan = null;
      const { selectedId: sel, onSelect: select } = selectionRef.current;
      if (drag && !drag.moved) select(sel === drag.id ? null : drag.id);
      if (pan && !pan.moved && sel) select(null);
      cv.style.cursor = 'grab';
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    let raf = 0;
    const loop = () => {
      tick(engineRef.current, els(), dataRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cv.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(raf);
    };
  }, []);

  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const engine = engineRef.current;
    engine.userTouched = true;
    engine.pan = { sx: e.clientX, sy: e.clientY, tx0: engine.view.tx, ty0: engine.view.ty, moved: false };
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  };

  const startDrag = (t: TopicNode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const engine = engineRef.current;
    const p = engine.sim.nodes[t.id];
    if (!p) return;
    engine.userTouched = true;
    engine.drag = { id: t.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
  };

  const recenter = () => {
    const engine = engineRef.current;
    engine.view = { tx: 0, ty: 0, k: 1 };
    engine.userTouched = false;
    engine.sim = { nodes: {}, alpha: 1, branchOff: null };
    seedPositions(engine.sim, simInput(engine, dataRef.current));
    applyPositions(engine, els(), dataRef.current);
    applyView(engine, els());
  };

  const setNodeEl = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) nodeEls.current.set(id, el);
    else nodeEls.current.delete(id);
  };
  const setEdgeEl = (key: string) => (el: SVGLineElement | null) => {
    if (el) edgeEls.current.set(key, el);
    else edgeEls.current.delete(key);
  };
  const setClusterEl = (id: string) => (el: HTMLElement | null) => {
    if (el) clusterEls.current.set(id, el);
    else clusterEls.current.delete(id);
  };

  // ── Derived hover/selection state ──────────────────────────────
  const byId = useMemo(() => new Map(map.topics.map((t) => [t.id, t])), [map.topics]);
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of map.edges) {
      d.set(e.a, (d.get(e.a) ?? 0) + 1);
      d.set(e.b, (d.get(e.b) ?? 0) + 1);
    }
    return d;
  }, [map.edges]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const focus = (hoverId ? byId.get(hoverId) : null) ?? selected;
  const connected = new Set<string>();
  if (focus) {
    for (const e of map.edges) {
      if (e.a === focus.id) connected.add(e.b);
      if (e.b === focus.id) connected.add(e.a);
    }
  }
  const glowCourses = new Set<string>();
  if (focus && focus.courseId !== FOUNDATION_COURSE) focus.courseIds.forEach((c) => glowCourses.add(c));
  for (const c of hoverEdgeCourses ?? []) glowCourses.add(c);
  if (hoverCluster) glowCourses.add(hoverCluster);

  const visibleTopics = map.topics.filter((t) => !isHidden(t, hidden));
  const visibleIds = new Set(visibleTopics.map((t) => t.id));
  const visibleEdges = map.edges.filter((e) => visibleIds.has(e.a) && visibleIds.has(e.b));
  const focusHue = focus
    ? focus.courseId === FOUNDATION_COURSE || focus.mastery === 2
      ? FOUNDATION_HUE
      : courseHue(map, focus.courseId)
    : null;

  // A topic shared by N courses wears each course's hue as an equal slice of the dot.
  const pieGradient = (t: TopicNode): string => {
    const hues = t.courseIds.map((cid) => courseHue(map, cid));
    if (hues.length < 2) return hues[0] ?? 'var(--color-neutral-500)';
    const step = 100 / hues.length;
    return `conic-gradient(${hues.map((h, i) => `${h} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
  };

  const dotFill = (hue: string, t: TopicNode): CSSProperties => {
    if (isKnown(t)) {
      return t.courseId === FOUNDATION_COURSE
        ? { background: `color-mix(in srgb, ${FOUNDATION_HUE} 70%, #fff)`, border: `2px solid color-mix(in srgb, ${FOUNDATION_HUE} 45%, #14251a)` }
        : { background: `color-mix(in srgb, ${FOUNDATION_HUE} 70%, #fff)`, border: 'none' };
    }
    if (t.courseIds.length > 1) {
      // Shared node: pie of its courses' hues (solid slices when in progress).
      return t.mastery === 1
        ? { background: pieGradient(t), border: '2px solid var(--color-neutral-500)' }
        : { background: 'var(--color-surface)', border: '2px dashed var(--color-neutral-500)' };
    }
    if (t.mastery === 1) return { background: `color-mix(in srgb, ${hue} 25%, var(--color-surface))`, border: `2px solid ${hue}` };
    return { background: 'var(--color-surface)', border: `2px dashed color-mix(in srgb, ${hue} 70%, var(--color-neutral-500))` };
  };

  return (
    <div
      ref={canvasRef}
      onPointerDown={startPan}
      style={{
        position: 'relative',
        height,
        minWidth: 0,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-neutral-300)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <g ref={svgGroupRef}>
          {visibleEdges.map((e) => {
            const A = byId.get(e.a)!;
            const B = byId.get(e.b)!;
            const cross =
              !A.courseIds.some((c) => B.courseIds.includes(c)) &&
              A.courseId !== FOUNDATION_COURSE &&
              B.courseId !== FOUNDATION_COURSE;
            const core = isKnown(A) && isKnown(B);
            const active = !!focus && (e.a === focus.id || e.b === focus.id);
            const key = edgeKey(e.a, e.b);
            return (
              <line
                key={key}
                ref={setEdgeEl(key)}
                onMouseEnter={() => setHoverEdgeCourses([A.courseId, B.courseId].filter((c) => c !== FOUNDATION_COURSE))}
                onMouseLeave={() => setHoverEdgeCourses(null)}
                style={{
                  pointerEvents: 'stroke',
                  stroke: active
                    ? focusHue!
                    : core
                      ? `color-mix(in srgb, ${FOUNDATION_HUE} 55%, var(--color-neutral-500))`
                      : 'var(--color-neutral-500)',
                  strokeWidth: active ? 2 : core ? 1.5 : 1.2,
                  strokeDasharray: cross ? '6 5' : 'none',
                  opacity: focus ? (active ? 0.95 : 0.12) : core ? 0.65 : cross ? 0.7 : 0.45,
                  transition: 'opacity .15s',
                }}
              />
            );
          })}
        </g>
      </svg>

      <div ref={worldRef} style={{ position: 'absolute', inset: 0, transformOrigin: '0 0' }}>
        {map.courses.map((c) => {
          if (hidden.has(c.id)) return null;
          const glow = glowCourses.has(c.id);
          return (
            <span
              key={c.id}
              ref={setClusterEl(c.id)}
              onMouseEnter={() => setHoverCluster(c.id)}
              onMouseLeave={() => setHoverCluster(null)}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: `translate(-50%, -50%) scale(${glow ? 1.35 : 1})`,
                font: '700 10.5px var(--font-body)',
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: c.hue,
                opacity: glow ? 1 : 0.75,
                textShadow: glow
                  ? `0 0 10px color-mix(in srgb, ${c.hue} 85%, transparent), 0 0 24px color-mix(in srgb, ${c.hue} 55%, transparent)`
                  : 'none',
                transition: 'opacity .15s, text-shadow .15s, transform .15s',
                cursor: 'default',
                whiteSpace: 'nowrap',
              }}
            >
              {c.name}
            </span>
          );
        })}

        {visibleTopics.map((t) => {
          const known = isKnown(t);
          const hue = known ? FOUNDATION_HUE : courseHue(map, t.courseId);
          const isSel = selected?.id === t.id;
          const isFoc = focus?.id === t.id;
          const faded =
            hoverCluster && !t.courseIds.includes(hoverCluster)
              ? true
              : !!focus && !isFoc && !connected.has(t.id);
          const sz = Math.min(30, 11 + (degree.get(t.id) ?? 0) * 2.5);
          // Learned shared topics keep a halo per owning course (blended when >1).
          const ring = known && t.courseId !== FOUNDATION_COURSE && t.courseIds.length > 1
            ? `0 0 0 4px color-mix(in srgb, ${pieGradient(t)} 35%, transparent)`
            : known && t.courseId !== FOUNDATION_COURSE
              ? `0 0 0 4px color-mix(in srgb, ${courseHue(map, t.courseId)} 35%, transparent)`
              : null;
          const shadows: string[] = [];
          if (isSel || isFoc || (hoverCluster && t.courseIds.includes(hoverCluster))) {
            shadows.push(`0 0 0 ${(isSel ? 4 : 3) + (ring ? 4 : 0)}px color-mix(in srgb, ${hue} 35%, transparent)`);
          }
          if (ring) shadows.push(ring);
          return (
            <button
              key={t.id}
              ref={setNodeEl(t.id)}
              type="button"
              aria-label={t.label}
              aria-pressed={isSel}
              onPointerDown={startDrag(t)}
              onMouseEnter={() => setHoverId(t.id)}
              onMouseLeave={() => setHoverId(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(isSel ? null : t.id);
                }
              }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: `translate(-50%, -${sz / 2}px)`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'grab',
                opacity: faded ? 0.22 : 1,
                transition: 'opacity .15s',
                zIndex: 1,
              }}
            >
              <span
                style={{
                  width: sz,
                  height: sz,
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  flex: 'none',
                  boxShadow: shadows.length ? shadows.join(', ') : 'none',
                  transition: 'box-shadow .15s',
                  ...dotFill(hue, t),
                }}
              />
              <span
                style={{
                  font: `${isFoc ? 600 : 500} 11px var(--font-body)`,
                  color: 'var(--color-text)',
                  opacity: isFoc ? 1 : faded ? 0.6 : 0.72,
                  whiteSpace: 'nowrap',
                  marginTop: 5,
                }}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn btn-ghost"
        onClick={recenter}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, fontSize: 12, padding: '5px 10px', background: 'var(--color-bg)' }}
      >
        <PiCrosshairSimpleDuotone size={14} />
        &nbsp;Re-center
      </button>
      <div style={{ position: 'absolute', left: 12, bottom: 10, fontSize: 11.5, opacity: 0.45, pointerEvents: 'none' }}>
        Drag nodes · scroll to zoom · drag canvas to pan
      </div>
    </div>
  );
}
