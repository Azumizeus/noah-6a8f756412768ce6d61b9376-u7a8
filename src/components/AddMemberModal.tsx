import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { addMember, removeMember } from '../lib/anchor';
import { useAnchorProgram } from '../hooks/useProjects';
import { parseTxError, explorerTxUrl } from '../lib/pacts';
import type { ChainMember } from '../lib/pacts';
import { ROLE_GROUPS, ALL_ROLES, combineRoleLabels } from '../lib/roles';
import { MAX_MEMBERS } from '../lib/constants';
import { useLanguage } from '../lib/i18n/LanguageContext';

interface Props {
  projectPda: PublicKey;
  projectTitle: string;
  existingMembers: ChainMember[];
  onClose: () => void;
  onSuccess: () => void;
}

interface Row {
  wallet: string;
  roleIds: string[];   // multi-sélection — un membre peut cumuler plusieurs rôles
  customRole: string;
  share: string;      // texte pour laisser l'input vide sans forcer 0
  shareTouched: boolean;
}

function emptyRow(): Row {
  return { wallet: '', roleIds: [], customRole: '', share: '', shareTouched: false };
}

// Suggestion de part selon le poids cumulé des rôles. Investisseur seul (weight 0) :
// pas de suggestion, la part dépend du deal négocié, pas du rôle.
function suggestShare(roleIds: string[]): string {
  if (roleIds.length === 0) return '';
  const weights = roleIds.map((id) => ALL_ROLES.find((r) => r.id === id)?.weight ?? 0);
  if (weights.every((w) => w === 0)) return '';
  const total = weights.reduce((a, b) => a + b, 0);
  return String(Math.min(Math.max(total, 5), 35));
}

// Label final envoyé on-chain — combine tous les rôles cochés + le rôle libre, ≤ 24 octets.
function roleLabelFor(row: Row): string {
  return combineRoleLabels(row.roleIds, row.customRole);
}

