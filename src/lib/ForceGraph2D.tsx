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

// force-graph is a Kapsule-style component but ships class-based .d.ts;
// the `as any` cast bridges the gap between the two type declarations.
const ForceGraph2D = fromKapsule(
  ForceGraphKapsule as any,
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

export default ForceGraph2D;
