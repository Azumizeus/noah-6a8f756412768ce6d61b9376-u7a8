// src/lib/hiddenPacts.ts
// ═══════════════════════════════════════════════════════════════════
// Liste noire des pacts de test technique.
//
// ⚠️ POURQUOI CE FICHIER EXISTE — cause racine d'un bug récurrent.
//
// Cette liste vivait en constante privée dans `useProjects.ts`. Elle y
// faisait correctement son travail pour la grille de pacts, le Marketplace
// et le Treasury. Mais dès qu'un NOUVEAU sélecteur de pact est apparu
// ailleurs dans l'app (choisir un pact de référence dans un post), son
// auteur n'avait aucun moyen de la réutiliser : elle n'était pas exportée,
// et rien ne signalait son existence. Les pacts de test sont donc réapparus
// dans le menu déroulant.
//
// Ce n'est pas une étourderie isolée, c'est un défaut de structure : une
// règle métier globale (« ces pacts ne sont jamais montrés ») était rangée
// dans le détail d'implémentation d'un seul hook. Tant qu'elle y restait,
// chaque nouvelle surface d'affichage repartait sans le filtre.
//
// Règle : TOUTE liste de pacts exposée à un utilisateur passe par
// `filterVisiblePacts()` ou `isHiddenPact()`. Aucune exception.
// ═══════════════════════════════════════════════════════════════════

/** Pacts de test technique à ne jamais montrer publiquement (voir audit UI/UX #3). */
export const HIDDEN_PACT_PDAS = new Set<string>([
  '2n32pfWXDbYLLzy9ky3vj6xH4PFM2S7EXAGqsF83aLqc', // Nexus Markdown Ünïcode (test)
  'FBHXCus7YeeXNC9ZuRnhePvkyW798wetc3dA4x5Zg2Zc', // Café (test)
]);

/**
 * Accepte une adresse sous forme de chaîne OU d'objet à `toBase58()`.
 *
 * Ce n'est pas du confort : selon l'endroit, un PDA circule tantôt en
 * `PublicKey` (sortie RPC), tantôt en `string` (props, URL, Supabase).
 * Une signature qui n'accepterait que l'un des deux inviterait à écrire
 * `String(pda)` à l'appel — et `String(publicKey)` renvoie bien du base58,
 * donc le bug ne se verrait qu'au cas limite.
 */
export function isHiddenPact(pda: string | { toBase58(): string }): boolean {
  const key = typeof pda === 'string' ? pda : pda.toBase58();
  return HIDDEN_PACT_PDAS.has(key);
}

/**
 * Filtre générique. Le second argument dit où trouver le PDA dans l'élément,
 * ce qui permet d'appliquer la règle à n'importe quelle forme de liste
 * (comptes Anchor bruts, ChainPact mappés, lignes Supabase) sans dupliquer
 * la logique.
 */
export function filterVisiblePacts<T>(
  items: T[],
  getPda: (item: T) => string | { toBase58(): string }
): T[] {
  return items.filter((item) => !isHiddenPact(getPda(item)));
}
