// src/pages/premium/PremiumProgression.tsx
// ═══════════════════════════════════════════════════════════════════
// Panneau « Progression » du profil premium : rang courant, barre XP vers le
// rang suivant, et étagère de badges (débloqués ET verrouillés, avec leur
// compteur).
//
// C'était l'une des deux « perdues » restantes de l'inventaire /v1 : la
// progression vivait dans `MonProfilPage` (legacy) via `components/XpBar.tsx`
// et `components/BadgeShelf.tsx`, habillés en `text-ink-*` / `text-white` /
// `bg-white/5` — une encre pensée pour le fond noir, donc illisible sur
// l'ivoire premium, et figée sur un seul thème.
//
// Rien n'est recalculé ici : `computeRank`, `fetchWalletXpResult`,
// `computeBadgeProgressResult`, `BADGE_ORDER` et `BADGE_META` viennent tous de
// `lib/gamification.ts`, le même module que le legacy. Le rang, les seuils et
// les règles de badges n'existent donc qu'à un seul endroit — une note d'XP
// gagnée sur /v1 s'affiche ici sans rien synchroniser.
//
// Les icônes de rang viennent de `components/RankIcons.tsx` : ce sont des SVG
// en `currentColor`, sans palette ni encre propre (l'en-tête du fichier le dit
// explicitement). Les réécrire aurait dupliqué 7 glyphes pour zéro token.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import {
  BADGE_META,
  BADGE_ORDER,
  computeRank,
  computeBadgeProgressResult,
  fetchBadgeRarity,
  fetchWalletXpResult,
  type BadgeId,
  type BadgeProgress,
} from '../../lib/gamification';
import { IconRankAnon, RANK_ICON } from '../../components/RankIcons';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import { readErrorLabel } from './premiumReadError';

