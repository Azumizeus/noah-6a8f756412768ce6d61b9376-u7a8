// src/components/MigratePactButton.tsx
//
// ⚠️ SUPERSEDED (28/08) — NE PAS BRANCHER. `EditDescriptionModal` couvre
// désormais ce cas ET l'édition libre en un seul composant : réécrire la
// description via update_description réalloue le compte de toute façon,
// que le texte change ou non. Un vieux pact est donc migré au passage,
// sans bouton dédié. Ce fichier reste au dépôt comme trace de la
// démarche (et parce que sa prop `onMigrate` documente le câblage
// attendu), mais le brancher EN PLUS afficherait deux entrées pour la
// même transaction.
//
// Bouton de migration discret pour les pacts créés AVANT l'upgrade du
// programme.
//
// ── Le problème qu'il résout ──────────────────────────────────────────────
// L'upgrade relève les bornes (titre 40→80, description 280→500, rôle 24→32).
// Mais un compte Project déjà existant reste alloué à son ANCIENNE taille :
// `realloc` ne s'applique qu'au moment où une instruction le demande. Un vieux
// pact continue donc de se lire normalement, et échoue seulement quand on tente
// d'y écrire une description longue — avec une erreur d'allocation que rien
// dans l'UI n'explique.
//
// Ce bouton déclenche ce realloc une fois, explicitement, à la demande de
// l'utilisateur.
//
// ── Pourquoi `onMigrate` est une prop et pas un appel direct ──────────────
// Le composant ne connaît ni `lib/anchor` ni le hook `useAnchorProgram`. C'est
// délibéré : je n'ai pas la signature exacte de ces modules sous les yeux, et
// deviner un nom d'export produirait une erreur de build au lieu d'un composant
// utilisable. Le parent, lui, a déjà le Program en main.
//
// Câblage attendu côté page de détail d'un pact :
//
//   <MigratePactButton
//     needsMigration={pact.description.length < MAX_DESC_LEN && isCreator}
//     onMigrate={() => updateDescription(program, pactPda, pact.description)}
//   />
//
// `onMigrate` doit renvoyer la signature de transaction (string).

import { useState } from 'react';
import { CAN_UPDATE_DESCRIPTION } from '../lib/onchainLimits';

interface Props {
  /**
   * true uniquement si CE pact a besoin de la migration ET que l'utilisateur
   * courant est le creator (seul signataire autorisé par update_description).
   * Le composant ne peut pas le déterminer seul : il ne voit pas le compte.
   */
  needsMigration: boolean;
  /** Envoie l'instruction update_description. Renvoie la signature. */
  onMigrate: () => Promise<string>;
  /** Traduction optionnelle — repli sur le français si absente. */
  t?: (key: string) => string;
}

type State = 'idle' | 'pending' | 'done' | 'error';

export default function MigratePactButton({ needsMigration, onMigrate, t }: Props) {
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  const label = (key: string, fallback: string) => {
    const translated = t?.(key);
    // i18n renvoie souvent la clé elle-même quand la traduction manque :
    // dans ce cas on affiche le français plutôt que « migrate.cta » brut.
    return translated && translated !== key ? translated : fallback;
  };

  // Deux verrous indépendants, et c'est volontaire :
  //  - CAN_UPDATE_DESCRIPTION : l'instruction n'existe pas encore on-chain.
  //  - needsMigration : elle existe, mais ce pact n'en a pas besoin.
  // Dans les deux cas on ne rend RIEN. Pas de bouton désactivé — un contrôle
  // visible mais inerte pousse l'utilisateur à cliquer puis à douter.
  if (!CAN_UPDATE_DESCRIPTION || !needsMigration) return null;

  if (state === 'done') {
    return (
      <p className="mt-2 text-[11px] text-accent-neon">
        ✓ {label('migrate.done', 'Pact mis à jour — les champs longs sont maintenant acceptés.')}
      </p>
    );
  }

  const handleClick = async () => {
    setState('pending');
    setMessage('');
    try {
      await onMigrate();
      setState('done');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'pending'}
        className="text-[11px] text-ink-400 underline underline-offset-2 transition-colors hover:text-white disabled:cursor-wait disabled:opacity-60"
      >
        {state === 'pending'
          ? label('migrate.pending', 'Mise à jour en cours…')
          : label('migrate.cta', 'Mettre ce pact à jour')}
      </button>

      <span className="ml-2 text-[11px] text-ink-400">
        {label('migrate.hint', 'Créé avant la dernière mise à jour — une signature suffit.')}
      </span>

      {state === 'error' && (
        <p className="mt-1 text-[11px] text-red-400">
          {label('migrate.error', 'Échec de la mise à jour')} : {message}
        </p>
      )}
    </div>
  );
}
