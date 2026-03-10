'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2>Error</h2>
        <p>Something went wrong loading this page</p>
      </div>
      <div className="page-body">
        <div className="form-section" style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', textAlign: 'center',
          padding: 48, gap: 20,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <p style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>
              Something went wrong
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              {error.message || 'An unexpected error occurred.'}
            </p>
          </div>
          <button
            onClick={reset}
            className="btn btn-primary"
            style={{ padding: '9px 24px', fontSize: 13, fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
