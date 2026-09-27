import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import ForceGraph2D, { type ForceGraphInstance } from '../../lib/ForceGraph2D';
import type { KGNode, KGGraph, KGNodeType } from '../../types/knowledgeGraph';
import { useKnowledgeGraphStore } from '../../store/knowledgeGraphStore';
import { FOUNDATION_HUE, COURSE_HUES } from '../../utils/buildTopicMap';

// ── Topic Map visual language ───────────────────────────────────────────────
// The graph adopts the roadmap Topic Map's style: learned topics + foundations
// form the green core, everything else wears its course's muted hue, cross-course
// links are dashed, and focus dims everything not connected.

/** Course hue by course id, mirroring the Topic Map (order in COURSE_HUES). */
let courseHueCounter = 0;
const courseHueById = new Map<string, string>();
function courseHueFor(courseId?: string): string {
  if (!courseId) return '#8a8a8a';
  let hue = courseHueById.get(courseId);
  if (!hue) {
    hue = COURSE_HUES[courseHueCounter % COURSE_HUES.length];
    courseHueCounter += 1;
  }
  return hue;
}
/** Reset per-render assignment so hue order stays stable across data refreshes. */
function resetCourseHues(): void {
  courseHueCounter = 0;
  courseHueById.clear();
}

const NODE_COLORS: Record<KGNodeType, string> = {
  document: '#2380a2',
  doctype: '#9c6a24',
  tag: '#6f5fa8',
  course: '#b8547c',
  subject: '#5d8a50',
  chat: '#8a8a8a',
  chapter: '#38a6cf',
  topic: '#e8b93b',
  guide: '#b8547c',
  deck: '#5d8a50',
};

/** Topic nodes are coloured by learning-suite mastery, not by type. */
const TOPIC_MASTERY_COLORS: Record<NonNullable<KGNode['mastery']>, string> = {
  0: '#e8b93b', // not started
  1: '#38a6cf', // in progress
  2: FOUNDATION_HUE, // learned — the green core
  3: FOUNDATION_HUE, // foundation — assumed known
};

function nodeColor(node: KGNode): string {
  if (node.type === 'topic') {
    if ((node.mastery ?? 0) >= 2) return TOPIC_MASTERY_COLORS[node.mastery ?? 0];
    // Unlearned topics wear their course's hue (Topic Map branch coloring).
    return courseHueFor(node.courseIds?.[0] ?? node.courseId);
  }
  return NODE_COLORS[node.type] || '#6b7280';
}

const NODE_RADIUS: Record<KGNodeType, number> = {
  document: 6,
  doctype: 10,
  tag: 7,
  course: 12,
  subject: 9,
  chat: 4,
  chapter: 4,
  topic: 5,
  guide: 6,
  deck: 5,
};

const EDGE_COLORS: Record<string, string> = {
  'is-type': 'rgba(156,106,36,0.3)',
  'has-tag': 'rgba(111,95,168,0.3)',
  'in-course': 'rgba(184,84,124,0.3)',
  'has-subject': 'rgba(93,138,80,0.3)',
  'related-chat': 'rgba(138,138,138,0.25)',
  'is-chapter-of': 'rgba(56,166,207,0.3)',
  'next-topic': 'rgba(232,185,59,0.45)',
  'builds-on': 'rgba(47,158,87,0.4)',
  'has-guide': 'rgba(184,84,124,0.4)',
  'has-deck': 'rgba(93,138,80,0.4)',
};

/** Links between nodes of different courses render dashed (Topic Map cross-course style). */
function isCrossCourse(link: SimLink): boolean {
  const a = typeof link.source === 'object' ? (link.source as SimNode) : null;
  const b = typeof link.target === 'object' ? (link.target as SimNode) : null;
  const ac = a?.courseIds;
  const bc = b?.courseIds;
  if (!ac?.length || !bc?.length) return false;
  return !ac.some((c) => bc.includes(c));
}

/** Map from filter toggle key → node type it controls */
const FILTER_TYPE_MAP: Record<string, KGNodeType> = {
  showDocuments: 'document',
  showDoctypes: 'doctype',
  showTags: 'tag',
  showCourses: 'course',
  showSubjects: 'subject',
  showChats: 'chat',
  showChapters: 'chapter',
  showTopics: 'topic',
};

