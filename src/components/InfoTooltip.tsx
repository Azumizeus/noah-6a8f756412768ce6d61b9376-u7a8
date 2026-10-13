// src/components/InfoTooltip.tsx
// Bulle d'aide « ? » positionnée en PORTAIL sur document.body, pas en
// enfant du bouton. C'est la seule façon de sortir des `overflow-hidden`
// et des contextes d'empilement des modales : en enfant, la bulle serait
// rognée au bord du panneau de réglages, ou passerait sous lui.
//
// Conséquence directe : la position doit être calculée à la main
// (getBoundingClientRect + coordonnées `fixed`), puisqu'un portail perd
// tout lien de mise en page avec son déclencheur.
import { useId, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  text: string;
  id?: string;
  className?: string;
}

const TOOLTIP_WIDTH = 224;
const GAP = 6;
const EDGE_MARGIN = 8;
/** Délai avant fermeture au mouseleave. Sans lui, le trajet du curseur du
 *  bouton vers la bulle (6 px de vide) la ferait disparaître — elle serait
 *  donc impossible à survoler, et son texte impossible à sélectionner. */
const CLOSE_DELAY = 250;

export function InfoTooltip({ text, id, className = '' }: Props) {
  const autoId = useId();
  const tooltipId = id ?? autoId;
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `coords === null` sert aussi d'état « fermé » : un seul état pour la
  // visibilité et la position, impossible de les désynchroniser.
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const center = r.left + r.width / 2;
    // Centrage sur le bouton, puis bridage aux deux bords : une aide
    // déclenchée en fin de ligne dépasserait à droite et forcerait un
    // scroll horizontal sur toute la page.
    const left = Math.min(
      Math.max(center - TOOLTIP_WIDTH / 2, EDGE_MARGIN),
      window.innerWidth - TOOLTIP_WIDTH - EDGE_MARGIN
    );
    setCoords({ left, top: r.bottom + GAP });
  }, []);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const open = () => {
    cancelClose();
    place();
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setCoords(null), CLOSE_DELAY);
  };

  const closeNow = () => {
    cancelClose();
    setCoords(null);
  };

  // Au scroll/resize on FERME au lieu de repositionner : les coordonnées
  // sont `fixed` et figées au moment de l'ouverture, donc la bulle
  // resterait collée à l'écran pendant que son bouton défile. Fermer est
  // aussi moins coûteux que recalculer à chaque frame de scroll.
  // `capture: true` est indispensable — le scroll réel se produit dans un
  // conteneur interne (panneau de réglages), et un événement de scroll ne
  // remonte pas jusqu'à window en phase de bouillonnement.
  useLayoutEffect(() => {
    if (!coords) return;
    const onScroll = () => closeNow();
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  return (
    <span className={`inline-flex ${className}`}>
      <button
        ref={btnRef}
        type="button"
        // `aria-describedby` et non `aria-label` : l'aide DÉCRIT le réglage
        // voisin, elle ne nomme pas le bouton. Posé en permanence, même
        // bulle fermée — les lecteurs d'écran résolvent la référence au
        // moment du focus.
        aria-describedby={tooltipId}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={open}
        onBlur={closeNow}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[10px] font-bold leading-none text-ink-400 transition hover:border-accent-violet/40 hover:text-white focus:border-accent-violet/40 focus:text-white focus:outline-none"
      >
        ?
      </button>
      {coords &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            // Les deux handlers forment le pont avec CLOSE_DELAY : entrer
            // dans la bulle annule la fermeture programmée.
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="modal-surface pointer-events-auto fixed z-[80] rounded-lg border border-white/10 p-2.5 text-[11px] font-normal leading-relaxed text-ink-200 shadow-xl"
            style={{ left: coords.left, top: coords.top, width: TOOLTIP_WIDTH }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}

export default InfoTooltip;
