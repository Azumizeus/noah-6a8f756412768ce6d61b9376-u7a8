// src/components/OpenRolesPanel.tsx
// ═══════════════════════════════════════════════════════════════════
// Panneau "Rôles recherchés" d'un pact — fiche publique.
//  - Lecture publique : chips des postes à pourvoir déclarés par le founder
//    (table off-chain project_open_roles — voir lib/openRoles.ts).
//  - Si le wallet connecté est le creator on-chain : bouton "Modifier" →
//    éditeur inline (chips catalogue + rôle libre), sauvegarde signée
//    (signMessage → Edge Function open-roles → vérif creator on-chain).
// Les pacts créés avant le 25/08 n'ont rien en base : le panneau affiche
// alors juste l'état vide, sans casser la page.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ALL_ROLES } from '../lib/roles';
import { fetchOpenRoles, saveOpenRoles, MAX_OPEN_ROLES } from '../lib/openRoles';
import { useLanguage } from '../lib/i18n/LanguageContext';

interface Props {
  projectPda: string;
  creatorWallet: string;
}

export default function OpenRolesPanel({ projectPda, creatorWallet }: Props) {
  const { publicKey, signMessage } = useWallet();
  const { t } = useLanguage();

  const [roles, setRoles] = useState<string[] | null>(null); // null = chargement
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [customRole, setCustomRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iAmCreator = publicKey?.toBase58() === creatorWallet;

  const refresh = () => {
    fetchOpenRoles(projectPda)
      .then(setRoles)
      .catch(() => setRoles([]));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPda]);

  const toggleDraftRole = (label: string) => {
    setDraft((prev) =>
      prev.includes(label)
        ? prev.filter((r) => r !== label)
        : prev.length >= MAX_OPEN_ROLES
          ? prev
          : [...prev, label]
    );
  };

  const addCustomDraftRole = () => {
    const v = customRole.trim();
    if (v && !draft.some((r) => r.toLowerCase() === v.toLowerCase()) && draft.length < MAX_OPEN_ROLES) {
      setDraft((prev) => [...prev, v]);
    }
    setCustomRole('');
  };

  const handleSave = async () => {
    if (!publicKey || !signMessage) return;
    setSaving(true);
    setError(null);
    const r = await saveOpenRoles(publicKey.toBase58(), signMessage, projectPda, draft);
    setSaving(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setEditing(false);
    refresh();
  };

  // Chargement ou aucun rôle et pas le founder → ne rien afficher du tout
  // (un visiteur n'a pas besoin de savoir que la donnée n'existe pas).
  if (roles === null || (roles.length === 0 && !iAmCreator)) return null;

  return (
    <div className="glass-panel rounded-2xl border border-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-sans text-sm font-semibold text-white">
          {t('openRoles.title')}
        </h3>
        {iAmCreator && !editing && (
          <button
            type="button"
            onClick={() => { setDraft(roles); setEditing(true); setError(null); }}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-ink-300 transition hover:border-accent-violet/40 hover:text-white"
          >
            {t('openRoles.edit')}
          </button>
        )}
      </div>

      {!editing ? (
        roles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <span
                key={r}
                className="rounded-full border border-accent-neon/40 bg-emerald-500/10 px-3 py-1 text-xs text-white"
              >
                {r}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-400">{t('openRoles.emptyFounder')}</p>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleDraftRole(r.label)}
                disabled={!draft.includes(r.label) && draft.length >= MAX_OPEN_ROLES}
                className={
                  'rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-40 ' +
                  (draft.includes(r.label)
                    ? 'border-accent-neon/60 bg-emerald-500/20 text-white'
                    : 'border-white/10 text-ink-300 hover:text-white')
                }
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder:text-ink-500 focus:border-accent-violet/60 focus:outline-none"
              placeholder={t('openRoles.customPlaceholder')}
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomDraftRole(); } }}
            />
            <button
              type="button"
              onClick={addCustomDraftRole}
              disabled={draft.length >= MAX_OPEN_ROLES}
              className="whitespace-nowrap rounded border border-accent-neon/40 bg-emerald-500/10 px-3 text-[11px] text-accent-neon hover:bg-emerald-500/20 disabled:opacity-40"
            >
              {t('createWizard.addRole')}
            </button>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); }}
              disabled={saving}
              className="flex-1 rounded-lg bg-gray-700 py-1.5 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !signMessage}
              className="flex-1 rounded-lg bg-accent-violet py-1.5 text-xs font-medium text-ink-900 hover:bg-accent-violet/90 disabled:opacity-50"
            >
              {saving ? t('openRoles.saving') : t('common.save')}
            </button>
          </div>
          <p className="text-[10px] text-ink-500">{t('openRoles.signatureHint')}</p>
        </div>
      )}
    </div>
  );
}
