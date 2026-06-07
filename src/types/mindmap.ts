export interface MindMapNode {
  id: string;
  label: string;
  group?: string;
}

export interface MindMapEdge {
  source: string;
  target: string;
  label?: string;
}
