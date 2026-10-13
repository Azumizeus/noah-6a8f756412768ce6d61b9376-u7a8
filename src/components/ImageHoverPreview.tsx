// src/components/ImageHoverPreview.tsx
// ═══════════════════════════════════════════════════════════════════
// Aperçu « vrai format » au survol d'un logo ou d'une bannière.
//
// Problème résolu : dans les cards, les images sont volontairement
// recadrées (object-cover) pour que la grille reste régulière. Un logo
// carré passe en 40×40, une bannière 16:9 en bandeau 96px — le founder
// ne voit jamais ce qu'il a réellement uploadé, et un investisseur ne
// voit qu'un fragment.
//
// Deux points structurants :
//
// 1. L'overlay est monté dans un PORTAIL sur <body>. Les cards ont
//    `overflow-hidden` (indispensable pour le bleed de la bannière
//    jusqu'aux bords) : un overlay rendu en enfant serait découpé au
//    cadre de la card, donc inutilisable. Le portail sort de l'arbre
//    de clipping.
//
// 2. On ne l'active que sur les pointeurs fins (`hover: hover`). Sur
//    tactile, le navigateur émet un faux `mouseenter` au tap : sans
//    ce garde-fou, toucher une card ouvrirait un aperçu fantôme qui
//    ne se fermerait qu'au tap suivant.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Boîte d'affichage selon la nature de l'image.
 *
 * ⚠️ Point clé du correctif : `object-contain` ne redimensionne RIEN par
 * lui-même. Il ne fait que décider comment une image se place dans la boîte
 * qu'on lui donne. Posé sur un `<img>` qui n'a que des `max-h`/`max-w`, il
 * n'agit donc que comme un plafond : une bannière 3000px se contentait de
 * gonfler jusqu'à 86vw/78vh, et un logo de 64px restait affiché en 64px,
 * minuscule au centre de l'écran. C'est exactement l'inverse de ce qu'on
 * attend d'un « aperçu ».
 *
 * On donne donc à chaque aperçu une vraie boîte de taille fixe, et
 * `object-contain` fait enfin son travail dans les deux sens : il agrandit
 * les petites images et réduit les grandes, toujours au ratio d'origine.
 */
const BOX: Record<'logo' | 'banner', string> = {
  // Carré : un logo est presque toujours 1:1, une boîte large laisserait des
  // vides latéraux énormes.
  logo: 'h-[min(320px,60vw)] w-[min(320px,60vw)]',
  // Large : cadre 16:9 environ, plafonné pour ne jamais toucher les bords.
  banner: 'h-[min(495px,58vh)] w-[min(880px,86vw)]',
};

interface Props {
  /** URL affichée en grand. Si absente, le composant est transparent. */
  src?: string;
  alt?: string;
  /** Détermine la boîte d'aperçu. Par défaut : bannière (cas le plus large). */
  kind?: 'logo' | 'banner';
  /** Le rendu normal (miniature recadrée) — inchangé. */
  children: ReactNode;
  /** Classes du conteneur déclencheur, pour ne rien casser du layout parent. */
  className?: string;
}

/** Un tap sur mobile déclenche mouseenter : on réserve l'aperçu à la souris. */
function usePointerCanHover(): boolean {
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setCanHover(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCanHover(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return canHover;
}

export function ImageHoverPreview({
  src,
  alt = '',
  kind = 'banner',
  children,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const canHover = usePointerCanHover();
  // Petit délai avant ouverture : sans lui, un simple passage de souris en
  // travers d'une grille de cards fait clignoter l'overlay à chaque card.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!src || !canHover) return <>{children}</>;

  const openLater = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 220);
  };

  const closeNow = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <>
      <div
        className={className}
        onMouseEnter={openLater}
        onMouseLeave={closeNow}
        // Le clavier a droit au même aperçu : un utilisateur qui tabule
        // jusqu'à l'image doit pouvoir la voir en entier.
        onFocus={openLater}
        onBlur={closeNow}
      >
        {children}
      </div>

      {open &&
        createPortal(
          <div
            // pointer-events-none : l'overlay ne doit jamais voler le survol
            // à la card en dessous, sinon il se refermerait aussitôt ouvert
            // (mouseleave déclenché par son propre affichage).
            className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
            aria-hidden="true"
          >
            <figure className="flex flex-col items-center gap-3">
              <div
                className={
                  'flex items-center justify-center overflow-hidden rounded-xl bg-black/40 shadow-[0_24px_80px_-12px_rgba(153,69,255,0.45)] ring-1 ring-white/15 ' +
                  BOX[kind]
                }
              >
                <img
                  src={src}
                  alt={alt}
                  // object-contain dans une boîte dimensionnée : ratio d'origine
                  // respecté, aucun recadrage, et l'image occupe enfin le cadre
                  // quelle que soit sa résolution native.
                  className="h-full w-full object-contain"
                />
              </div>
              <figcaption className="font-mono text-[11px] uppercase tracking-widest text-white/45">
                format d'origine
              </figcaption>
            </figure>
          </div>,
          document.body
        )}
    </>
  );
}

export default ImageHoverPreview;
