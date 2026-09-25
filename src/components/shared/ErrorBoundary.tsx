import { Component, ReactNode } from 'react';
import { HOME } from '../../config/home';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const RECOVERY_FLAG = 'chunk-recovery-attempted';

/** A deploy swapped the hashed bundles out from under an open tab, so a lazy
 *  page's chunk (e.g. LearnStepPage-DMJAGuBQ.js) no longer exists on the server.
 *  Vite/React surface this as an import failure; a full reload picks up the fresh
 *  index.html and its assets, so we bounce back to the roadmap instead of leaving
 *  a dead error screen. */
function isChunkLoadError(error: Error | null): boolean {
  const msg = error?.message || '';
  return (
    error?.name === 'ChunkLoadError' ||
    /failed to fetch dynamically imported module|loading chunk \d+ failed|importing a module script failed|error loading dynamically imported module/i.test(msg)
  );
}

function attemptedRecovery(): boolean {
  try {
    if (sessionStorage.getItem(RECOVERY_FLAG)) return true;
    sessionStorage.setItem(RECOVERY_FLAG, '1');
  } catch {
    /* private mode — treat as already-attempted so we never loop */
    return true;
  }
  return false;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Stale-tab chunk failure: one silent recovery — fresh load on the roadmap.
    // The flag keeps a genuinely broken deploy from redirect-looping.
    if (isChunkLoadError(error) && !attemptedRecovery()) {
      window.location.replace(HOME);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="text-6xl mb-4">😵</div>
          <h2 className="mb-2" style={{ fontSize: 20 }}>Something went wrong</h2>
          <p className="max-w-md text-center mb-4" style={{ fontSize: 14, opacity: 0.6 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn btn-primary"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.assign(HOME)}
              className="btn"
            >
              Back to roadmap
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
