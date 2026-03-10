export default function DashboardLoading() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{
          width: 180, height: 22, borderRadius: 6,
          background: 'rgba(255,255,255,0.06)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <div style={{
          width: 260, height: 14, borderRadius: 4,
          background: 'rgba(255,255,255,0.04)',
          animation: 'pulse 1.5s ease-in-out infinite',
          animationDelay: '0.2s',
          marginTop: 8,
        }} />
      </div>
      <div className="page-body">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16, marginBottom: 24,
        }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              background: 'var(--bg-card-solid)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 24, height: 110,
            }}>
              <div style={{
                width: 100, height: 12, borderRadius: 4,
                background: 'rgba(255,255,255,0.05)',
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`,
                marginBottom: 16,
              }} />
              <div style={{
                width: 60, height: 28, borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }} />
            </div>
          ))}
        </div>
        <div style={{
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 24, minHeight: 300,
        }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{
              display: 'flex', gap: 16, alignItems: 'center',
              padding: '14px 0',
              borderBottom: i < 5 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{
                  width: `${60 + i * 8}%`, height: 12, borderRadius: 4,
                  background: 'rgba(255,255,255,0.05)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.12}s`,
                  marginBottom: 8,
                }} />
                <div style={{
                  width: `${40 + i * 5}%`, height: 10, borderRadius: 4,
                  background: 'rgba(255,255,255,0.03)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.15}s`,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
