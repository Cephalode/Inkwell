import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { MindMapNode, MindMapEdge } from '../../types/mindmap';
import Button from '../shared/Button';
import Spinner from '../shared/Spinner';

/* ───────────────── colour palette by depth level ───────────────── */
const LEVEL_COLORS = [
  { bg: '#0d9488', border: '#14b8a6', text: '#f0fdfa' }, // teal  – centre
  { bg: '#2563eb', border: '#3b82f6', text: '#eff6ff' }, // blue   – L1
  { bg: '#7c3aed', border: '#8b5cf6', text: '#f5f3ff' }, // purple – L2
  { bg: '#db2777', border: '#ec4899', text: '#fdf2f8' }, // pink   – L3
  { bg: '#ea580c', border: '#f97316', text: '#fff7ed' }, // orange – L4+
];

/* ───────────────── layout helpers ───────────────── */
interface PositionedNode extends MindMapNode {
  x: number;
  y: number;
  level: number;
}

function computeLayout(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  width: number,
  height: number,
): PositionedNode[] {
  if (nodes.length === 0) return [];

  const cx = width / 2;
  const cy = height / 2;

  // Build adjacency from edges
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  edges.forEach((e) => {
    const arr = childrenOf.get(e.source) || [];
    if (!arr.includes(e.target)) arr.push(e.target);
    childrenOf.set(e.source, arr);
    if (!parentOf.has(e.target)) parentOf.set(e.target, e.source);
  });

  // Find central node: node with most outgoing edges (most-connected source)
  const outDegree = new Map<string, number>();
  edges.forEach((e) => outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1));
  let centralId = nodes[0].id;
  let maxDeg = -1;
  outDegree.forEach((deg, id) => {
    if (deg > maxDeg) { maxDeg = deg; centralId = id; }
  });

  // BFS to assign levels
  const levelMap = new Map<string, number>();
  const visited = new Set<string>();
  const queue: string[] = [centralId];
  levelMap.set(centralId, 0);
  visited.add(centralId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const kids = childrenOf.get(current) || [];
    kids.forEach((kid) => {
      if (!visited.has(kid)) {
        visited.add(kid);
        levelMap.set(kid, (levelMap.get(current) || 0) + 1);
        queue.push(kid);
      }
    });
  }

  // Also include nodes not reachable from central (assign level 2)
  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      levelMap.set(n.id, 2);
      visited.add(n.id);
    }
  });

  // Group nodes by level
  const byLevel = new Map<number, string[]>();
  nodes.forEach((n) => {
    const lv = levelMap.get(n.id) ?? 2;
    const arr = byLevel.get(lv) || [];
    arr.push(n.id);
    byLevel.set(lv, arr);
  });

  // Radii
  const baseRadius = Math.min(width, height) * 0.2;
  const levelGap = Math.min(width, height) * 0.18;

  const positions = new Map<string, { x: number; y: number; level: number }>();
  positions.set(centralId, { x: cx, y: cy, level: 0 });

  // Level 1: circle around centre
  const l1Nodes = byLevel.get(1) || [];
  const l1Count = l1Nodes.length;
  l1Nodes.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(l1Count, 1) - Math.PI / 2;
    const r = baseRadius;
    positions.set(id, {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      level: 1,
    });
  });

  // Level 2+: fan out from parent
  const maxLevel = Math.max(...Array.from(byLevel.keys()), 0);
  for (let lv = 2; lv <= maxLevel; lv++) {
    const lvNodes = byLevel.get(lv) || [];
    // Group by parent
    const siblings = new Map<string, string[]>();
    lvNodes.forEach((id) => {
      const pid = parentOf.get(id);
      if (pid) {
        const arr = siblings.get(pid) || [];
        arr.push(id);
        siblings.set(pid, arr);
      } else {
        const arr = siblings.get('__orphan') || [];
        arr.push(id);
        siblings.set('__orphan', arr);
      }
    });

    siblings.forEach((ids, parentId) => {
      const parentPos = positions.get(parentId);
      if (!parentPos) return;
      const count = ids.length;
      // Spread arc centred on direction from grandparent→parent (or just from centre)
      const spreadAngle = Math.min(Math.PI * 0.6, (Math.PI * 0.3) * count);
      const baseAngle = Math.atan2(parentPos.y - cy, parentPos.x - cx);

      ids.forEach((id, i) => {
        const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1..1
        const angle = baseAngle + t * spreadAngle * 0.5;
        const r = baseRadius + (lv - 1) * levelGap + Math.random() * 10;
        positions.set(id, {
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
          level: lv,
        });
      });
    });
  }

  return nodes.map((n) => {
    const p = positions.get(n.id) || { x: cx, y: cy, level: 0 };
    return { ...n, x: p.x, y: p.y, level: p.level };
  });
}

