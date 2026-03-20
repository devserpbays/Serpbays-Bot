'use client';

import Link from 'next/link';

export default function UpgradeBanner({
  message,
  compact = false
}: {
  message: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px',
        background: 'rgba(14, 165, 233, 0.08)',
        border: '1px solid rgba(14, 165, 233, 0.2)',
        borderRadius: 8,
        fontSize: 12.5,
        color: '#38bdf8',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <span style={{ flex: 1 }}>{message}</span>
        <Link href="/dashboard/billing" style={{
          color: '#c4b5fd',
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}>
          Upgrade
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 20px',
      background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(37, 99, 235, 0.08))',
      border: '1px solid rgba(14, 165, 233, 0.25)',
      borderRadius: 12,
      marginBottom: 20,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: 'rgba(14, 165, 233, 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>
          Plan limit reached
        </p>
        <p style={{ color: '#a1a1aa', fontSize: 13, margin: 0 }}>
          {message}
        </p>
      </div>
      <Link href="/dashboard/billing" style={{
        padding: '8px 20px',
        background: 'linear-gradient(135deg, #0ea5e9, #0ea5e9)',
        borderRadius: 8,
        color: 'white',
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)',
      }}>
        Upgrade Plan
      </Link>
    </div>
  );
}
