import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0f',
      padding: 24,
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{
          fontSize: 72, fontWeight: 800, letterSpacing: '-4px',
          background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 12,
        }}>
          404
        </div>
        <h2 style={{
          color: '#e2e8f0', fontSize: 22, fontWeight: 700,
          margin: '0 0 8px', letterSpacing: '-0.3px',
        }}>
          Page not found
        </h2>
        <p style={{
          color: '#71717a', fontSize: 14, lineHeight: 1.6, margin: '0 0 28px',
        }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link
            href="/dashboard"
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #0ea5e9, #0ea5e9)',
              border: 'none', borderRadius: 10,
              color: 'white', fontSize: 14, fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 2px 12px rgba(14, 165, 233, 0.3)',
            }}
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            style={{
              padding: '10px 24px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              color: '#a1a1aa', fontSize: 14, fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
