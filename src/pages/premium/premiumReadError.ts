// src/pages/premium/premiumReadError.ts
// ═══════════════════════════════════════════════════════════════════
// Traduit en une phrase lisible le motif d'échec renvoyé par les variantes
// `…Result` de `lib/gamification.ts`.
//
// Pourquoi un module à part plutôt qu'une ligne dans chaque panneau : les
// trois panneaux de gamification (progression, quêtes, wallet) reçoivent le
// MÊME jeu de sentinelles, et deux sentinelles veulent deux phrases
// différentes — « pas configuré » n'est pas une panne, c'est un poste sans
// Supabase, et les confondre enverrait l'utilisateur chercher un problème
// réseau qui n'existe pas. Une seule traduction, donc un seul endroit à
// corriger le jour où les messages changent.
//
// Fichier `.ts` et non `.tsx` : il ne rend rien, et les garde-fous
// (`premium-v1-boundary`, `premium-data-reach`) balaient les `.tsx` du
// dossier — un helper sans JSX n'a rien à y faire.
// ═══════════════════════════════════════════════════════════════════
import { GAMIFICATION_OFFLINE } from '../../lib/gamification';

type T = (key: string, params?: Record<string, string | number>) => string;

/**
 * Message à afficher pour un échec de lecture.
 *
 * Le détail brut (`error.message` de PostgREST) est conservé entre
 * parenthèses : sans lui, « la lecture a échoué » est indébogable côté
 * utilisateur, et c'est pourtant la seule information qu'il peut transmettre.
 */
export function readErrorLabel(t: T, error: string): string {
  if (error === GAMIFICATION_OFFLINE) return t('errors.notConfigured');
  return `${t('gamification.offline')} (${error})`;
}
