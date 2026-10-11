import { FOUNDATION_COURSE, type TopicEdge, type TopicNode } from '../types/topicMap';

/**
 * The Study Desk prototype's hand-rolled force layout: known topics (foundations and
 * learned course topics) are pulled into a green core at the centre; the rest branch
 * outward along their course's angle, in-progress topics closer than up-next ones.
 */

export interface SimNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface SimState {
  nodes: Record<string, SimNode>;
  /** Simulation heat — decays each frame; the loop sleeps below ~0.015. */
  alpha: number;
  /** Per-topic angular offset from its course's branch angle (built lazily). */
  branchOff: Record<string, number> | null;
}

export interface SimInput {
  topics: TopicNode[];
  edges: TopicEdge[];
  /** Course ids in map order — each gets an evenly spaced branch angle. */
  courseIds: string[];
  hidden: ReadonlySet<string>;
  w: number;
  h: number;
  dragId: string | null;
}

export const isKnown = (t: TopicNode) => t.mastery >= 2;
export const isHidden = (t: TopicNode, hidden: ReadonlySet<string>) =>
  t.courseId !== FOUNDATION_COURSE && hidden.has(t.courseId);

/** Branch angle for the i-th course of n: the first points up, then clockwise. */
export function courseAngle(index: number, count: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1);
}

/** Deterministic jitter in [-0.5, 0.5) so a fresh layout never stacks nodes exactly. */
function jitter(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

function buildBranchOffsets(input: SimInput): Record<string, number> {
  const off: Record<string, number> = {};
  const sector = (2 * Math.PI) / Math.max(input.courseIds.length, 1);
  for (const courseId of input.courseIds) {
    const branch = input.topics.filter((t) => t.courseId === courseId && !isKnown(t));
    const step = branch.length > 1 ? Math.min(0.52, (sector * 0.75) / (branch.length - 1)) : 0;
    branch.forEach((t, i) => {
      off[t.id] = (i - (branch.length - 1) / 2) * step;
    });
  }
  return off;
}

/** Rest position a topic is pulled toward (centre for the core, a branch point otherwise). */
function anchor(t: TopicNode, state: SimState, input: SimInput): { ax: number; ay: number; st: number } {
  const { w, h } = input;
  const cx = w / 2;
  const cy = h / 2;
  if (isKnown(t)) return { ax: cx, ay: cy, st: 0.02 };
  const R = Math.min(w, h) / 2;
  // Shared topics sit on the branch of their first course that is still shown.
  const cid = t.courseIds.find((c) => !input.hidden.has(c)) ?? t.courseId;
  const idx = input.courseIds.indexOf(cid);
  const a = courseAngle(Math.max(idx, 0), input.courseIds.length) + (state.branchOff?.[t.id] ?? 0);
  const inProgress = t.mastery === 1;
  return {
    ax: cx + Math.cos(a) * (w / 2) * (inProgress ? 0.5 : 0.8),
    ay: cy + Math.sin(a) * R * (inProgress ? 0.58 : 0.85),
    st: 0.012,
  };
}

/** Gives every topic without a position one near its anchor; keeps existing positions. */
export function seedPositions(state: SimState, input: SimInput): void {
  if (!state.branchOff) state.branchOff = buildBranchOffsets(input);
  input.topics.forEach((t, i) => {
    if (state.nodes[t.id]) return;
    const { ax, ay } = anchor(t, state, input);
    const spread = isKnown(t) ? 40 : 30;
    state.nodes[t.id] = { x: ax + jitter(i, 1) * spread, y: ay + jitter(i, 2) * spread, vx: 0, vy: 0 };
  });
  for (const id of Object.keys(state.nodes)) {
    if (!input.topics.some((t) => t.id === id)) delete state.nodes[id];
  }
}

/** One tick: repulsion between visible nodes, springs along edges, pull toward anchors. */
export function stepSimulation(state: SimState, input: SimInput): void {
  if (!state.branchOff) state.branchOff = buildBranchOffsets(input);
  const ns = state.nodes;
  const al = state.alpha;
  const byId = new Map(input.topics.map((t) => [t.id, t]));
  const visible = input.topics.filter((t) => !isHidden(t, input.hidden) && ns[t.id]);

  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = ns[visible[i].id];
      const b = ns[visible[j].id];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d2 = dx * dx + dy * dy || 1;
      const d = Math.sqrt(d2);
      const f = Math.min(2600 / d2, 2.5) * al;
      dx /= d;
      dy /= d;
      a.vx -= dx * f;
      a.vy -= dy * f;
      b.vx += dx * f;
      b.vy += dy * f;
    }
  }

  for (const e of input.edges) {
    const A = byId.get(e.a);
    const B = byId.get(e.b);
    if (!A || !B || isHidden(A, input.hidden) || isHidden(B, input.hidden)) continue;
    const a = ns[e.a];
    const b = ns[e.b];
    if (!a || !b) continue;
    const related =
      A.courseId === FOUNDATION_COURSE ||
      B.courseId === FOUNDATION_COURSE ||
      A.courseIds.some((c) => B.courseIds.includes(c));
    const rest = isKnown(A) && isKnown(B) ? 72 : related ? 95 : 165;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - rest) * 0.03 * al;
    dx /= d;
    dy /= d;
    a.vx += dx * f;
    a.vy += dy * f;
    b.vx -= dx * f;
    b.vy -= dy * f;
  }

  for (const t of visible) {
    const n = ns[t.id];
    if (t.id === input.dragId) {
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    const { ax, ay, st } = anchor(t, state, input);
    n.vx += (ax - n.x) * st * al;
    n.vy += (ay - n.y) * st * al;
    n.vx *= 0.8;
    n.vy *= 0.8;
    n.x += n.vx;
    n.y += n.vy;
  }
}
