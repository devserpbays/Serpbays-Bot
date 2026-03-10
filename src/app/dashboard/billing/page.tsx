'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

/* ── Plan definitions ─────────────────────────────────────────── */
interface PlanDef {
    id: string;
    name: string;
    price: number;
    priceId: string;
    platforms: number;
    postsPerDay: number;
    keywords: number;
    features: string[];
}

const PLANS: PlanDef[] = [
    {
        id: 'starter',
        name: 'Starter',
        price: 0,
        priceId: '',
        platforms: 1,
        postsPerDay: 3,
        keywords: 5,
        features: [
            '1 platform connected',
            '3 posts per day',
            '5 keywords tracked',
            'Basic AI replies',
            'Community support',
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: 49,
        priceId: '',
        platforms: 3,
        postsPerDay: 15,
        keywords: 25,
        features: [
            '3 platforms connected',
            '15 posts per day',
            '25 keywords tracked',
            'Advanced AI replies',
            'Priority support',
            'Custom prompt templates',
        ],
    },
    {
        id: 'business',
        name: 'Business',
        price: 149,
        priceId: '',
        platforms: 6,
        postsPerDay: 50,
        keywords: 100,
        features: [
            '6 platforms connected',
            '50 posts per day',
            '100 keywords tracked',
            'Premium AI replies',
            'Dedicated support',
            'Custom prompt templates',
            'API access',
            'Team collaboration',
        ],
    },
];

/* ── Types ────────────────────────────────────────────────────── */
interface UsageData {
    connectedPlatforms: number;
    totalPostsToday: number;
    totalKeywords: number;
}

interface PlanData {
    plan: string;
    status: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
}

/* ── Helpers ──────────────────────────────────────────────────── */
function getPlanDef(planId: string): PlanDef {
    return PLANS.find((p) => p.id === planId) ?? PLANS[0];
}

function formatDate(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

/* ── Component ────────────────────────────────────────────────── */
export default function BillingPage() {
    return (
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div style={{ width: 32, height: 32, border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>}>
            <BillingContent />
        </Suspense>
    );
}

function BillingContent() {
    const searchParams = useSearchParams();
    const success = searchParams.get('success') === 'true';
    const canceled = searchParams.get('canceled') === 'true';

    const [usage, setUsage] = useState<UsageData | null>(null);
    const [plan, setPlan] = useState<PlanData | null>(null);
    const [loading, setLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

    /* Show toast from URL params */
    useEffect(() => {
        if (success) {
            setToast({ type: 'success', message: 'Your subscription has been updated successfully!' });
        } else if (canceled) {
            setToast({ type: 'info', message: 'Checkout was canceled. No changes were made.' });
        }
    }, [success, canceled]);

    /* Auto-dismiss toast */
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 6000);
        return () => clearTimeout(t);
    }, [toast]);

    /* Fetch data */
    const fetchData = useCallback(async () => {
        try {
            const [usageRes, planRes] = await Promise.all([
                fetch('/api/billing/usage'),
                fetch('/api/billing/plan'),
            ]);
            if (usageRes.ok) {
                const data = await usageRes.json();
                setUsage(data.usage ?? data);
            }
            if (planRes.ok) setPlan(await planRes.json());
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /* Actions */
    const handleManageSubscription = async () => {
        setPortalLoading(true);
        try {
            const res = await fetch('/api/billing/create-portal', { method: 'POST' });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } catch {
            /* silent */
        } finally {
            setPortalLoading(false);
        }
    };

    const handleUpgrade = async (planDef: PlanDef) => {
        setCheckoutLoading(planDef.id);
        try {
            const res = await fetch('/api/billing/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId: planDef.priceId, planId: planDef.id }),
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } catch {
            /* silent */
        } finally {
            setCheckoutLoading(null);
        }
    };

    const currentPlan = getPlanDef(plan?.plan ?? 'starter');

    /* ── Render ───────────────────────────────────────────────────── */
    return (
        <div className="animate-fade-in">
            {/* Toast */}
            {toast && (
                <div
                    style={{
                        position: 'fixed',
                        top: 24,
                        right: 24,
                        zIndex: 100,
                        padding: '14px 22px',
                        borderRadius: 'var(--radius-md)',
                        background: toast.type === 'success'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(99, 102, 241, 0.12)',
                        border: `1px solid ${toast.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                        color: toast.type === 'success' ? '#34d399' : '#a5b4fc',
                        fontSize: 14,
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        backdropFilter: 'blur(12px)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        animation: 'fadeIn 0.3s ease',
                    }}
                >
                    <span style={{ fontSize: 18 }}>
                        {toast.type === 'success' ? '\u2713' : '\u2139'}
                    </span>
                    {toast.message}
                    <button
                        onClick={() => setToast(null)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'inherit',
                            cursor: 'pointer',
                            marginLeft: 8,
                            opacity: 0.6,
                            fontSize: 16,
                        }}
                    >
                        \u2715
                    </button>
                </div>
            )}

            {/* Page Header */}
            <div className="page-header">
                <h2>Billing &amp; Plan</h2>
                <p>Manage your subscription and monitor usage</p>
            </div>

            <div className="page-body">
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                border: '3px solid var(--border-subtle)',
                                borderTopColor: 'var(--accent)',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }}
                        />
                    </div>
                ) : (
                    <>
                        {/* ── Current Plan Card ──────────────────────────── */}
                        <div className="form-section" style={{ marginBottom: 28 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: 20,
                                }}
                            >
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                        <h3
                                            style={{
                                                fontSize: 18,
                                                fontWeight: 700,
                                                color: 'var(--text-primary)',
                                                margin: 0,
                                            }}
                                        >
                                            Current Plan
                                        </h3>
                                        <span
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                padding: '3px 12px',
                                                borderRadius: 20,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                                background:
                                                    currentPlan.id === 'business'
                                                        ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(236,72,153,0.2))'
                                                        : currentPlan.id === 'pro'
                                                          ? 'rgba(124,58,237,0.15)'
                                                          : 'rgba(113,113,122,0.15)',
                                                color:
                                                    currentPlan.id === 'business'
                                                        ? '#e879f9'
                                                        : currentPlan.id === 'pro'
                                                          ? '#a78bfa'
                                                          : '#a1a1aa',
                                                border: `1px solid ${
                                                    currentPlan.id === 'business'
                                                        ? 'rgba(232,121,249,0.25)'
                                                        : currentPlan.id === 'pro'
                                                          ? 'rgba(167,139,250,0.25)'
                                                          : 'rgba(161,161,170,0.15)'
                                                }`,
                                            }}
                                        >
                                            {currentPlan.name}
                                        </span>
                                    </div>

                                    {/* Status */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <span
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: '50%',
                                                background:
                                                    plan?.status === 'active'
                                                        ? '#10b981'
                                                        : plan?.status === 'past_due'
                                                          ? '#f59e0b'
                                                          : '#ef4444',
                                            }}
                                        />
                                        <span
                                            style={{
                                                fontSize: 13,
                                                color: 'var(--text-secondary)',
                                                textTransform: 'capitalize',
                                            }}
                                        >
                                            {plan?.status ?? 'Active'}
                                        </span>
                                    </div>

                                    {/* Billing period */}
                                    {currentPlan.price > 0 && plan?.currentPeriodEnd && (
                                        <p
                                            style={{
                                                fontSize: 13,
                                                color: 'var(--text-muted)',
                                                margin: '4px 0 0',
                                            }}
                                        >
                                            Next billing: {formatDate(plan.currentPeriodEnd)}
                                        </p>
                                    )}

                                    {plan?.cancelAtPeriodEnd && (
                                        <p
                                            style={{
                                                fontSize: 13,
                                                color: '#f59e0b',
                                                margin: '6px 0 0',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="8" x2="12" y2="12" />
                                                <line x1="12" y1="16" x2="12.01" y2="16" />
                                            </svg>
                                            Cancels at end of billing period
                                        </p>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                                    {currentPlan.price > 0 && (
                                        <button
                                            className="btn"
                                            onClick={handleManageSubscription}
                                            disabled={portalLoading}
                                            style={{
                                                background: 'rgba(255,255,255,0.06)',
                                                border: '1px solid var(--border-subtle)',
                                                color: 'var(--text-secondary)',
                                                padding: '9px 18px',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: 13,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {portalLoading ? 'Loading...' : 'Manage Subscription'}
                                        </button>
                                    )}
                                    {currentPlan.id !== 'business' && (
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => {
                                                const section = document.getElementById('plan-comparison');
                                                section?.scrollIntoView({ behavior: 'smooth' });
                                            }}
                                            style={{
                                                padding: '9px 18px',
                                                fontSize: 13,
                                                fontWeight: 600,
                                            }}
                                        >
                                            Upgrade
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── Usage Section ──────────────────────────────── */}
                        <div className="form-section" style={{ marginBottom: 28 }}>
                            <h3 className="form-section-title">Usage</h3>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                    gap: 16,
                                }}
                            >
                                <UsageMeter
                                    label="Platforms Connected"
                                    current={usage?.connectedPlatforms ?? 0}
                                    max={currentPlan.platforms}
                                    color="#7c3aed"
                                />
                                <UsageMeter
                                    label="Posts Today"
                                    current={usage?.totalPostsToday ?? 0}
                                    max={currentPlan.postsPerDay}
                                    color="#3b82f6"
                                    suffix="per platform limit"
                                />
                                <UsageMeter
                                    label="Keywords"
                                    current={usage?.totalKeywords ?? 0}
                                    max={currentPlan.keywords}
                                    color="#10b981"
                                />
                            </div>
                        </div>

                        {/* ── Plan Comparison ────────────────────────────── */}
                        <div className="form-section" id="plan-comparison">
                            <h3 className="form-section-title">Plans</h3>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                    gap: 20,
                                }}
                            >
                                {PLANS.map((p) => {
                                    const isCurrent = currentPlan.id === p.id;
                                    const isUpgrade = PLANS.indexOf(p) > PLANS.indexOf(currentPlan);
                                    const isPopular = p.id === 'pro';
                                    return (
                                        <div
                                            key={p.id}
                                            style={{
                                                position: 'relative',
                                                background: isCurrent
                                                    ? 'linear-gradient(180deg, rgba(124,58,237,0.08) 0%, var(--bg-card-solid) 100%)'
                                                    : 'var(--bg-card-solid)',
                                                border: `1px solid ${isCurrent ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                                                borderRadius: 'var(--radius-md)',
                                                padding: 28,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                transition: 'border-color 0.2s, box-shadow 0.2s',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isCurrent) e.currentTarget.style.borderColor = 'var(--border-hover)';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isCurrent) e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                            }}
                                        >
                                            {/* Popular badge */}
                                            {isPopular && (
                                                <span
                                                    style={{
                                                        position: 'absolute',
                                                        top: -10,
                                                        right: 20,
                                                        padding: '3px 12px',
                                                        borderRadius: 20,
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.05em',
                                                        background: 'var(--gradient-primary)',
                                                        color: '#fff',
                                                    }}
                                                >
                                                    Popular
                                                </span>
                                            )}

                                            {/* Plan name */}
                                            <h4
                                                style={{
                                                    fontSize: 16,
                                                    fontWeight: 700,
                                                    color: 'var(--text-primary)',
                                                    margin: '0 0 4px',
                                                }}
                                            >
                                                {p.name}
                                            </h4>

                                            {/* Price */}
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20 }}>
                                                <span
                                                    style={{
                                                        fontSize: 36,
                                                        fontWeight: 800,
                                                        color: 'var(--text-primary)',
                                                        letterSpacing: '-0.03em',
                                                    }}
                                                >
                                                    ${p.price}
                                                </span>
                                                {p.price > 0 && (
                                                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/mo</span>
                                                )}
                                                {p.price === 0 && (
                                                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>forever</span>
                                                )}
                                            </div>

                                            {/* Features */}
                                            <ul
                                                style={{
                                                    listStyle: 'none',
                                                    padding: 0,
                                                    margin: '0 0 24px',
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 10,
                                                }}
                                            >
                                                {p.features.map((f) => (
                                                    <li
                                                        key={f}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 10,
                                                            fontSize: 13,
                                                            color: 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        <svg
                                                            width="16"
                                                            height="16"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke={isCurrent ? 'var(--accent-light)' : '#10b981'}
                                                            strokeWidth="2.5"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <polyline points="20 6 9 17 4 12" />
                                                        </svg>
                                                        {f}
                                                    </li>
                                                ))}
                                            </ul>

                                            {/* Action */}
                                            {isCurrent ? (
                                                <div
                                                    style={{
                                                        textAlign: 'center',
                                                        padding: '10px 0',
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        color: 'var(--accent-light)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        background: 'var(--accent-bg)',
                                                        border: '1px solid var(--accent-border)',
                                                    }}
                                                >
                                                    Current Plan
                                                </div>
                                            ) : isUpgrade ? (
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={() => handleUpgrade(p)}
                                                    disabled={checkoutLoading === p.id}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 0',
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {checkoutLoading === p.id ? 'Redirecting...' : `Upgrade to ${p.name}`}
                                                </button>
                                            ) : (
                                                <div
                                                    style={{
                                                        textAlign: 'center',
                                                        padding: '10px 0',
                                                        fontSize: 13,
                                                        fontWeight: 600,
                                                        color: 'var(--text-muted)',
                                                    }}
                                                >
                                                    &mdash;
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ── Usage Meter Sub-component ────────────────────────────────── */
function UsageMeter({
    label,
    current,
    max,
    color,
    suffix,
}: {
    label: string;
    current: number;
    max: number;
    color: string;
    suffix?: string;
}) {
    const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
    const isNearLimit = pct >= 80;
    const barColor = isNearLimit ? '#f59e0b' : color;

    return (
        <div
            style={{
                background: 'var(--bg-card-solid)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 20,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 10,
                }}
            >
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {label}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {suffix && <span style={{ fontSize: 11, marginRight: 4 }}>{suffix}</span>}
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {current}
                </span>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ {max}</span>
            </div>
            {/* Progress bar */}
            <div
                style={{
                    width: '100%',
                    height: 6,
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 3,
                        background: barColor,
                        transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                />
            </div>
        </div>
    );
}
