// src/lib/onchainLimits.ts
//
// Miroir TypeScript des constantes de bornes de programs/workspace/src/lib.rs.
//
// Pourquoi ce fichier existe : ces valeurs étaient recopiées à la main dans
// CreatePactWizard (280, 40, 24), dans AddMemberModal, et dans les compteurs
// de caractères. Chaque upgrade du programme obligeait à les retrouver une par
// une. Un oubli ne casse rien à la compilation : ça part on-chain et ça revient
// en InvalidParameter (6005) au moment de signer, ou — pire — ça tronque
// silencieusement.
//
// ⚠️ TOUTES CES VALEURS SONT DES OCTETS UTF-8, PAS DES CARACTÈRES.
// Un « é » = 2 octets, un emoji = jusqu'à 4. Mesure toujours avec
// utf8ByteLength() de textSafety.ts, jamais avec String.length.

// ---------------------------------------------------------------------------
//  LE FLAG — à passer à true, et rien d'autre à toucher.
// ---------------------------------------------------------------------------
//
// Le programme SOURCE (lib.rs, 21/09) a relevé les bornes : description
// 500 → 800 (contraintes mesurées : coder client create_project ≤ 818,
// update_description ≤ 996, tx ≤ 1232 → 800 = dernier chiffre rond tenable).
//
// Le programme DÉPLOYÉ sur devnet a été upgradé le 21/09 :
//   anchor upgrade target/deploy/workspace.so
//     --program-id 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ
//     --provider.cluster devnet
//   Signature : 5Em7KZYYgxi8bEo5Mn8fpDeHBN71dH7QmsonvZpimsTwUcSQyJ8ZNyBnz5zFd3MinpCY8e9rMkirhHbc21BtATv6
//
// L'IDL du front (src/idl/buildpact.json) a été régénéré depuis
// target/idl/workspace.json et contient bien update_description +
// DescriptionUpdated. Les trois étapes sont donc faites, dans l'ordre.
//
// Si un jour ce flag doit repasser à false (rollback du programme), le front
// retombe automatiquement sur les bornes de l'ancienne version — c'est le
// comportement sûr : envoyer 500 octets à un programme qui en accepte 280
// échoue en InvalidParameter (6005) au moment de signer, après que
// l'utilisateur ait rempli tout le formulaire.
//
// Ordre obligatoire pour tout futur upgrade :
//   1. anchor build
//   2. anchor upgrade --program-id 9quyDwnt… --provider.cluster devnet
//   3. copier target/idl/workspace.json → src/idl/buildpact.json
//   4. seulement ensuite, toucher à ce flag
export const PROGRAM_UPGRADED = true;

/** Seed du PDA project. Plafonné à 32 octets par Solana, jamais négociable. */
export const MAX_PROJECT_ID_LEN = 20;

/** Titre du pact. lib.rs : 80 après upgrade, 40 avant. */
export const MAX_TITLE_LEN = PROGRAM_UPGRADED ? 80 : 40;

/** Description packée ([stage] pitch | Rôles | Seed). lib.rs : 800 / 280. */
export const MAX_DESC_LEN = PROGRAM_UPGRADED ? 800 : 280;

/** Rôle d'un membre, stocké dans Vec<Member>. lib.rs : 32 / 24. */
export const MAX_ROLE_LEN = PROGRAM_UPGRADED ? 32 : 24;

/** MAX_MEMBERS côté programme. Le dépassement rend distribute trop lourd. */
export const MAX_MEMBERS = 8;

/**
 * update_description n'existe que dans le programme upgradé. Sert à masquer
 * le bouton « Corriger la description » tant qu'il déclencherait un
 * « unknown instruction » côté Anchor — une erreur illisible pour l'utilisateur.
 *
 * Consommé par MigratePactButton. Tant que c'est false, le bouton ne rend
 * rien du tout : pas de bouton grisé, pas de tooltip « bientôt disponible ».
 * Un bouton visible mais mort est pire que pas de bouton.
 */
export const CAN_UPDATE_DESCRIPTION = PROGRAM_UPGRADED;