// ── Initial fit-to-view tuning ───────────────────────────────────
// force-graph's *default* initial zoom is a viewport-blind heuristic
// (4 / ∛nodeCount) that makes the graph look far too zoomed-out on
// small screens. We replace it with a real fit computed from the
// layout's bounding box and the actual viewport size.
/** Tailwind `md` breakpoint — below this we treat the viewport as mobile. */
const MOBILE_BREAKPOINT = 768;
/**
 * On narrow viewports a full fit squishes every node into a tiny,
 * illegible dot. We instead zoom in tighter than a full fit so users
 * start with a focused, readable region and pan to see the rest.
 * (A full fit is already ideal on desktop, so no boost there.)
 */
const MOBILE_TIGHTEN_FACTOR = 2.5;
/** Never blow the initial zoom up beyond this (e.g. a 2-node graph). */
const MAX_INIT_ZOOM = 4;
/** Floor; matches the component's minZoom prop. */
const MIN_INIT_ZOOM = 0.1;

/** A KGNode augmented with the x/y coordinates the D3 force simulation
 *  attaches to node objects at runtime (mirrors force-graph's NodeObject). */
interface SimNode extends KGNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

/** Runtime shape of a graph link/edge. The D3 force simulation mutates the
 *  initial string endpoint IDs into live node-object references. */
interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  label?: string;
  type?: string;
}

/** Extract the id from a link endpoint, which the D3 force simulation may
 *  have mutated from a plain string into a live node-object reference. */
function endpointId(endpoint: unknown): string {
  return typeof endpoint === 'object' && endpoint !== null
    ? (endpoint as SimNode).id
    : String(endpoint);
}

interface GraphViewerProps {
  graph: KGGraph;
  onNodeClick?: (node: KGNode) => void;
}