export default function AddMemberModal({
  projectPda,
  projectTitle,
  existingMembers,
  onClose,
  onSuccess,
}: Props) {
  const { publicKey } = useWallet();
  const { t } = useLanguage();
  const program = useAnchorProgram();
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [successSigs, setSuccessSigs] = useState<{ wallet: string; sig: string }[]>([]);

  const slotsLeft = Math.max(0, MAX_MEMBERS - existingMembers.length);
  const existingByWallet = new Map(
    existingMembers.map((m) => [m.wallet.toBase58(), m])
  );

  const updateRow = (i: number, patch: Partial<Row>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    setRows(next);
  };

  const toggleRole = (i: number, roleId: string) => {
    const row = rows[i];
    const roleIds = row.roleIds.includes(roleId)
      ? row.roleIds.filter((r) => r !== roleId)
      : [...row.roleIds, roleId];
    const patch: Partial<Row> = { roleIds };
    if (!row.shareTouched) patch.share = suggestShare(roleIds);
    updateRow(i, patch);
  };

  const addRow = () => {
    if (rows.length >= slotsLeft) return;
    setRows([...rows, emptyRow()]);
  };

  const removeRow = (i: number) => {
    setRows(rows.filter((_, idx) => idx !== i));
  };

  // Détecte si le wallet d'une ligne correspond à un membre déjà présent on-chain
  const duplicateOf = (row: Row): ChainMember | null => {
    const w = row.wallet.trim();
    if (!w) return null;
    return existingByWallet.get(w) ?? null;
  };

  const totalNewShare = rows.reduce((acc, r) => acc + (parseFloat(r.share) || 0), 0);
  const existingShare = existingMembers.reduce((acc, m) => acc + m.shareBps / 100, 0);
  // Un membre déjà présent mais pas encore approuvé peut être "remplacé" (remove + re-add)
  // par une ligne de ce formulaire — sa part actuelle ne doit pas compter en double dans
  // le total projeté, sinon l'affichage ment sur ce qu'il reste réellement à répartir.
  const replacedOldShare = rows.reduce((acc, r) => {
    const dup = duplicateOf(r);
    return dup && !dup.approved ? acc + dup.shareBps / 100 : acc;
  }, 0);
  const projectedTotal = Math.round((existingShare - replacedOldShare + totalNewShare) * 100) / 100;

  const handleSubmit = async () => {
    if (!publicKey || !program) return;
    setLoading(true);
    setError(null);
    setProgress(null);

    const validRows = rows.filter(
      (r) => r.wallet.trim() !== '' && (r.roleIds.length > 0 || r.customRole.trim() !== '')
    );
    if (validRows.length === 0) {
      setError(t('addMember.genericError'));
      setLoading(false);
      return;
    }

    const failures: string[] = [];
    const sigs: { wallet: string; sig: string }[] = [];
    let done = 0;

    for (const row of validRows) {
      done += 1;
      setProgress(t('addMember.progress', { done, total: validRows.length }));
      try {
        const memberWallet = new PublicKey(row.wallet.trim());
        const shareBps = Math.round((parseFloat(row.share) || 0) * 100);
        if (shareBps <= 0 || shareBps > 10000) {
          failures.push(`${row.wallet.slice(0, 6)}… : part invalide (0-100%)`);
          continue;
        }
        const roleLabel = roleLabelFor(row);
        const dup = duplicateOf(row);
        let sig: string;

        if (dup) {
          if (dup.approved) {
            failures.push(
              `${row.wallet.slice(0, 6)}… : déjà membre et déjà approuvé, non modifiable avant finalize.`
            );
            continue;
          }
          // Membre déjà présent mais pas encore approuvé → remplace sa part (remove + re-add)
          await removeMember(program, publicKey, projectPda, memberWallet);
          sig = await addMember(program, publicKey, projectPda, memberWallet, roleLabel, shareBps);
        } else {
          sig = await addMember(program, publicKey, projectPda, memberWallet, roleLabel, shareBps);
        }
        sigs.push({ wallet: row.wallet.trim(), sig });
      } catch (e) {
        failures.push(`${row.wallet.slice(0, 6)}… : ${parseTxError(e)}`);
      }
    }

    setProgress(null);
    setLoading(false);
    setSuccessSigs(sigs);

    if (failures.length > 0) {
      setError(failures.join(' — '));
    }
    if (sigs.length > 0) {
      // Au moins un membre est passé : on rafraîchit la liste du projet.
      // On NE ferme PAS automatiquement — l'utilisateur doit voir/copier le
      // lien Explorer avant de fermer lui-même.
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-[#0d0d15] border border-purple-500/30 rounded-xl max-w-4xl w-full p-6 sm:p-8 max-h-[94vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">{t('addMember.title')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <p className="text-sm text-gray-400 mb-1">
          {t('addMember.project')} <span className="text-purple-400">{projectTitle}</span>
        </p>
        <p className="text-xs text-gray-500 mb-4">
          {t('addMember.slotsInfo', { n: existingMembers.length, slots: slotsLeft, max: MAX_MEMBERS, share: existingShare.toFixed(2) })}
        </p>

        <div className="space-y-3">
          {rows.map((row, i) => {
            const dup = duplicateOf(row);
            return (
              <div key={i} className="border border-white/10 rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <label htmlFor={`member-wallet-${i}`} className="sr-only">
                    Adresse wallet du membre {i + 1}
                  </label>
                  <input
                    id={`member-wallet-${i}`}
                    type="text"
                    value={row.wallet}
                    onChange={(e) => updateRow(i, { wallet: e.target.value })}
                    placeholder={t('addMember.walletPlaceholder')}
                    className="flex-1 bg-black/50 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      aria-label={t('addMember.removeRow')}
                      className="flex h-9 w-9 items-center justify-center text-gray-500 transition hover:text-red-400"
                      title="Retirer cette ligne"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div>
                  <p id={`member-role-${i}`} className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">
                    {t('addMember.rolesLabel')}
                  </p>
                  <div role="group" aria-labelledby={`member-role-${i}`} className="flex flex-wrap gap-1.5">
                    {ROLE_GROUPS.flatMap((g) => g.roles).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRole(i, r.id)}
                        className={
                          'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ' +
                          (row.roleIds.includes(r.id)
                            ? 'border-purple-500/60 bg-purple-500/20 text-white'
                            : 'border-white/10 text-gray-400 hover:text-white')
                        }
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <label htmlFor={`member-custom-role-${i}`} className="sr-only">
                    Rôle personnalisé du membre {i + 1}
                  </label>
                  <input
                    id={`member-custom-role-${i}`}
                    type="text"
                    value={row.customRole}
                    onChange={(e) => updateRow(i, { customRole: e.target.value })}
                    placeholder={t('addMember.customRolePlaceholder')}
                    className="flex-1 bg-black/50 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                  />
                  <label htmlFor={`member-share-${i}`} className="sr-only">
                    Part en % du membre {i + 1}
                  </label>
                  <input
                    id={`member-share-${i}`}
                    type="number"
                    value={row.share}
                    onChange={(e) => updateRow(i, { share: e.target.value, shareTouched: true })}
                    min="0.01"
                    max="100"
                    step="0.01"
                    placeholder={t('addMember.sharePlaceholder')}
                    className="w-20 bg-black/50 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {row.roleIds.length === 0 && !row.customRole.trim() && (
                  <p className="text-[11px] text-red-400">
                    {t('addMember.roleRequired')}
                  </p>
                )}

                {dup && !dup.approved && (
                  <p className="text-[11px] text-amber-400">
                    {t('addMember.duplicateWarning', { role: dup.role, share: (dup.shareBps / 100).toFixed(2) })}
                  </p>
                )}
                {dup && dup.approved && (
                  <p className="text-[11px] text-red-400">
                    {t('addMember.duplicateApprovedError')}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {rows.length < slotsLeft && (
          <button
            type="button"
            onClick={addRow}
            className="mt-3 text-sm text-purple-400 hover:underline"
          >
            {t('addMember.addRow', { n: slotsLeft - rows.length })}
          </button>
        )}

        <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3">
          <p
            className={
              'text-sm font-bold ' +
              (projectedTotal === 100 ? 'text-green-400' : 'text-amber-400')
            }
          >
            {t('addMember.totalProjected', { n: projectedTotal })}{' '}
            {projectedTotal === 100
              ? t('addMember.totalOk')
              : projectedTotal < 100
                ? t('addMember.totalMissing', { n: Math.abs(100 - projectedTotal) })
                : t('addMember.totalExtra', { n: Math.abs(100 - projectedTotal) })}
          </p>
        </div>

        {progress && <p className="mt-3 text-sm text-purple-300">{progress}</p>}

        {successSigs.length > 0 && (
          <div className="mt-3 bg-accent-neon/10 border border-accent-neon/30 rounded-lg p-3">
            <p className="text-sm font-semibold text-accent-neon mb-1">
              {t('addMember.successHeading', { n: successSigs.length })}
            </p>
            {successSigs.map((s) => (
              <a
                key={s.sig}
                href={explorerTxUrl(s.sig)}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[11px] text-accent-neon underline underline-offset-2 hover:opacity-80"
              >
                {s.wallet.slice(0, 4)}…{s.wallet.slice(-4)} : {s.sig.slice(0, 8)}… ↗
              </a>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm font-medium"
            disabled={loading}
          >
            {t('addMember.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            disabled={loading}
          >
            {loading ? t('addMember.submitting') : t('addMember.submit', { n: rows.filter((r) => r.wallet.trim()).length || '' })}
          </button>
        </div>
      </div>
    </div>
  );
}
