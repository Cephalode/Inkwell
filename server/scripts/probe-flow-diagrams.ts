// One-off probe: does the model emit diagrams, and do they survive sanitization?
import { buildFlowLesson } from '../src/tutor.js';

const step = {
  id: 'probe',
  title: 'PCA: variance maximization',
  description: 'Principal component analysis finds directions of maximum variance.',
  objectives: ['Explain variance maximization', 'Relate eigenvectors to components'],
  keyPoints: ['PC1 maximizes variance', 'Components are orthogonal'],
} as unknown as Parameters<typeof buildFlowLesson>[0];

const out = await buildFlowLesson(step, 'Principal component analysis (PCA) transforms data to a new coordinate system. The first principal component is the direction along which the data varies most. Each subsequent component is orthogonal to the previous ones and captures the next-highest variance direction. Eigen-decomposition of the covariance matrix yields the components.');
for (const s of out.subjects) {
  console.log(s.id, s.title, '| diagram:', s.diagram ? `OK len=${s.diagram.length}` : 'MISSING', '| exDiagram:', s.exampleDiagram ? `OK len=${s.exampleDiagram.length}` : 'MISSING');
}
process.exit(0);
