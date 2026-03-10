import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <div className="auth-page">
      {/* Animated background elements */}
      <div className="auth-bg">
        <div className="auth-bg-orb auth-bg-orb-1" />
        <div className="auth-bg-orb auth-bg-orb-2" />
        <div className="auth-bg-orb auth-bg-orb-3" />
        <div className="auth-bg-grid" />
      </div>

      <div className="auth-container">
        {/* Branding */}
        <div className="auth-brand">
          <div className="auth-logo">
            <svg viewBox="0 0 64 64" width={20} height={20}>
              <rect x="4" y="4" width="56" height="46" rx="14" fill="white" />
              <polygon points="18,50 28,50 20,60" fill="white" />
              <text x="32" y="37" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui" fontSize="32" fontWeight="800" fill="#7c3aed">G</text>
            </svg>
          </div>
          <div className="auth-brand-text">
            <h1>GetMention</h1>
            <p>Engagement Bot</p>
          </div>
        </div>

        {/* Tagline */}
        <p className="auth-tagline">
          AI-powered social engagement that drives real growth
        </p>

        {/* Clerk form */}
        <div className="auth-card">
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/signup"
            forceRedirectUrl="/dashboard"
          />
        </div>

        {/* Footer */}
        <div className="auth-footer">
          <p>Automate replies across Twitter, Reddit, Facebook, Quora & more</p>
        </div>
      </div>
    </div>
  );
}
