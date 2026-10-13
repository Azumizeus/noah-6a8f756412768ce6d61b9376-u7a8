// src/components/EmptyState.tsx
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
  icon?: ReactNode;
};

export function EmptyState({ title, description, ctaLabel, onCta, icon }: EmptyStateProps) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.section
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel flex flex-col items-center justify-center px-6 py-12 text-center"
      aria-label="Aucun pact"
    >
      <div className="relative mb-5">
        {/* Halo diffus derrière l'icône */}
        <div
          aria-hidden="true"
          className="absolute -inset-6 rounded-full opacity-30 blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(153,69,255,0.4), transparent 70%)' }}
        />
        <div className="relative">{icon ?? <DefaultEmptyIcon />}</div>
      </div>

      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-ink-300">{description}</p>

      {ctaLabel && (
        <button
          type="button"
          onClick={onCta}
          aria-label={ctaLabel}
          className="btn-primary mt-6"
        >
          {ctaLabel}
        </button>
      )}
    </motion.section>
  );
}

function DefaultEmptyIcon() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      role="img"
      aria-label="Icône pact vide"
    >
      <rect x="6" y="6" width="60" height="60" rx="16" fill="#0A0A18" stroke="#9945FF" strokeOpacity="0.4" />
      <path
        d="M28 44V28h8a6 6 0 0 1 0 12h-4"
        stroke="#14F195"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="46" cy="28" r="3" fill="#FFD700" />
      <path
        d="M22 60c2-6 8-10 14-10s12 4 14 10"
        stroke="#9945FF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

export default EmptyState;
