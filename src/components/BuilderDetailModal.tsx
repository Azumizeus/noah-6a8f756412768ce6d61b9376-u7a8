// src/components/BuilderDetailModal.tsx
// ═══════════════════════════════════════════════════════════════════
// Fiche détaillée d'un builder — ouverte au clic sur une carte de
// l'annuaire (/builders). Contrairement à la carte compacte (bio tronquée,
// 5 compétences max), ici tout est affiché : bio complète, toutes les
// compétences + niveau, tous les liens, wallet complet, note détaillée.
// ═══════════════════════════════════════════════════════════════════
import { ALL_ROLES } from '../lib/roles';
import type { BuilderProfile } from '../lib/profile';
import { AVAILABILITY_META, SKILL_LEVEL_META } from '../lib/profile';
import type { RatingSummary } from '../lib/contact';
import StarRating from './StarRating';
import { useLanguage } from '../lib/i18n/LanguageContext';

function roleLabel(id: string): string {
  return ALL_ROLES.find((r) => r.id === id)?.label ?? id;
}

interface Props {
  profile: BuilderProfile;
  rating?: RatingSummary;
  canContact: boolean;
  onClose: () => void;
  onContact: () => void;
}

export default function BuilderDetailModal({ profile, rating, canContact, onClose, onContact }: Props) {
  const { t } = useLanguage();
  const linkEntries = Object.entries(profile.links).filter(([, v]) => v && v.trim() !== '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="glass-panel max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/30">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl text-ink-500">
                  {profile.pseudo.trim().charAt(0).toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div>
              <h2 className="font-sans text-lg font-semibold text-white">{profile.pseudo}</h2>
              <span className="mt-0.5 inline-block rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-ink-400">
                {AVAILABILITY_META[profile.availability].emoji} {t(AVAILABILITY_META[profile.availability].labelKey)}
              </span>
              {rating && rating.ratingCount > 0 && (
                <div className="mt-1.5">
                  <StarRating value={rating.avgStars} count={rating.ratingCount} />
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="shrink-0 text-lg text-ink-400 hover:text-white">
            ×
          </button>
        </div>

        {profile.bio && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-200">{profile.bio}</p>
        )}

        {profile.skills.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-white">{t('profile.skills')}</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.map((id) => (
                <span
                  key={id}
                  className="rounded-full border border-accent-violet/30 bg-violet-500/10 px-2.5 py-1 text-xs text-white"
                >
                  {roleLabel(id)}
                  {profile.skillLevels[id] && (
                    <span className="text-ink-400"> · {t(SKILL_LEVEL_META[profile.skillLevels[id]].labelKey)}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {linkEntries.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-white">{t('profile.links')}</p>
            <ul className="space-y-1">
              {linkEntries.map(([k, v]) => (
                <li key={k} className="truncate text-xs text-ink-300">
                  <span className="text-ink-500">{k} :</span> {v}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-semibold text-white">{t('builders.detailWallet')}</p>
          <p className="break-all font-mono text-[10px] text-ink-500">{profile.wallet}</p>
        </div>

        {canContact && profile.availability === 'open' && (
          <button
            type="button"
            onClick={onContact}
            className="w-full rounded-lg bg-accent-violet py-2.5 text-sm font-medium text-ink-900 transition hover:bg-accent-violet/90"
          >
            {t('builders.contactButton')}
          </button>
        )}
      </div>
    </div>
  );
}
