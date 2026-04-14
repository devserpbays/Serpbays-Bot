'use client';

import { useEffect, useRef } from 'react';

export default function HeroSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let lastX = 0;
    let lastY = 0;

    function apply() {
      raf = 0;
      const el2 = ref.current;
      if (!el2) return;
      const r = el2.getBoundingClientRect();
      el2.style.setProperty('--lp-x', `${lastX - r.left}px`);
      el2.style.setProperty('--lp-y', `${lastY - r.top}px`);
    }
    function onMove(e: MouseEvent) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    }

    document.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      document.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        background:
          'radial-gradient(600px circle at var(--lp-x, 50%) var(--lp-y, 30%), rgba(14,165,233,0.12), transparent 55%)',
        transition: 'background 0.08s linear',
      }}
    />
  );
}
