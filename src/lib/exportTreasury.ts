// src/lib/exportTreasury.ts
// ═══════════════════════════════════════════════════════════════════
// Export CSV/JSON de l'historique Treasury — 100% côté client, à partir
// des données déjà récupérées par useTreasury() (aucun appel réseau
// supplémentaire, aucune donnée inventée).
// ═══════════════════════════════════════════════════════════════════
import type { TreasuryFlow } from '../hooks/useProjects';

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  // ⚠️ Audit 19/09 : injection de formule Excel — un titre on-chain
  // commençant par =, +, - ou @ peut s'exécuter à l'ouverture du CSV
  // (=HYPERLINK…). Les débuts suspects sont préfixés par une apostrophe
  // (convention standard Excel/Sheets) en plus de l'échappement quotes.
  const dangerous = /^[=+\-@\t\r]/.test(value);
  const safe = dangerous ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

export function downloadTreasuryCsv(flows: TreasuryFlow[]): void {
  const header = ['signature', 'label', 'project_title', 'amount_sol', 'when_iso', 'explorer_url'];
  const rows = flows.map((f) => [
    f.signature,
    f.label,
    f.projectTitle,
    f.amountSol.toString(),
    f.when ? new Date(f.when * 1000).toISOString() : '',
    `https://explorer.solana.com/tx/${f.signature}?cluster=devnet`,
  ]);
  const csv = [header, ...rows].map((row) => row.map((c) => csvEscape(String(c))).join(',')).join('\n');
  triggerDownload(csv, `buildpact-treasury-${timestamp()}.csv`, 'text/csv;charset=utf-8');
}

export function downloadTreasuryJson(
  flows: TreasuryFlow[],
  summary: { totalValueLockedSol: number; distributedRecentSol: number; pendingClaimsSol: number }
): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    cluster: 'devnet',
    summary,
    flows,
  };
  triggerDownload(JSON.stringify(payload, null, 2), `buildpact-treasury-${timestamp()}.json`, 'application/json');
}
