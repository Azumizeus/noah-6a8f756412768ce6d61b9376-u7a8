// src/pages/premium/PremiumProjectCard.tsx
// ═══════════════════════════════════════════════════════════════════
// Carte projet premium — composant PARTAGÉ par Dashboard, Marketplace et
// Pacts. Le bloc média (bannière + logo), la coquille et l'ordre des
// sections sont définis UNE SEULE FOIS ici : c'est ce qui empêche les trois
// pages de rediverger sur le rendu (l'onglet Pacts avait justement perdu sa
// bannière en recopiant la carte à la main — voir le fix du 08/10).
//
// Le composant ne décide de rien : chaque page lui passe son statut, ses
// paires clé/valeur, sa légende et ses actions — les seules choses qui
// diffèrent réellement d'un onglet à l'autre. Tout le reste (hauteur de
// bannière, dégradé de repli, lettre de secours, position du logo) est
// centralisé dans ./projectCardMedia.ts, testé par scripts/premium-card.test.ts.
// ═══════════════════════════════════════════════════════════════════
import type { ReactNode } from 'react';
import {
  resolveBanner,
  bannerFallbackGradient,
  bannerFallbackInk,
  bannerHeight,
  bannerImageStyle,
  resolveLogo,
  type CardSize,
} from './projectCardMedia';

export interface PremiumProjectKvPair {
  k: ReactNode;
  v: ReactNode;
}

export interface PremiumProjectCardProps {
  title: string;
  /** Bannière du projet (Supabase) — absente : repli sur l'initiale. */
  bannerUrl?: string | null;
  /** Logo du projet (Supabase) — absent : pas de pastille superposée. */
  logoUrl?: string | null;
  size: CardSize;
  /** Pact en recrutement (true) ou finalisé (false) — pilote le dégradé de repli. */
  isOpen: boolean;
  /** Pastille de statut — le libellé change d'une page à l'autre. */
  pill: ReactNode;
  description: string;
  /** Badge d'étape facultatif (Marketplace) — rendu seulement si fourni. */
  stage?: ReactNode;
  /** Paires clé/valeur du bloc chiffres (2 attendues pour la grille `p-kv`). */
  kv: PremiumProjectKvPair[];
  /** Barre de progression — rendue seulement si fournie. */
  trackPct?: number;
  /** Légende sous la barre (membres, créateur…) — rendue seulement si fournie. */
  legend?: ReactNode;
  /** Boutons d'action en bas de carte. */
  actions: ReactNode;
}

export function PremiumProjectCard({
  title,
  bannerUrl,
  logoUrl,
  size,
  isOpen,
  pill,
  description,
  stage,
  kv,
  trackPct,
  legend,
  actions,
}: PremiumProjectCardProps) {
  const banner = resolveBanner(bannerUrl, title);
  const logo = resolveLogo(logoUrl);

  return (
    <article className="p-card">
      <div
        style={{
          position: 'relative',
          height: bannerHeight(size),
          flexShrink: 0,
          background: bannerFallbackGradient(isOpen),
          display: 'grid',
          placeItems: 'center',
          color: bannerFallbackInk(isOpen),
          fontWeight: 800,
          fontSize: 26,
          fontFamily: 'monospace',
          // Filet de sécurité : même avec l'image en position absolue (voir
          // bannerImageStyle), rien ne doit pouvoir dépasser du bandeau et
          // recouvrir le corps de la carte. Le logo, lui, est en absolu DANS
          // le bandeau : il reste visible.
          overflow: 'hidden',
        }}
      >
        {banner.imageUrl ? (
          <img src={banner.imageUrl} alt="" style={bannerImageStyle()} />
        ) : (
          banner.fallbackLetter
        )}
        {logo && (
          <img
            src={logo}
            alt=""
            style={{
              position: 'absolute',
              left: 12,
              bottom: 8,
              width: 30,
              height: 30,
              borderRadius: 9,
              objectFit: 'cover',
              border: '1px solid rgba(255,255,255,.55)',
              background: 'var(--p-canvas)',
            }}
          />
        )}
      </div>
      <div className="body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h3 style={{ lineHeight: 1.35 }}>{title}</h3>
          {pill}
        </div>
        {/* Pas de paragraphe vide : quand le pitch libre d'un pact est vide, la
            description on-chain ne contient que la clé d'étape entre crochets
            et les marqueurs internes — qui ne sont pas du texte pour le
            visiteur (voir displayPitch dans lib/pitch.ts, et le repli brut
            retiré le 10/10/2026). */}
        {description ? <p className="desc">{description}</p> : null}
        {stage}
        <div className="p-kv">
          {kv.map((pair, i) => (
            <div className="b" key={i}>
              <span className="k">{pair.k}</span>
              <span className="v">{pair.v}</span>
            </div>
          ))}
        </div>
        {trackPct !== undefined && (
          <div className="p-track" style={{ marginTop: 12 }}>
            <i style={{ width: `${Math.min(100, trackPct)}%` }} />
          </div>
        )}
        {legend && <p className="p-legend">{legend}</p>}
        <div className="p-actions">{actions}</div>
      </div>
    </article>
  );
}

export default PremiumProjectCard;
