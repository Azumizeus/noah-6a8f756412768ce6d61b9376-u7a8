// src/lib/i18n/fr.settings.ts
// Namespace `settings` du dictionnaire FR — réglages techniques du panneau
// ProfileSettingsModal (RPC, densité, confidentialité, USD, export CSV).
//
// Extrait de fr.ts, qui a atteint la taille où il ne se modifiait plus d'un
// bloc. Découpage strictement mécanique : `fr.ts` fait `settings: frSettings`,
// donc les clés se résolvent toujours en `settings.xxx` — aucun appel t() à
// changer. Doit rester en miroir de en.settings.ts, clé pour clé : une clé
// présente d'un seul côté ne casse rien, t() renvoie la clé brute et l'écran
// affiche « settings.rpcHeading » — mais seulement dans la langue qui la
// manque, donc exactement le cas que personne ne teste.
import type { Dict } from './types';

export const frSettings: Dict = {
  rpcHeading: 'Endpoint RPC personnalisé',
  // Aide volontairement longue et en 3 temps (c'est quoi / pour quoi /
  // comment) : c'est le seul réglage de l'app qui demande d'aller créer un
  // compte sur un service tiers. Une phrase courte laisserait l'utilisateur
  // coller n'importe quelle URL.
  rpcHint:
    "C'est quoi : l'adresse du serveur qui relaie tes transactions vers le réseau Solana. BuildPact en utilise plusieurs par défaut, en rotation, gratuits et suffisants pour un usage normal — tu n'as rien à faire ici. " +
    "Pour faire quoi : si tu vois des erreurs « 429 » (trop de requêtes) ou des chargements lents aux heures de pointe, coller ta propre clé te donne un quota rien qu'à toi, sans dépendre de la rotation partagée. " +
    "Comment faire : crée un compte gratuit sur helius.dev ou quicknode.com, choisis le réseau « Solana Devnet », copie l'URL fournie (avec ta clé dedans) et colle-la ci-dessous. Effet après rechargement de la page.",
  rpcClear: 'Retirer',
  // Le « recharge la page » n'est pas une précaution de style : CUSTOM_RPC
  // est lu une seule fois au chargement du module (constants.ts), donc
  // l'enregistrement ne change rien avant un reload.
  rpcSaved: 'Enregistré — recharge la page pour l’appliquer.',

  densityHeading: "Densité d'affichage",
  densityComfortable: 'Confortable',
  densityCompact: 'Compact',
  densityHint: 'Compact affiche plus de pacts à l’écran, avec moins d’espace entre les cartes.',

  privacyHeading: 'Confidentialité du profil',
  privacyToggleLabel: 'Masquer mon adresse wallet complète',
  privacyHint:
    "Affiche un pseudo (ou une adresse tronquée) à la place de l'adresse complète sur ton profil public. Les transactions restent vérifiables on-chain — ce réglage ne masque rien à la chaîne, seulement à l'affichage.",
  // Dit pourquoi le bouton n'apparaît pas, au lieu d'une case cochable qui
  // échouerait en silence : ce réglage est un champ de PROFIL, il s'enregistre
  // par signature wallet (voir PremiumSettings).
  privacyNeedsWallet: 'Connecte ton wallet pour modifier ce réglage.',

  // Clés de NotificationSettings (monté depuis ProfileSettingsModal).
  // notifPushUnsupported couvre DEUX cas distincts — navigateur sans Push
  // API, et infrastructure absente côté projet (VITE_VAPID_PUBLIC_KEY,
  // /push-sw.js, Edge Function `push`). Volontairement fondus dans une
  // seule phrase : la distinction n'aide pas l'utilisateur, qui ne peut
  // rien faire dans un cas comme dans l'autre.
  notificationsHeading: 'Notifications',
  notificationsHint:
    'Active les notifications sur cet appareil pour recevoir une alerte réelle (même onglet fermé) sur les types cochés ci-dessous.',
  notifApprovals: 'Approbation de membre',
  notifFunding: 'Financement reçu',
  notifQuests: 'Quête réclamable',
  notifPushDeviceLabel: 'Notifications sur cet appareil',
  notifPushOn: 'Activées — tu recevras de vraies alertes',
  notifPushOff: 'Désactivées — aucune alerte envoyée',
  notifPushUnsupported:
    "Ton navigateur ne supporte pas les notifications push (ou la clé serveur n'est pas configurée).",
  notifPushNeedsWallet: 'Connecte ton wallet pour activer les notifications.',
  notifPushUnexpected: 'Une erreur inattendue est survenue — réessaie.',

  // Diagnostic du service de traduction (TranslationStatus). Chaque état
  // nomme le geste à faire côté projet, pas juste le symptôme : « ça ne
  // marche pas » est précisément ce que l'indicateur existe pour éviter.
  translationHeading: 'Service de traduction',
  translationHint:
    "Teste la fonction serveur qui traduit les messages du chat, du Network et des demandes de contact. Un échec ici n'empêche rien d'autre de fonctionner : les messages restent affichés dans leur langue d'origine.",
  translationServiceLabel: 'Traduction automatique',
  translationIdle: 'État inconnu — lance un test.',
  translationTest: 'Tester',
  translationTesting: 'Test…',
  translationOk: 'Opérationnel — les messages sont traduits.',
  translationQuota:
    'Quota quotidien atteint — le service fonctionne, il reprendra demain.',
  translationKeyMissing:
    'Clé DeepL absente des secrets Supabase (DEEPL_API_KEY) — à ajouter côté projet.',
  translationNotDeployed: "Fonction `translate` non déployée sur le projet Supabase.",
  translationAuthBlocked:
    'Fonction déployée mais protégée par JWT — elle doit être publiée avec --no-verify-jwt.',
  translationUpstream: 'DeepL refuse la requête — clé invalide ou plan expiré.',
  translationUnreachable: 'Service injoignable — réseau coupé ou requête bloquée par le navigateur.',
  translationDisabled: "Supabase n'est pas configuré dans cette version de l'app.",
  translationUnknown: 'Réponse inattendue du serveur.',
  translationByokNote:
    'Ta clé personnelle est active : tes traductions ne passent pas par ce service, ce test ne les concerne pas.',

  usdToggleLabel: 'Afficher l’équivalent USD',
  // « à titre indicatif » est important : le prix vient d'un oracle off-chain
  // et n'entre dans AUCUN calcul de parts ou de montant envoyé.
  usdHint:
    'Estimation via l’oracle Pyth (SOL/USD), à titre indicatif — jamais utilisée pour un calcul on-chain.',
  usdUnavailable: 'indispo',

  exportHeading: 'Export CSV',
  exportHint: 'Télécharge ton historique XP et événements de pacts pour ce wallet.',
  exportButton: 'Exporter en CSV',
  exportEmpty: 'Rien à exporter pour ce wallet.',
};
