// src/components/pact/OrbitalCapTable.tsx
// ─────────────────────────────────────────────────────────────
// Répartition des parts en orbite autour du pact. Respecte
// prefers-reduced-motion (rotation désactivée si demandé).
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import type { ChainMember } from '../../lib/pacts';
import { formatAddress } from '../../lib/pacts';

interface Props {
  members: ChainMember[];
  creatorWallet: string;
  myWallet?: string;
}

const AVATAR_COLORS = ['#8B5CF6', '#34D399', '#F59E0B', '#EC4899', '#3B82F6', '#EF4444'];

function useReducedMotionLocal(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export default function OrbitalCapTable({ members, creatorWallet, myWallet }: Props) {
  const reduced = useReducedMotionLocal();
  const n = members.length;
  const radius = n <= 4 ? 100 : 120;

  if (n === 0) return null;

  return (
    <div
      className="relative mx-auto select-none"
      style={{ width: 280, height: 280, transform: 'translateZ(0)' }}
      role="img"
      aria-label={`Répartition des parts : ${members
        .map((m) => `${formatAddress(m.wallet.toBase58())} ${(m.shareBps / 100).toFixed(0)}%`)
        .join(', ')}`}
    >
      <div className="absolute inset-[8px] rounded-full border border-accent-violet/25" />
      <div className="absolute inset-[32px] rounded-full border border-dashed border-accent-violet/10" />

      <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-accent-violet/40 bg-accent-violet/15 text-center">
        <span className="font-mono text-base font-bold text-accent-neon">{n}</span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-ink-300">
          {n > 1 ? 'membres' : 'membre'}
        </span>
      </div>

      <div
        className={`absolute inset-0 ${reduced ? '' : 'animate-[spin_28s_linear_infinite]'}`}
        style={{ transform: 'translateZ(0)' }}
      >
        {members.map((m, i) => {
          const angle = (360 / n) * i;
          const addr = m.wallet.toBase58();
          const isMe = addr === myWallet;
          const isCreator = addr === creatorWallet;
          return (
            <div
              key={addr}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(-${angle}deg)`,
              }}
            >
              <div
                className={reduced ? '' : 'animate-[spin_28s_linear_infinite] [animation-direction:reverse]'}
                style={{ transform: 'translateZ(0)' }}
              >
                <div className="glass-panel flex w-20 flex-col items-center gap-1 !p-2.5 transition-colors hover:border-accent-neon/50">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-ink-900"
                    style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                  >
                    {addr.slice(0, 1)}
                  </div>
                  <span className="font-mono text-[10px] text-white">
                    {formatAddress(addr)}
                    {isCreator && ' 👑'}
                  </span>
                  {isMe && <span className="text-[9px] text-accent-violet">(toi)</span>}
                  <span className="font-mono text-xs font-bold text-accent-neon">
                    {(m.shareBps / 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
