export type KGNodeType = 'document' | 'doctype' | 'tag' | 'course' | 'subject' | 'chat' | 'chapter';

export interface KGNode {
  id: string;           // prefixed: "doc:<id>", "type:pdf", "tag:seismology", "course:<id>", "subject:Physics"
  label: string;        // display name
  type: KGNodeType;     // determines color, icon, size
  parentId?: string;    // for document nodes: link back to original entity ID
  val?: number;         // node weight (affects force sim — higher = bigger)
}

export type KGEdgeType = 'is-type' | 'has-tag' | 'in-course' | 'has-subject' | 'related-chat' | 'is-chapter-of';

export interface KGEdge {
  source: string;
  target: string;
  label?: string;
  type: KGEdgeType;
}

export interface KGGraph {
  nodes: KGNode[];
  edges: KGEdge[];
}

export interface KGFilters {
  showDocuments: boolean;
  showDoctypes: boolean;
  showTags: boolean;
  showCourses: boolean;
  showSubjects: boolean;
  showChats: boolean;
  showChapters: boolean;
  searchQuery: string;
  /** When set, only nodes belonging to these courses are shown (undefined = all courses). */
  courseIds?: string[];
}

export interface KGSimulationControls {
  chargeStrength: number;         // repulsion between nodes (-500 to 0, default -100)
  linkDistance: number;           // desired link distance (10 to 300, default 60)
  linkStrength: number;          // link pull strength (0 to 1, default 0.5)
  centerStrength: number;        // gravity toward center (0 to 1, default 0.1)
  nodeSize: number;              // base node radius multiplier (2 to 20, default 5)
  nodeSizeByConnections: boolean; // scale node size by degree (default true)
  cooldownTime: number;          // sim cooldown in ms (1000 to 30000, default 10000)
  velocityDecay: number;         // friction/damping (0 to 1, default 0.3)
}
