// src/components/pact/VaultShareGauge.tsx
// ─────────────────────────────────────────────────────────────
// Jauge liquide : TA part du vault total (BuildPact n'a pas de
// plafond/cible on-chain — le vault est un escrow ouvert).
// Fill % = ta share_bps / 100.
// ─────────────────────────────────────────────────────────────
import { formatSol } from '../../lib/pacts';

interface Props {
  vaultBalanceSol: number;
  myShareBps: number;
  myClaimableSol: number;
}

export default function VaultShareGauge({ vaultBalanceSol, myShareBps, myClaimableSol }: Props) {
  const pct = Math.min(100, Math.round(myShareBps / 100));
  const hasShare = myShareBps > 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative h-48 w-full max-w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-white/5"
        style={{ transform: 'translateZ(0)' }}
        role="img"
        aria-label={
          hasShare
            ? `Ta part : ${pct}% du vault, soit ${formatSol(myClaimableSol)} SOL sur ${formatSol(vaultBalanceSol)} SOL au total`
            : `Vault total : ${formatSol(vaultBalanceSol)} SOL — tu n'es pas membre de ce pact`
        }
      >
        <div
          className="absolute bottom-0 left-0 right-0 bg-accent-neon/25 transition-[height] duration-1000 ease-out"
          style={{ height: `${hasShare ? pct : 0}%` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {hasShare ? (
            <>
              <span className="font-mono text-3xl font-bold text-white drop-shadow-lg">{pct}%</span>
              <span className="mt-1 font-mono text-[11px] text-ink-200 drop-shadow">
                {formatSol(myClaimableSol)} / {formatSol(vaultBalanceSol)} SOL
              </span>
            </>
          ) : (
            <span className="font-mono text-sm text-ink-300">
              Vault : {formatSol(vaultBalanceSol)} SOL
            </span>
          )}
        </div>
      </div>
      <p className="text-center text-[11px] text-ink-400">
        {hasShare ? 'Ta part du vault total' : 'Vault ouvert — pas de plafond de financement'}
      </p>
    </div>
  );
}
