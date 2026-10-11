import { create } from 'zustand';
import type { KGFilters, KGNode, KGSimulationControls } from '../types/knowledgeGraph';

interface KnowledgeGraphState {
  filters: KGFilters;
  selectedNode: KGNode | null;
  hoveredNode: KGNode | null;
  simulationControls: KGSimulationControls;
  setFilters: (filters: Partial<KGFilters>) => void;
  setSelectedNode: (node: KGNode | null) => void;
  setHoveredNode: (node: KGNode | null) => void;
  setSimulationControls: (controls: Partial<KGSimulationControls>) => void;
}

const defaultFilters: KGFilters = {
  showDocuments: true,
  showDoctypes: true,
  showTags: true,
  showCourses: true,
  showSubjects: true,
  showChats: false,
  showChapters: true,
  showTopics: true,
  showGuides: true,
  showDecks: true,
  searchQuery: '',
};

const defaultSimulationControls: KGSimulationControls = {
  chargeStrength: -100,
  linkDistance: 60,
  linkStrength: 0.5,
  centerStrength: 0.1,
  nodeSize: 5,
  nodeSizeByConnections: true,
  cooldownTime: 10000,
  velocityDecay: 0.3,
};

export const useKnowledgeGraphStore = create<KnowledgeGraphState>()((set) => ({
  filters: defaultFilters,
  selectedNode: null,
  hoveredNode: null,
  simulationControls: defaultSimulationControls,
  setFilters: (updates) => set((s) => ({ filters: { ...s.filters, ...updates } })),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setHoveredNode: (node) => set({ hoveredNode: node }),
  setSimulationControls: (updates) =>
    set((s) => ({ simulationControls: { ...s.simulationControls, ...updates } })),
}));
