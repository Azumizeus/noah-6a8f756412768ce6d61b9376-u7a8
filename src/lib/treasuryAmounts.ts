// src/lib/treasuryAmounts.ts
// ═══════════════════════════════════════════════════════════════════
// Montants de trésorerie lus sur la TRANSACTION, pas sur le journal.
//
// `pact_events.amount_sol` est le chiffre envoyé par le client au moment
// de l'écriture. Il vaut souvent le solde ENTIER du vault, loyer
// d'exemption compris (~0,00089088 SOL), alors que le programme ne
// distribue que `solde - loyer`. Pire : certaines lignes portent ce loyer
// seul sur une transaction qui n'a pas bougé le vault (seuls les frais
// de signature ont bougé). Additionner ces lignes a affiché
// « Distributed 13.6898 SOL » alors que les vaults visibles ne
// retenaient qu'environ 0,0027 SOL.
//
// La chaîne reste la source : le delta de lamports du compte vault dans
// la transaction. Pas de delta, pas de montant — on n'invente pas un
// chiffre de repli à partir du journal.
// ═══════════════════════════════════════════════════════════════════

export const LAMPORTS_PER_SOL = 1_000_000_000;

export interface TxBalanceView {
  accountKeys: string[];
  preBalances: number[];
  postBalances: number[];
}

/**
 * Variation signée du vault, en SOL. Négatif = sortie (distribution).
 * `null` si le vault n'apparaît pas dans la transaction, ou si les
 * tableaux de soldes sont inexploitables.
 */
export function vaultSolDelta(tx: TxBalanceView, vault: string): number | null {
  const i = tx.accountKeys.indexOf(vault);
  if (i < 0) return null;
  const pre = tx.preBalances[i];
  const post = tx.postBalances[i];
  if (!Number.isFinite(pre) || !Number.isFinite(post)) return null;
  return (post - pre) / LAMPORTS_PER_SOL;
}

/** Somme des sorties (deltas négatifs). Les entrées et les trous ne comptent pas. */
export function sumOutflowsSol(deltas: Array<number | null | undefined>): number {
  return deltas.reduce<number>((sum, delta) => {
    if (delta == null || !(delta < 0)) return sum;
    return sum + Math.abs(delta);
  }, 0);
}

type AccountKeyLike =
  | string
  | { toBase58?: () => string; pubkey?: string | { toBase58?: () => string } };

/** Clés de compte d'un message web3.js (legacy, versioned ou jsonParsed). */
export function accountKeysOf(message: {
  accountKeys?: AccountKeyLike[];
  staticAccountKeys?: AccountKeyLike[];
} | null | undefined): string[] {
  if (!message) return [];
  const raw = message.accountKeys ?? message.staticAccountKeys ?? [];
  const out: string[] = [];
  for (const key of raw) {
    const text = accountKeyToString(key);
    if (text) out.push(text);
  }
  return out;
}

function accountKeyToString(key: AccountKeyLike): string {
  if (typeof key === 'string') return key;
  if (!key || typeof key !== 'object') return '';
  if (typeof key.pubkey === 'string') return key.pubkey;
  if (key.pubkey && typeof key.pubkey.toBase58 === 'function') return key.pubkey.toBase58();
  if (typeof key.toBase58 === 'function') return key.toBase58();
  return '';
}