export default function GraphViewer({ graph, onNodeClick }: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphInstance | null>(null);
  const didInitialFitRef = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const { filters, setHoveredNode, simulationControls } = useKnowledgeGraphStore();

  // ── Apply filters to the raw graph ──────────────────────────
  const filteredGraph = useMemo(() => {
    // Build set of excluded types based on filter toggles
    const excludedTypes = new Set<KGNodeType>();
    for (const [filterKey, nodeType] of Object.entries(FILTER_TYPE_MAP)) {
      if (!(filters[filterKey as keyof typeof filters] as boolean)) {
        excludedTypes.add(nodeType);
      }
    }

    // Filter out nodes of excluded types
    let filteredNodes = graph.nodes.filter((n) => !excludedTypes.has(n.type));

    // Apply search query: keep matching nodes + their direct neighbours
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase();
      const matchingIds = new Set<string>();
      const neighbourIds = new Set<string>();

      for (const node of filteredNodes) {
        if (node.label.toLowerCase().includes(q)) {
          matchingIds.add(node.id);
        }
      }

      // Find direct neighbours of matched nodes from original edges
      for (const edge of graph.edges) {
        if (matchingIds.has(edge.source)) neighbourIds.add(edge.target);
        if (matchingIds.has(edge.target)) neighbourIds.add(edge.source);
      }

      const keepIds = new Set([...matchingIds, ...neighbourIds]);
      filteredNodes = filteredNodes.filter((n) => keepIds.has(n.id));
    }

    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    // Filter edges: keep only those where both endpoints survive
    const filteredEdges = graph.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [graph, filters]);

  // ── Stable course-hue assignment per data refresh (Topic Map order) ──
  useMemo(() => {
    resetCourseHues();
    for (const n of filteredGraph.nodes) {
      if (n.type === 'topic') courseHueFor(n.courseIds?.[0] ?? n.courseId);
    }
  }, [filteredGraph.nodes]);

  // Track connected nodes for hover highlighting (using filtered graph)
  const connectedNodes = useMemo(() => {
    if (!hoveredNodeId) return null;
    const connected = new Set<string>();
    connected.add(hoveredNodeId);
    for (const edge of filteredGraph.edges) {
      const src = endpointId(edge.source);
      const tgt = endpointId(edge.target);
      if (src === hoveredNodeId) connected.add(tgt);
      if (tgt === hoveredNodeId) connected.add(src);
    }
    return connected;
  }, [hoveredNodeId, filteredGraph.edges]);

  // ResizeObserver to track container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Apply simulation controls to the force-graph instance ────
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;

    // Configure d3 forces via the force-graph API
    const chargeForce = fg.d3Force('charge');
    if (chargeForce) {
      chargeForce.strength(simulationControls.chargeStrength);
    }

    const linkForce = fg.d3Force('link');
    if (linkForce) {
      linkForce.distance(simulationControls.linkDistance);
      linkForce.strength(simulationControls.velocityDecay > 0 ? simulationControls.linkStrength : 0);
    }

    const centerForce = fg.d3Force('center');
    if (centerForce) {
      centerForce.strength(simulationControls.centerStrength);
    }

    // velocityDecay is set via the graph method
    // velocityDecay is passed as a prop to ForceGraph2D (not available on kapsule ref)

    // Reheat the simulation so changes effect
    fg.d3ReheatSimulation();
    // cooldownTime is passed as a prop to ForceGraph2D
  }, [simulationControls]);

  // Convert filtered graph to react-force-graph format (edges → links)
  const graphData = useMemo(() => ({
    nodes: filteredGraph.nodes,
    links: filteredGraph.edges,
  }), [filteredGraph]);

  // Pre-compute node degrees for size-by-connections
  const nodeDegrees = useMemo(() => {
    const degrees: Record<string, number> = {};
    for (const node of filteredGraph.nodes) {
      degrees[node.id] = 0;
    }
    for (const edge of filteredGraph.edges) {
      const src = endpointId(edge.source);
      const tgt = endpointId(edge.target);
      if (degrees[src] !== undefined) degrees[src]++;
      if (degrees[tgt] !== undefined) degrees[tgt]++;
    }
    return degrees;
  }, [filteredGraph]);

  const handleNodeClick = useCallback(
    (node: SimNode) => {
      if (onNodeClick && node) {
        onNodeClick(node);
      }
    },
    [onNodeClick],
  );

  const handleNodeHover = useCallback((node: SimNode | null) => {
    setHoveredNodeId(node?.id ?? null);
    setHoveredNode(node);
  }, [setHoveredNode]);

  // ── Initial fit-to-view (runs once when the force simulation settles) ──
  // force-graph's default zoom (4 / ∛nodeCount) ignores the viewport and the
  // actual layout bounds, which is why the graph looks far too zoomed-out on
  // mobile. We compute a real fit from the bounding box + viewport size, and
  // zoom in tighter than a full fit on narrow screens so nodes stay legible.
  const handleEngineStop = useCallback(() => {
    const fg = graphRef.current;
    if (!fg || didInitialFitRef.current) return;

    // Measure the live container rather than the (possibly stale) state so
    // the fit is correct regardless of when the simulation settles.
    const container = containerRef.current;
    const vw = container?.clientWidth ?? dimensions.width;
    const vh = container?.clientHeight ?? dimensions.height;
    if (vw <= 0 || vh <= 0) return;

    let bbox: { x: [number, number]; y: [number, number] };
    try {
      bbox = fg.getGraphBbox();
    } catch {
      return;
    }

    const bw = bbox.x[1] - bbox.x[0];
    const bh = bbox.y[1] - bbox.y[0];
    const cx = (bbox.x[0] + bbox.x[1]) / 2;
    const cy = (bbox.y[0] + bbox.y[1]) / 2;

    const isNarrow = vw < MOBILE_BREAKPOINT;

    // Layout collapsed to a single point (or fully overlapping nodes) — just
    // centre it at a comfortable zoom.
    if (!isFinite(bw) || !isFinite(bh) || bw <= 0 || bh <= 0) {
      fg.centerAt(cx, cy, 0);
      fg.zoom(isNarrow ? 2 : 1, 0);
      didInitialFitRef.current = true;
      return;
    }

    // Viewport-relative padding: a fixed pixel padding would eat up most of a
    // narrow mobile viewport, so express it as a fraction of the screen.
    const padFraction = isNarrow ? 0.04 : 0.12;
    const padX = vw * padFraction;
    const padY = vh * padFraction;

    // Scale that would fit the *entire* graph inside the padded viewport.
    const fitScale = Math.min((vw - padX * 2) / bw, (vh - padY * 2) / bh);

    // Desktop: a proper fit-to-bounds is ideal. Mobile: a full fit squishes
    // everything into tiny illegible dots, so zoom in tighter (accepting that
    // some nodes start off-screen and the user pans to reach them).
    let targetScale = isNarrow ? fitScale * MOBILE_TIGHTEN_FACTOR : fitScale;

    // Clamp to a sane range: never below minZoom, never absurdly large.
    targetScale = Math.max(MIN_INIT_ZOOM, Math.min(targetScale, MAX_INIT_ZOOM));

    fg.centerAt(cx, cy, 0);
    fg.zoom(targetScale, 0);
    didInitialFitRef.current = true;
  }, [dimensions.width, dimensions.height]);

  // Compute the effective radius for a node, respecting simulation controls
  const getNodeRadius = useCallback(
    (kgNode: KGNode) => {
      const baseTypeRadius = NODE_RADIUS[kgNode.type] || 6;
      // Scale by the nodeSize control (default 5 → multiplier 1.0)
      const sizeMultiplier = simulationControls.nodeSize / 5;
      let radius = baseTypeRadius * sizeMultiplier;

      if (simulationControls.nodeSizeByConnections) {
        const degree = nodeDegrees[kgNode.id] ?? 0;
        radius = radius + Math.min(degree * 0.8, 8);
      }

      return Math.max(2, radius);
    },
    [simulationControls.nodeSize, simulationControls.nodeSizeByConnections, nodeDegrees],
  );

  const nodeCanvasObject = useCallback(
    (node: SimNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const kgNode: KGNode = node;
      const { x = 0, y = 0 } = node;
      const color = nodeColor(kgNode);
      const radius = getNodeRadius(kgNode);

      // Dimming when a node is hovered and this one isn't connected
      const isDimmed =
        connectedNodes !== null && !connectedNodes.has(kgNode.id);

      // Draw circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isDimmed
        ? color + '26' // ~15% alpha hex
        : color;
      ctx.fill();

      // Draw border
      ctx.strokeStyle = isDimmed
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = isDimmed ? 0.3 : 0.5 / globalScale;
      ctx.stroke();

      // Learned topics wear a thin outer ring — the map's "joined the core" mark.
      if (kgNode.type === 'topic' && (kgNode.mastery ?? 0) >= 2) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 2.5, 0, 2 * Math.PI);
        ctx.strokeStyle = isDimmed ? color + '26' : color + 'b3';
        ctx.lineWidth = Math.max(0.4, 1 / globalScale);
        ctx.stroke();
      }

      // Multi-course shared topics get a course-hue halo (the map's pie hint).
      if (kgNode.type === 'topic' && (kgNode.mastery ?? 0) < 2 && (kgNode.courseIds?.length ?? 0) > 1) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
        ctx.strokeStyle = isDimmed ? color + '1a' : color + '59';
        ctx.lineWidth = Math.max(0.4, 1 / globalScale);
        ctx.stroke();
      }

      // Label — only show when zoomed in enough or when highlighted
      const showLabel = globalScale > 0.8 || (!isDimmed && connectedNodes !== null);
      if (showLabel) {
        const label = kgNode.label;
        const fontSize = Math.max(8, 10 / globalScale);
        ctx.font = fontSize + 'px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isDimmed
          ? 'rgba(255,255,255,0.1)'
          : 'rgba(255,255,255,0.85)';
        ctx.fillText(label, x, y + radius + 2);
      }
    },
    [connectedNodes, getNodeRadius],
  );

  const nodePointerAreaPaint = useCallback(
    (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
      const kgNode: KGNode = node;
      const { x = 0, y = 0 } = node;
      const radius = getNodeRadius(kgNode);
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [getNodeRadius],
  );

  const getLinkColor = useCallback(
    (link: SimLink) => {
      const edgeType = link.type;
      const base = EDGE_COLORS[edgeType || ''] || 'rgba(148,163,184,0.2)';

      if (hoveredNodeId) {
        const src = endpointId(link.source);
        const tgt = endpointId(link.target);
        const isConnected = src === hoveredNodeId || tgt === hoveredNodeId;
        if (!isConnected) return 'rgba(148,163,184,0.05)';
      }
      return base;
    },
    [hoveredNodeId],
  );

  /** Cross-course links render dashed (the Topic Map's cross-course style). */
  const getLinkLineDash = useCallback(
    (link: SimLink) => (isCrossCourse(link) ? [4, 3] : null),
    [],
  );

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px]">
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeVal="val"
        nodeLabel="label"
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={nodePointerAreaPaint}
        linkColor={getLinkColor}
        linkLineDash={getLinkLineDash}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowColor="rgba(148,163,184,0.15)"
        linkWidth={0.5}
        linkVisibility={true}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onEngineStop={handleEngineStop}
        cooldownTicks={200}
        cooldownTime={simulationControls.cooldownTime}
        velocityDecay={simulationControls.velocityDecay}
        warmupTicks={10}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        minZoom={0.1}
        maxZoom={8}
      />
    </div>
  );
}
