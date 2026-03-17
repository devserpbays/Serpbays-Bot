import { TaskResetPassword } from '@clerk/nextjs';
import Link from 'next/link';

export default function ResetPasswordPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#09090b] overflow-hidden">

      {/* Background glow orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.15)_0%,transparent_65%)] blur-[40px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.08)_0%,transparent_70%)] blur-[60px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,black_30%,transparent_70%)]" />
      </div>

      {/* Nav bar */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[rgba(9,9,11,0.85)] border-b border-white/[0.04]">
        <nav className="max-w-[1140px] mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-white no-underline text-lg font-extrabold tracking-tight">
            <span className="w-8 h-8 rounded-[10px] bg-[#7c3aed] inline-flex items-center justify-center">
              <svg viewBox="0 0 64 64" width="16" height="16">
                <rect x="4" y="4" width="56" height="46" rx="14" fill="white" />
                <polygon points="18,50 28,50 20,60" fill="white" />
                <text x="32" y="37" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui" fontSize="32" fontWeight="800" fill="#7c3aed">G</text>
              </svg>
            </span>
            GetMention
          </Link>
          <Link href="/login" className="text-[#a1a1aa] no-underline text-sm font-medium hover:text-white transition-colors">
            Back to Sign In
          </Link>
        </nav>
      </header>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 pt-24 pb-12 w-full max-w-md animate-[authSlideUp_0.5s_ease-out]">

        {/* Logo + brand */}
        <div className="flex items-center gap-3.5 mb-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] flex items-center justify-center shadow-[0_0_40px_rgba(124,58,237,0.35),0_0_80px_rgba(124,58,237,0.15)]">
            <svg viewBox="0 0 64 64" width={20} height={20}>
              <rect x="4" y="4" width="56" height="46" rx="14" fill="white" />
              <polygon points="18,50 28,50 20,60" fill="white" />
              <text x="32" y="37" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui" fontSize="32" fontWeight="800" fill="#7c3aed">G</text>
            </svg>
          </div>
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-white leading-none m-0">GetMention</h1>
            <p className="text-[#71717a] text-xs font-medium uppercase tracking-widest mt-1 m-0">Engagement Bot</p>
          </div>
        </div>

        {/* Tagline */}
        <p className="text-[#71717a] text-[15px] text-center max-w-[340px] leading-relaxed mb-8">
          Reset your password to regain access to your account
        </p>

        {/* Clerk reset password card */}
        <div className="relative w-full rounded-2xl bg-[#131316] border border-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-1">
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[rgba(124,58,237,0.15)] to-transparent -z-10 pointer-events-none" />
          <TaskResetPassword
            redirectUrlComplete="/dashboard"
          />
        </div>

        {/* Footer */}
        <p className="mt-8 text-[#52525b] text-xs text-center">
          Remember your password?{' '}
          <Link href="/login" className="text-[#a78bfa] hover:text-[#c4b5fd] transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
