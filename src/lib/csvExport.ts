// src/lib/csvExport.ts
// Export CSV de l'historique d'un wallet — deux sources fusionnées :
//
//   • xp_events   → ce qui a été GAGNÉ   (ledger XP, écrit par project-write)
//   • pact_events → ce qui a été FAIT    (actions on-chain vérifiées)
//
// Les deux tables sont en lecture publique (RLS `xp_events_select_public`
// / `pact_events_public_read`), donc tout se fait côté client : aucune
// Edge Function à maintenir pour un export que l'utilisateur déclenche
// lui-même.
import { supabase } from './supabaseClient';
import { fetchWalletChronicle } from './gamification';

interface CsvRow {
  date: string;
  category: 'xp' | 'pact';
  detail: string;
  // `''` et non 0 : une ligne XP n'a pas de montant en SOL, et un 0
  // se lirait comme « transaction à zéro SOL » dans un tableur.
  amountXp: number | '';
  amountSol: number | '';
  projectPda: string;
}

async function fetchXpRows(wallet: string): Promise<CsvRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('xp_events')
    .select('source, amount, project_pda, created_at')
    .eq('wallet', wallet)
    .order('created_at', { ascending: false })
    .limit(2000);
  // Erreur = CSV partiel plutôt qu'export échoué : mieux vaut livrer la
  // moitié des lignes qu'un message d'erreur sur un export manuel.
  if (error || !data) return [];
  return data.map((r) => ({
    date: r.created_at as string,
    category: 'xp' as const,
    detail: r.source as string,
    amountXp: Number(r.amount ?? 0),
    amountSol: '' as const,
    projectPda: (r.project_pda as string) ?? '',
  }));
}

async function fetchPactRows(wallet: string): Promise<CsvRow[]> {
  const chronicle = await fetchWalletChronicle(wallet, 2000);
  return chronicle.map((c) => ({
    date: c.createdAt,
    category: 'pact' as const,
    detail: c.kind,
    amountXp: '' as const,
    amountSol: c.amountSol ?? ('' as const),
    projectPda: c.projectPda,
  }));
}

function toCsv(rows: CsvRow[]): string {
  const header = ['date', 'categorie', 'detail', 'xp', 'sol', 'project_pda'];
  // Échappement RFC 4180 : guillemets doublés, champ entouré dès qu'il
  // contient une virgule, un guillemet ou un saut de ligne. Sans ça, un
  // `detail` contenant une virgule décale toutes les colonnes suivantes.
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.date, r.category, r.detail, r.amountXp, r.amountSol, r.projectPda].map(escape).join(',')
  );
  return [header.join(','), ...lines].join('\n');
}

/** `null` si le wallet n'a aucune ligne — permet au bouton d'afficher
 *  « rien à exporter » au lieu de télécharger un fichier vide. */
export async function buildWalletHistoryCsv(wallet: string): Promise<string | null> {
  const [xpRows, pactRows] = await Promise.all([fetchXpRows(wallet), fetchPactRows(wallet)]);
  // Tri lexicographique sur des dates ISO : valide, elles sont toutes en
  // UTC avec le même format (pas de comparaison de Date à construire).
  const all = [...xpRows, ...pactRows].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (all.length === 0) return null;
  return toCsv(all);
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // L'ancre doit être DANS le document pour que le clic synthétique
  // déclenche le téléchargement sur Firefox.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Sans revokeObjectURL le blob reste en mémoire jusqu'au rechargement.
  URL.revokeObjectURL(url);
}
