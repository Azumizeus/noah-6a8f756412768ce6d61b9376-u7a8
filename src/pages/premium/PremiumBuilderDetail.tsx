// src/pages/premium/PremiumBuilderDetail.tsx
// ═══════════════════════════════════════════════════════════════════
// Fiche détaillée d'un builder (`#/builders`), ouverte au clic sur une carte.
// Contrairement à la carte compacte (bio tronquée, 4 compétences), tout est
// affiché : bio complète, toutes les compétences + niveau, tous les liens,
// wallet complet, note détaillée.
//
// Réécrite en tokens `--p-*` : `components/BuilderDetailModal.tsx` est habillé
// en `glass-panel` + `text-ink-*` (legacy sombre). Les données, elles,
// viennent du même `BuilderProfile` (lib/profile) — aucun modèle dupliqué.
// ═══════════════════════════════════════════════════════════════════
import { useEffect } from 'react';
import { ALL_ROLES } from '../../lib/roles';
import type { BuilderProfile } from '../../lib/profile';
import { AVAILABILITY_META, SKILL_LEVEL_META } from '../../lib/profile';
import type { RatingSummary } from '../../lib/contact';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PremiumStarRating from './PremiumStarRating';

interface Props {
  profile: BuilderProfile;
  rating?: RatingSummary;
  canContact: boolean;
  onClose: () => void;
  onContact: () => void;
}

const sectionTitle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: 'var(--p-ink3)',
  margin: '0 0 6px',
} as const;

export default function PremiumBuilderDetail({ profile, rating, canContact, onClose, onContact }: Props) {
  const { t } = useLanguage();
  const linkEntries = Object.entries(profile.links).filter(([, v]) => v && v.trim() !== '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'var(--p-overlay)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '85vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: 22,
          background: 'var(--p-canvas)',
          border: '1px solid var(--p-line)',
          borderRadius: 'var(--p-radius-lg)',
          boxShadow: 'var(--p-shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                style={{ width: 62, height: 62, borderRadius: 99, border: '1px solid var(--p-line)', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <span
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 99,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  background: 'var(--p-accent-soft)',
                  color: 'var(--p-accent)',
                  fontWeight: 800,
                  fontSize: 24,
                }}
              >
                {profile.pseudo.trim().charAt(0).toUpperCase() || '?'}
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--p-ink)', margin: 0 }}>{profile.pseudo}</h2>
              <span className="p-pill" style={{ marginTop: 5, background: 'var(--p-bg)', color: 'var(--p-ink2)' }}>
                {AVAILABILITY_META[profile.availability].emoji} {t(AVAILABILITY_META[profile.availability].labelKey)}
              </span>
              {rating && rating.ratingCount > 0 && (
                <div style={{ marginTop: 6 }}>
                  <PremiumStarRating value={rating.avgStars} count={rating.ratingCount} />
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--p-ink3)' }}
          >
            ×
          </button>
        </div>

        {profile.bio && (
          <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--p-ink2)', margin: 0, whiteSpace: 'pre-wrap' }}>
            {profile.bio}
          </p>
        )}

        {profile.skills.length > 0 && (
          <div>
            <p style={sectionTitle}>{t('profile.skills')}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {profile.skills.map((id) => (
                <span
                  key={id}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--p-ink2)',
                    border: '1px solid var(--p-line)',
                    borderRadius: 99,
                    padding: '4px 10px',
                  }}
                >
                  {ALL_ROLES.find((r) => r.id === id)?.label ?? id}
                  {profile.skillLevels[id] && (
                    <span style={{ color: 'var(--p-ink3)' }}> · {t(SKILL_LEVEL_META[profile.skillLevels[id]].labelKey)}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {linkEntries.length > 0 && (
          <div>
            <p style={sectionTitle}>{t('profile.links')}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {linkEntries.map(([k, v]) => (
                <li key={k} style={{ fontSize: 12, color: 'var(--p-ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--p-ink3)' }}>{k} :</span> {v}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p style={sectionTitle}>{t('builders.detailWallet')}</p>
          <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 10.5, color: 'var(--p-ink3)', wordBreak: 'break-all' }}>
            {profile.wallet}
          </p>
        </div>

        {canContact && profile.availability === 'open' && (
          <button type="button" className="p-btn primary" onClick={onContact}>
            {t('builders.contactButton')}
          </button>
        )}
      </div>
    </div>
  );
}