/* ───────────────── edge path helper ───────────────── */
function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  // perpendicular offset for curve
  const offset = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.15, 40);
  const cpx = mx - dy * 0.15;
  const cpy = my + dx * 0.15;
  void offset; // offset influences cpx/cpy via the 0.15 factor
  return `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`;
}

/* ───────────────── node dimensions ───────────────── */
const NODE_W = 140;
const NODE_H = 40;
const NODE_R = 12; // border radius

/* ================================================================ */
/*  Main component                                                   */
/* ================================================================ */

interface MindMapViewerProps {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

export default function MindMapViewer({ nodes, edges }: MindMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Viewport state
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 900, h: 600 });
  const [panStart, setPanStart] = useState<{ mx: number; my: number; vx: number; vy: number } | null>(null);

  // Interaction state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });

  // Observe container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) {
        const w = e.contentRect.width;
        const h = e.contentRect.height;
        setDims({ w, h });
        setViewBox((prev) => ({ ...prev, w, h }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute layout
  const positioned = useMemo(
    () => computeLayout(nodes, edges, dims.w, dims.h),
    [nodes, edges, dims.w, dims.h],
  );

  const nodeMap = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    positioned.forEach((n) => m.set(n.id, n));
    return m;
  }, [positioned]);

  // Determine highlighted set (selected node + its direct neighbours)
  const highlightedIds = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    edges.forEach((e) => {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    });
    return set;
  }, [selectedId, edges]);

  /* ─── Pan handlers ─── */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // only pan when clicking on background
      if ((e.target as Element).tagName !== 'svg') return;
      setPanStart({ mx: e.clientX, my: e.clientY, vx: viewBox.x, vy: viewBox.y });
    },
    [viewBox],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!panStart) return;
      const dx = (e.clientX - panStart.mx) * (viewBox.w / dims.w);
      const dy = (e.clientY - panStart.my) * (viewBox.h / dims.h);
      setViewBox((prev) => ({
        ...prev,
        x: panStart.vx - dx,
        y: panStart.vy - dy,
      }));
    },
    [panStart, viewBox.w, viewBox.h, dims.w, dims.h],
  );

  const handleMouseUp = useCallback(() => setPanStart(null), []);

  /* ─── Zoom handler ─── */
  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const scaleFactor = e.deltaY > 0 ? 1.08 : 1 / 1.08;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * viewBox.w + viewBox.x;
      const my = ((e.clientY - rect.top) / rect.height) * viewBox.h + viewBox.y;

      setViewBox((prev) => {
        const newW = prev.w * scaleFactor;
        const newH = prev.h * scaleFactor;
        return {
          x: mx - (mx - prev.x) * scaleFactor,
          y: my - (my - prev.y) * scaleFactor,
          w: newW,
          h: newH,
        };
      });
    },
    [viewBox],
  );

  /* ─── Fit-to-view ─── */
  const fitToView = useCallback(() => {
    if (positioned.length === 0) {
      setViewBox({ x: 0, y: 0, w: dims.w, h: dims.h });
      return;
    }
    const xs = positioned.map((n) => n.x);
    const ys = positioned.map((n) => n.y);
    const minX = Math.min(...xs) - NODE_W;
    const minY = Math.min(...ys) - NODE_H * 2;
    const maxX = Math.max(...xs) + NODE_W;
    const maxY = Math.max(...ys) + NODE_H * 2;
    const padding = 40;
    setViewBox({
      x: minX - padding,
      y: minY - padding,
      w: maxX - minX + padding * 2,
      h: maxY - minY + padding * 2,
    });
  }, [positioned, dims.w, dims.h]);

  // Auto-fit on first render with data
  const [autoFitted, setAutoFitted] = useState(false);
  useEffect(() => {
    if (positioned.length > 0 && !autoFitted) {
      fitToView();
      setAutoFitted(true);
    }
  }, [positioned.length, autoFitted, fitToView]);

  /* ─── Arrow head marker ─── */
  const markerId = 'arrowhead';

  /* ─── SVG rendering ─── */
  return (
    <div ref={containerRef} className="relative w-full bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden" style={{ minHeight: 500 }}>
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button
          onClick={fitToView}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-200 border border-slate-600/50 transition"
          title="Fit to view"
        >
          ⊞ Fit
        </button>
        <button
          onClick={() => setSelectedId(null)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-200 border border-slate-600/50 transition"
          title="Clear selection"
        >
          ✕ Clear
        </button>
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ minHeight: 500 }}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Background grid (subtle) */}
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
        </pattern>
        <rect
          x={viewBox.x - 2000}
          y={viewBox.y - 2000}
          width={viewBox.w + 4000}
          height={viewBox.h + 4000}
          fill="url(#grid)"
        />

        {/* Edges */}
        {edges.map((edge, i) => {
          const srcNode = nodeMap.get(edge.source);
          const tgtNode = nodeMap.get(edge.target);
          if (!srcNode || !tgtNode) return null;

          const dx = tgtNode.x - srcNode.x;
          const dy = tgtNode.y - srcNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          // shorten the line so it doesn't overlap the node rect
          const startX = srcNode.x + (dx / dist) * (NODE_W / 2);
          const startY = srcNode.y + (dy / dist) * (NODE_H / 2);
          const endX = tgtNode.x - (dx / dist) * (NODE_W / 2 + 8);
          const endY = tgtNode.y - (dy / dist) * (NODE_H / 2 + 8);

          const isHighlighted = highlightedIds
            ? highlightedIds.has(edge.source) && highlightedIds.has(edge.target)
            : true;
          const opacity = isHighlighted ? 0.7 : 0.15;

          return (
            <g key={`edge-${i}`}>
              <path
                d={curvedPath(startX, startY, endX, endY)}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={opacity}
                markerEnd={`url(#${markerId})`}
              />
              {/* Edge label */}
              {edge.label && isHighlighted && (
                <text
                  x={(startX + endX) / 2}
                  y={(startY + endY) / 2 - 6}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                  opacity={0.8}
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {positioned.map((node) => {
          const colors = LEVEL_COLORS[Math.min(node.level, LEVEL_COLORS.length - 1)];
          const isHighlighted = highlightedIds ? highlightedIds.has(node.id) : true;
          const isSelected = selectedId === node.id;
          const isHovered = hoveredId === node.id;
          const opacity = isHighlighted ? 1 : 0.2;
          const scale = isHovered ? 1.05 : 1;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y}) scale(${scale})`}
              style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId((prev) => (prev === node.id ? null : node.id));
              }}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              opacity={opacity}
            >
              {/* Glow for selected / hovered */}
              {(isSelected || isHovered) && (
                <rect
                  x={-NODE_W / 2 - 4}
                  y={-NODE_H / 2 - 4}
                  width={NODE_W + 8}
                  height={NODE_H + 8}
                  rx={NODE_R + 2}
                  fill="none"
                  stroke={colors.border}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  opacity={0.6}
                />
              )}
              {/* Background rect */}
              <rect
                x={-NODE_W / 2}
                y={-NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={NODE_R}
                fill={colors.bg}
                stroke={colors.border}
                strokeWidth={1.5}
              />
              {/* Label */}
              <text
                x={0}
                y={1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={colors.text}
                fontSize={node.level === 0 ? 13 : 11}
                fontWeight={node.level === 0 ? 700 : 500}
              >
                {node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ================================================================ */
/*  Wrapper that handles generation + loading state                  */
/* ================================================================ */

interface MindMapPageViewerProps {
  onGenerate: () => Promise<{ nodes: MindMapNode[]; edges: MindMapEdge[] }>;
  isLoading: boolean;
}

export function MindMapPageViewer({ onGenerate, isLoading }: MindMapPageViewerProps) {
  const [data, setData] = useState<{ nodes: MindMapNode[]; edges: MindMapEdge[] } | null>(null);

  const handleGenerate = async () => {
    const result = await onGenerate();
    setData(result);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">🧠 Knowledge Graph</h3>
        <Button onClick={handleGenerate} isLoading={isLoading}>
          Generate Mind Map
        </Button>
      </div>
      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {data && <MindMapViewer nodes={data.nodes} edges={data.edges} />}
    </div>
  );
}
