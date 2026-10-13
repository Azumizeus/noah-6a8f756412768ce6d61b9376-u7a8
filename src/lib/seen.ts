// src/lib/seen.ts
// ═══════════════════════════════════════════════════════════════════
// Marqueurs "vu/pas vu" 100% locaux (localStorage), par device — pas de
// sync serveur, volontairement simple pour un badge de notification
// hackathon. Sert pour le chat (lecture publique) et le vault (juste le
// compteur/date, jamais le contenu — voir project_documents_summary).
// ═══════════════════════════════════════════════════════════════════

type SeenKind = 'chat' | 'vault';

function key(kind: SeenKind, projectPda: string): string {
  return `buildpact_seen_${kind}_${projectPda}`;
}

export function getLastSeen(kind: SeenKind, projectPda: string): number {
  try {
    const raw = localStorage.getItem(key(kind, projectPda));
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

export function markSeenNow(kind: SeenKind, projectPda: string): void {
  try {
    localStorage.setItem(key(kind, projectPda), String(Date.now()));
  } catch {
    /* stockage indisponible — non bloquant, le badge réapparaîtra simplement */
  }
}

/** true si `timestampMs` est postérieur au dernier "vu" enregistré pour ce projet. */
export function isUnseen(kind: SeenKind, projectPda: string, timestampMs: number | null): boolean {
  if (!timestampMs) return false;
  return timestampMs > getLastSeen(kind, projectPda);
}
