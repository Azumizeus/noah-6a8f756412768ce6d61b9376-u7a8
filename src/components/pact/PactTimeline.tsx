// src/components/pact/PactTimeline.tsx
// ─────────────────────────────────────────────────────────────
// Frise visuelle du statut on-chain — dérivée des données déjà
// chargées (members, status, vaultBalanceSol) + reçu local.
// ─────────────────────────────────────────────────────────────
import type { Pact } from '../../types/pact';

interface Props {
  pact: Pact;
  hasReceipt: boolean;
}

const STEPS_FR = ['Créé', 'Membres', 'Approuvé', 'Finalisé', 'Financé', 'Distribué'];

function currentStepIndex(pact: Pact, hasReceipt: boolean): number {
  if (hasReceipt) return 5;
  if (pact.status === 'active' && pact.vaultBalanceSol > 0) return 4;
  if (pact.status === 'active') return 3;
  const allApproved = pact.members.length > 0 && pact.members.every((m) => m.approved);
  if (allApproved) return 2;
  if (pact.members.length > 0) return 1;
  return 0;
}

export default function PactTimeline({ pact, hasReceipt }: Props) {
  const current = currentStepIndex(pact, hasReceipt);

  return (
    <ol
      className="flex flex-wrap items-center gap-y-3"
      aria-label={`Statut du pact : étape ${current + 1} sur ${STEPS_FR.length}`}
    >
      {STEPS_FR.map((step, i) => {
        const done = i < current;
        const isCurrent = i === current;
        return (
          <li key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5 min-w-[64px]">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[11px] font-bold transition-colors ${
                  done
                    ? 'border-accent-neon bg-accent-neon/20 text-accent-neon'
                    : isCurrent
                      ? 'border-accent-violet bg-accent-violet/25 text-white animate-pulse'
                      : 'border-white/10 bg-white/5 text-ink-400'
                }`}
                aria-current={isCurrent ? 'step' : undefined}
                style={{ transform: 'translateZ(0)' }}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                className={`text-center text-[10px] font-mono uppercase tracking-wider ${
                  done ? 'text-accent-neon' : isCurrent ? 'text-white' : 'text-ink-400'
                }`}
              >
                {step}
              </span>
            </div>
            {i < STEPS_FR.length - 1 && (
              <div
                className={`mx-1 mb-5 h-px w-6 sm:w-8 ${i < current ? 'bg-accent-neon/60' : 'bg-white/10'}`}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
