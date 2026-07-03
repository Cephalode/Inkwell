/**
 * Local 2D-only shim for react-force-graph's ForceGraph2D component.
 *
 * react-force-graph's main entry eagerly imports all 4 variants (2D, 3D, VR, AR),
 * pulling in aframe, three.js, nipplejs, etc. This shim recreates ONLY the 2D
 * component by composing react-kapsule + force-graph directly — identical to what
 * react-force-graph does internally, but without the heavy 3D deps.
 */
import fromKapsule from 'react-kapsule';
import ForceGraphKapsule from 'force-graph';

/** Instance type exposed by the force-graph kapsule component. */
export type ForceGraphInstance = InstanceType<typeof ForceGraphKapsule>;

/**
 * Props accepted by the ForceGraph2D shim.  react-kapsule's inferred type
 * only captures `ref`; we widen the prop bag with an index signature so the
 * consumer can pass all force-graph props (graphData, callbacks, etc.)
 * through without per prop duplication.
 */
interface ForceGraph2DProps {
  ref?: React.Ref<ForceGraphInstance>;
  [key: string]: unknown;
}

// force-graph is a Kapsule-style component but ships class-based .d.ts;
// the `unknown` cast bridges the gap between the two type declarations.
const ForceGraph2D = fromKapsule(
  ForceGraphKapsule as unknown as Parameters<typeof fromKapsule>[0],
  {
    methodNames: [
      'emitParticle',
      'd3Force',
      'd3ReheatSimulation',
      'stopAnimation',
      'pauseAnimation',
      'resumeAnimation',
      'centerAt',
      'zoom',
      'zoomToFit',
      'getGraphBbox',
      'screen2GraphCoords',
      'graph2ScreenCoords',
    ],
  },
);

(ForceGraph2D as React.FC).displayName = 'ForceGraph2D';

export default ForceGraph2D as unknown as React.FC<ForceGraph2DProps>;
