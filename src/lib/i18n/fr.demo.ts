// src/lib/i18n/fr.demo.ts
// Namespace `demo` — page de rejeu scripté (#/demo). Voir lib/demoScenario.ts
// pour les données, pages/premium/PremiumDemo.tsx pour le rendu.
//
// Les libellés d'étapes reçoivent leurs valeurs de l'étape elle-même
// (`EtapeDemo.params`) : ce fichier ne connaît aucun chiffre, donc il ne
// peut pas se désynchroniser du scénario.
import type { Dict } from './types';

export const frDemo: Dict = {
  projectTitle: 'Atlas — carte solaire pour les lycées',
  projectPitch: 'Atlas équipe les lycées d’un tableau de bord énergétique, ouvert et vérifiable.',
  eyebrow: 'Rejeu scripté',
  title: 'Le parcours complet, sans wallet',
  subtitle:
    "create → add_member → approve → finalize → fund → distribute, image par image. Aucune transaction n'est envoyée, aucun wallet n'est requis : les adresses et signatures affichées sont fictives et reproductibles.",
  banner:
    'Démonstration hors chaîne. Sur devnet, chaque étape demande une signature de wallet réelle.',

  play: 'Lancer le rejeu',
  pause: 'Pause',
  next: 'Étape suivante',
  restart: 'Recommencer',

  // Mode tournage — voir lib/tournage.ts. Jamais activé par défaut : masquer
  // un incident RPC doit rester un geste explicite.
  tournage: 'Mode tournage',
  tournageOff: 'Quitter le mode tournage',
  // La durée EFFECTIVE est affichée ({{pas}}) : une valeur d'URL refusée ou
  // hors bornes se voit donc à l'écran au lieu de changer le rejeu en
  // silence. Même raison pour le cadrage ({{largeur}}).
  tournageOn:
    'Mode tournage actif — une étape toutes les {{pas}} s, bandeau de santé masqué, cadrage {{largeur}} px.',
  tournageHint:
    "Lecture automatique au chargement, bandeau de santé RPC masqué et cadrage fixé à 1000 px, pour enregistrer la vidéo sans manipulation. L'état est porté par l'URL (#/demo?tournage=1) : le lien est donc partageable et survit à un rechargement.",

  // Rythme du rejeu — voir lib/tournage.ts (PARAM_PAS).
  rythme: 'Rythme',
  rythmeRapide: 'Rapide · {{s}} s',
  rythmeNormal: 'Normal · {{s}} s',
  rythmeLent: 'Lent · {{s}} s',
  rythmeHint:
    "Durée d'affichage d'une étape (défaut : 2,4 s). Le réglage vit dans l'URL (?pas=2.4, en secondes) : deux prises du même lien sont identiques, et un lien trop rapide se corrige en changeant un chiffre.",
  stepLabel: 'Étape {{n}} / {{total}}',
  done: 'Parcours terminé — vault vidé, membres payés.',

  timeline: 'Chronologie',
  instruction: 'Instruction',
  signer: 'Signataire',
  signature: 'Signature (fictive)',
  vault: 'Vault',
  vaultAfter: 'Solde du vault après cette étape',

  fee: 'Frais protocole (2 %)',
  net: 'Aux membres (98 %)',
  funded: 'Financement',
  payouts: 'Répartition aux membres',
  payoutLine: '{{pseudo}} · {{shares}} → {{amount}} SOL',
  shares: 'part',
  wallet: 'Adresse (fictive)',
  participants: 'Participants',
  creatorBadge: 'créateur',

  // Rôles du scénario. Ce sont des données de démonstration que l'app
  // possède (contrairement aux rôles d'un vrai pacte, saisis par son
  // créateur) : les traduire garde la vidéo anglaise cohérente.
  role: {
    founder: 'Founder produit',
    engineer: 'Ingénieur Solana',
    design: 'Design & growth',
  },

  step: {
    create: 'Création du pacte « {{titre}} » — part du créateur {{createur}} : {{shares}}',
    add_member: '{{membre}} rejoint le pacte — {{role}}, {{shares}}',
    approve: '{{membre}} approuve les termes du pacte',
    finalize: 'Le créateur finalise « {{titre}} » — le pacte devient finançable',
    fund: '{{montant}} SOL arrivent dans le vault de « {{titre}} »',
    distribute: 'Distribution de {{montant}} SOL — {{frais}} SOL de frais protocole, le reste à {{n}} membres',
  },
};