export default function PremiumProgression({ wallet }: { wallet: string }) {
  const { t } = useLanguage();
  const [xp, setXp] = useState<number | null>(null);
  const [badges, setBadges] = useState<Record<BadgeId, BadgeProgress> | null>(null);
  // Rareté = décoration (un pourcentage de popularité). Elle reste autorisée à
  // s'effacer discrètement : son absence ne change pas la lecture de la page,
  // contrairement à l'XP ou aux badges, qui sont le contenu lui-même.
  const [rarity, setRarity] = useState<Record<BadgeId, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setXp(null);
    setBadges(null);
    setError(null);

    fetchWalletXpResult(wallet).then((r) => {
      if (!alive) return;
      // Un échec de lecture n'est PAS un zéro : on garde le squelette et on
      // le dit, plutôt que d'annoncer « 0 XP » à quelqu'un qui en a 3 000.
      if ('error' in r) setError(r.error);
      else setXp(r.xp);
    });

    computeBadgeProgressResult(wallet).then((r) => {
      if (!alive) return;
      if ('error' in r) setError(r.error);
      else setBadges(r.badges);
    });

    fetchBadgeRarity().then((r) => {
      if (alive) setRarity(r);
    });

    return () => {
      alive = false;
    };
  }, [wallet]);

  const unlockedCount = badges
    ? BADGE_ORDER.filter((id) => badges[id].unlocked).length
    : 0;

  return (
    <section
      style={{
        marginTop: 22,
        padding: '18px 20px',
        background: 'var(--p-canvas)',
        border: '1px solid var(--p-line)',
        borderRadius: 'var(--p-radius-lg)',
        boxShadow: 'var(--p-shadow)',
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--p-ink)', margin: 0 }}>
        {t('gamification.sectionHeading')}
      </h2>

      {/* Surface d'erreur : annoncée, pas seulement affichée. Sans elle, une
          base injoignable se lirait « rang Anon, 0 XP, aucun badge ». */}
      {error && (
        <p
          role="alert"
          style={{
            fontSize: 11.5,
            lineHeight: 1.6,
            color: 'var(--p-err)',
            background: 'var(--p-bg)',
            border: '1px solid var(--p-err)',
            borderRadius: 'var(--p-radius-xs)',
            padding: '8px 12px',
            margin: '10px 0 0',
          }}
        >
          {readErrorLabel(t, error)}
        </p>
      )}

      {xp === null ? (
        <div
          style={{
            height: 46,
            marginTop: 12,
            background: 'var(--p-bg)',
            border: '1px solid var(--p-line)',
            borderRadius: 'var(--p-radius-xs)',
          }}
          aria-hidden="true"
        />
      ) : (
        <RankBlock xp={xp} />
      )}

      <h3
        style={{
          fontSize: 11,
          fontWeight: 650,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--p-ink3)',
          margin: '18px 0 0',
        }}
      >
        {t('gamification.badgesHeading')}
      </h3>

      {badges === null ? (
        <div
          style={{
            height: 54,
            marginTop: 10,
            background: 'var(--p-bg)',
            border: '1px solid var(--p-line)',
            borderRadius: 'var(--p-radius-xs)',
          }}
          aria-hidden="true"
        />
      ) : (
        <>
          <p style={{ fontSize: 11, color: 'var(--p-ink3)', margin: '8px 0 0' }}>
            {t('gamification.badgesUnlockedCount', {
              done: unlockedCount,
              total: BADGE_ORDER.length,
            })}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {BADGE_ORDER.map((id) => {
              const meta = BADGE_META[id];
              const p = badges[id];
              const pct = rarity?.[id];
              // Le titre porte tout ce qui ne tient pas dans la pastille :
              // la règle du badge, son compteur s'il est verrouillé, et sa
              // rareté. Un `title` est lu au survol (et par les lecteurs
              // d'écran) — rien n'y est indispensable à la compréhension.
              const title =
                t(meta.descKey) +
                (p.unlocked ? '' : ` (${p.current}/${p.target})`) +
                (pct !== undefined ? ` — ${t('gamification.badgeRarityLabel', { pct })}` : '');
              return (
                <span
                  key={id}
                  title={title}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: '5px 11px',
                    borderRadius: 99,
                    border: '1px solid ' + (p.unlocked ? 'var(--p-warn)' : 'var(--p-line)'),
                    background: p.unlocked ? 'var(--p-warn-soft)' : 'var(--p-bg)',
                    color: p.unlocked ? 'var(--p-warn)' : 'var(--p-ink3)',
                  }}
                >
                  <span aria-hidden="true">{meta.emoji}</span>
                  {t(meta.labelKey)}
                  {!p.unlocked && (
                    <span style={{ fontFamily: 'var(--p-font-display)', fontSize: 10 }}>
                      {p.current}/{p.target}
                    </span>
                  )}
                  {pct !== undefined && p.unlocked && pct <= 20 && (
                    <span style={{ color: 'var(--p-accent)' }}>
                      {t('gamification.badgeRarityLabel', { pct })}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/** Rang + barre de progression. Extrait pour garder le composant principal
 *  lisible, et surtout pour que `computeRank` ne soit appelé qu'une fois le
 *  total XP réellement connu — appeler `computeRank(0)` pendant le chargement
 *  afficherait « Anon » à un joueur de rang Legendary, le temps d'un fetch. */
function RankBlock({ xp }: { xp: number }) {
  const { t } = useLanguage();
  const { rankKey, xp: total, xpToNext, nextRankKey, progressPct } = computeRank(xp);
  // Repli sur la silhouette neutre : un rang ajouté dans RANKS sans son icône
  // laisserait un trou dans la pastille.
  const Icon = RANK_ICON[rankKey] ?? IconRankAnon;

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            fontWeight: 700,
            color: 'var(--p-accent)',
          }}
        >
          <Icon />
          {t(`gamification.${rankKey}`)}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--p-ink3)' }}>
          {nextRankKey
            ? t('gamification.xpToNext', {
                n: xpToNext ?? 0,
                rank: t(`gamification.${nextRankKey}`),
              })
            : t('gamification.maxRank')}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('gamification.xpTotal', { n: total })}
        style={{
          height: 6,
          marginTop: 8,
          borderRadius: 99,
          background: 'var(--p-line)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: '100%',
            borderRadius: 99,
            background: 'var(--p-accent)',
          }}
        />
      </div>

      <p
        style={{
          margin: '6px 0 0',
          textAlign: 'right',
          fontFamily: 'var(--p-font-display)',
          fontSize: 11,
          color: 'var(--p-ink3)',
        }}
      >
        {t('gamification.xpTotal', { n: total })}
      </p>
    </div>
  );
}
