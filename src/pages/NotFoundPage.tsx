import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="card-kicker" style={{ fontSize: 13 }}>Error 404</div>
      <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Page not found</h1>
      <p className="text-sm" style={{ opacity: 0.6, margin: 0 }}>
        The page you're looking for doesn't exist or was moved.
      </p>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 'var(--space-6)' }}>
        Back to dashboard
      </Link>
    </div>
  );
}
