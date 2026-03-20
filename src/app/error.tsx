'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0f',
      padding: 24,
    }}>
      <div style={{
        maxWidth: 480,
        textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, margin: '0 auto 24px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 style={{
          color: '#e2e8f0', fontSize: 22, fontWeight: 700,
          margin: '0 0 8px', letterSpacing: '-0.3px',
        }}>
          Something went wrong
        </h2>
        <p style={{
          color: '#71717a', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px',
        }}>
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #0ea5e9, #0ea5e9)',
              border: 'none', borderRadius: 10,
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(14, 165, 233, 0.3)',
            }}
          >
            Try again
          </button>
          <a
            href="/dashboard"
            style={{
              padding: '10px 24px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              color: '#a1a1aa', fontSize: 14, fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center',
            }}
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
