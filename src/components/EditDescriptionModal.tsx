// src/components/EditDescriptionModal.tsx
// ═══════════════════════════════════════════════════════════════════
// Modale founder-only pour corriger la description ON-CHAIN d'un pact
// après sa création, via l'instruction update_description (ajoutée par
// l'upgrade du 27/08 — voir lib/onchainLimits.ts).
//
// ⚠️ Avant ce fichier, `updateDescription()` (lib/anchor.ts) et
// `MigratePactButton`/`needsDescriptionMigration` (lib/pacts.ts)
// existaient déjà et fonctionnaient, mais rien dans l'app ne les
// appelait jamais : aucune page n'importait `MigratePactButton`. Résultat
// concret : la description d'un pact ne changeait JAMAIS après création,
// ancien ou récent — pas un bug de bornes, une fonctionnalité jamais
// branchée. Ce fichier la branche, en le fusionnant en un seul geste avec
// le cas "migration" : réécrire la description avec update_description
// réalloue AUSSI le compte à la taille actuelle du programme, que le texte
// change ou non. Un vieux pact (≤ 280 octets) qui se contente de
// re-sauvegarder son texte inchangé est donc "migré" gratuitement.
//
// C'est une TRANSACTION on-chain (signature wallet classique via Anchor),
// pas un message signé applicatif comme pour les médias — normal,
// update_description écrit directement dans le compte Project.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAnchorProgram } from '../hooks/useProjects';
import { updateDescription } from '../lib/anchor';
import { parseTxError, explorerTxUrl } from '../lib/pacts';
import { utf8ByteLength } from '../lib/textSafety';
import { MAX_DESC_LEN } from '../lib/onchainLimits';

interface Props {
  projectPda: PublicKey;
  projectTitle: string;
  currentDescription: string;
  /** Affiche un bandeau "migration" — pact créé avant l'upgrade (≤ 280 octets
   *  actuellement). Purement informatif : le bouton fait la même chose dans
   *  les deux cas, sauvegarder réalloue toujours le compte à la taille
   *  courante du programme. */
  isLegacyPact: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditDescriptionModal({
  projectPda,
  projectTitle,
  currentDescription,
  isLegacyPact,
  onClose,
  onSuccess,
}: Props) {
  const { publicKey } = useWallet();
  const program = useAnchorProgram();
  const [text, setText] = useState(currentDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const bytes = utf8ByteLength(text);
  const tooLong = bytes > MAX_DESC_LEN;
  const unchanged = text === currentDescription;

  const handleSave = async () => {
    if (!publicKey || !program) {
      setError('Connecte un wallet capable de signer une transaction.');
      return;
    }
    if (tooLong) return;
    setSaving(true);
    setError(null);
    try {
      const txSig = await updateDescription(program, publicKey, projectPda, text);
      setSig(txSig);
      onSuccess();
    } catch (e) {
      setError(parseTxError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-purple-500/30 bg-[#0d0d15] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Modifier la description</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-400">
          Projet <span className="text-purple-400">{projectTitle}</span>
        </p>

        {isLegacyPact && (
          <p className="mb-4 rounded-lg border border-accent-violet/30 bg-violet-500/10 p-3 text-[11px] leading-relaxed text-accent-violet">
            ⚡ Ce pact a été créé avant la dernière mise à jour du programme
            (description plafonnée à 280 octets à l'époque). Enregistrer ici —
            même sans rien changer au texte — réalloue le compte à la borne
            actuelle ({MAX_DESC_LEN} octets), en une seule signature.
          </p>
        )}

        <label htmlFor="pact-description" className="mb-1 block text-sm font-medium text-white">
          Description on-chain
        </label>
        <textarea
          id="pact-description"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full resize-y rounded-lg border border-purple-500/30 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
        />
        <p className={`mt-1 text-[11px] ${tooLong ? 'text-red-400' : 'text-gray-500'}`}>
          {bytes}/{MAX_DESC_LEN} octets UTF-8 (pas des caractères — un accent ou un
          emoji pèse plus lourd qu'une lettre simple).
          {tooLong && ' Trop long : réduis le texte avant d’enregistrer.'}
        </p>

        <p className="mt-2 text-[11px] text-gray-500">
          ⚠️ Ce champ est écrit tel quel sur la chaîne, y compris le balisage
          « [stage] pitch | Rôles créateur : … » s'il y était déjà — le
          modifier ici change l'accord signé, pas juste un texte d'affichage.
        </p>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {sig && (
          <div className="mt-3 space-y-1 rounded-lg border border-accent-neon/30 bg-accent-neon/10 p-3">
            <p className="text-sm text-accent-neon">✓ Description mise à jour on-chain.</p>
            <a
              href={explorerTxUrl(sig)}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[11px] text-accent-neon underline underline-offset-2 hover:opacity-80"
            >
              Voir la transaction : {sig.slice(0, 8)}…
            </a>
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg bg-gray-700 py-2 text-sm font-medium text-white hover:bg-gray-600"
          >
            {sig ? 'Fermer' : 'Annuler'}
          </button>
          {!sig && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || tooLong || (unchanged && !isLegacyPact)}
              title={
                unchanged && !isLegacyPact
                  ? 'Rien à enregistrer — modifie le texte, ou ferme.'
                  : undefined
              }
              className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
