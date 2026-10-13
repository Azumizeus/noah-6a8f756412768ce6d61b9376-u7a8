// src/components/PactListRow.tsx
// ═══════════════════════════════════════════════════════════════════
// Ligne dense « 1 ligne = 1 pact » — le mode liste introduit à la Phase 2
// de la refonte premium. Mêmes données que les cartes, mise en page
// compacte. Toute la ligne est cliquable en plus du bouton secondaire,
// cible tactile ≥ 36px.
// ═══════════════════════════════════════════════════════════════════
import type { ReactNode } from 'react';

export interface PactListRowProps {
  /** Logo projet — repli : première lettre du titre sur fond dégradé déterministe. */
  logo?: string | null;
  seed: string; // PDA — clé & fallback du dégradé
  title: string;
  meta?: string;
  /** Colonne % — ex « 50 % libre » ou share du créateur. */
  figure?: string;
  /** Pilille de statut (couleur gérée par le parent). */
  pill?: ReactNode;
  href: string;
  onApply?: () => void;
  applyLabel?: string;
}

function fallbackStyle(seed: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return { background: `linear-gradient(135deg, hsl(${hash % 360} 70% 22%), hsl(${(hash + 60) % 360} 60% 15%))` };
}

export function PactListRow({ logo, seed, title, meta, figure, pill, href, onApply, applyLabel }: PactListRowProps) {
  return (
    <a
      href={href}
      className="group flex min-h-[44px] items-center gap-3 border-b border-white/5 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-violet"
    >
      {logo ? (
        <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-white/10 object-cover" />
      ) : (
        <span
          aria-hidden="true"
          style={fallbackStyle(seed)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 font-mono text-sm font-bold uppercase text-white/70"
        >
          {title.replace(/[#*]/g, '').trim().charAt(0)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm font-semibold text-white">{title}</b>
        {meta && <span className="block truncate text-[11px] text-ink-400">{meta}</span>}
      </span>
      {figure && <span className="w-16 shrink-0 text-right font-mono text-xs text-ink-300">{figure}</span>}
      {pill}
      {onApply ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onApply();
          }}
          className="shrink-0 rounded-lg bg-accent-violet px-3 py-1.5 text-[11px] font-semibold text-ink-900 transition hover:bg-accent-violet/90"
        >
          {applyLabel}
        </button>
      ) : (
        <span aria-hidden="true" className="shrink-0 px-2 text-ink-400 transition group-hover:text-accent-violet">›</span>
      )}
    </a>
  );
}

export default PactListRow;
