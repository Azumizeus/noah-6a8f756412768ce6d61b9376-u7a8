// src/components/FreeGrid.tsx
// ═══════════════════════════════════════════════════════════════════
// GRILLE PROFIL V3 (21/09) — reconstruite de zéro, SANS react-grid-layout.
//
// Pourquoi la version précédente a été jetée : RGL + 5 correctifs empilés
// (breakpoint, recompaction, preventCollision, corruption w:1, blocs
// manquants) produisaient des trous permanents (carte 944px à moitié
// vide), des ascenseurs internes à chaque bloc, un resize par crans de
// 32px et une persistance par wallet qui remettait tout à zéro. Le
// résultat était fragile ET moche — deux échecs distincts.
//
// La nouvelle philosophie — « ingénieux mais sans prise de tête » :
//
//  1. VERROUILLÉ par défaut : blocs empilés, hauteur = contenu. Zéro
//     trou, zéro scroll interne, rien à casser par accident.
//  2. Mode ✏️ Personnaliser : drag & drop HTML5 natif pour réordonner
//     (la compaction verticale est implicite — une pile ne peut pas
//     avoir de trous), flèches ↑/↓ accessibles clavier, bord bas
//     tirant pour la hauteur (double-clic = retour à auto).
//  3. ✓ Terminé : sauvegarde + reverrouillage. Persistance par
//     NAVIGATEUR (une seule clé) — même disposition sur tous les
//     wallets, mobile exclu du mode édition (lecture empilée).
//
// Dépendances : aucune. Drag natif + Pointer Events, ~250 lignes.
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLanguage } from '../lib/i18n/LanguageContext';

export interface FreeGridItem {
  id: string;
  content: ReactNode;
  /** Ignoré par la V3 (hauteur = contenu) — conservé pour compat de
   *  l'appelant (MonProfilPage), qui peut cesser de le fournir. */
  defaultLayout?: { x?: number; y?: number; w?: number; h?: number; minW?: number; minH?: number };
}

interface Props {
  /** Clé de stockage — la portée est le NAVIGATEUR, pas le wallet. */
  pageKey: string;
  /** Accepté pour compat, ignoré : la disposition ne dépend plus du wallet. */
  wallet?: string | null;
  items: FreeGridItem[];
  /** Ignoré (V3 : hauteurs en pixels, pas en unités). Compat only. */
  rowHeight?: number;
}

interface SavedLayout {
  v: 3;
  order: string[];
  /** Hauteur forcée en px par bloc. Absent/null = hauteur auto (contenu). */
  heights: Record<string, number>;
}

const STORAGE_PREFIX = 'buildpact_grid_v3_';

function storageKey(pageKey: string): string {
  return STORAGE_PREFIX + pageKey;
}

function loadSaved(pageKey: string): SavedLayout | null {
  try {
    const raw = localStorage.getItem(storageKey(pageKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLayout;
    if (parsed?.v !== 3 || !Array.isArray(parsed.order)) return null;
    return { v: 3, order: parsed.order, heights: parsed.heights ?? {} };
  } catch {
    return null;
  }
}

function save(pageKey: string, layout: SavedLayout): void {
  try {
    localStorage.setItem(storageKey(pageKey), JSON.stringify(layout));
  } catch {
    /* quota plein : non bloquant, la session courante garde ses réglages */
  }
}

/** Fusion ordre sauvegardé + items courants : garde l'ordre connu, ajoute
 *  les nouveaux blocs à la fin, ignore ceux qui n'existent plus. */
function mergeOrder(saved: string[] | null, items: FreeGridItem[]): string[] {
  const ids = items.map((it) => it.id);
  if (!saved) return ids;
  const kept = saved.filter((id) => ids.includes(id));
  const added = ids.filter((id) => !kept.includes(id));
  return [...kept, ...added];
}

export function FreeGrid({ pageKey, items }: Props) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<string[]>(() => mergeOrder(loadSaved(pageKey)?.order ?? null, items));
  const [heights, setHeights] = useState<Record<string, number>>(() => loadSaved(pageKey)?.heights ?? {});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ id: string; startY: number; startH: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Les items peuvent changer (blocs conditionnés au wallet) : réintégrer
  // les nouveaux sans perdre l'ordre personnalisé.
  useEffect(() => {
    setOrder((prev) => mergeOrder(prev, items));
  }, [items]);

  const persist = useCallback(
    (nextOrder: string[], nextHeights: Record<string, number>) => {
      save(pageKey, { v: 3, order: nextOrder, heights: nextHeights });
    },
    [pageKey]
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      setOrder((prev) => {
        const i = prev.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[j]] = [next[j], next[i]];
        persist(next, heights);
        return next;
      });
    },
    [heights, persist]
  );

  const reorder = useCallback(
    (from: string, to: string) => {
      if (from === to) return;
      setOrder((prev) => {
        const next = prev.filter((id) => id !== from);
        next.splice(next.indexOf(to), 0, from);
        persist(next, heights);
        return next;
      });
    },
    [heights, persist]
  );

  // ─── Resize vertical (Pointer Events, capture globale) ───
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => {
      const delta = e.clientY - resizing.startY;
      const next = Math.max(140, resizing.startH + delta);
      setHeights((prev) => ({ ...prev, [resizing.id]: next }));
    };
    const onUp = () => {
      setResizing(null);
      setOrder((prevOrder) => {
        // persister au relâchement avec les hauteurs à jour
        setHeights((finalHeights) => {
          persist(prevOrder, finalHeights);
          return finalHeights;
        });
        return prevOrder;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [resizing, persist]);

  const startResize = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-block="${id}"] .grid-block-body`);
    const currentH = el?.offsetHeight ?? 300;
    setResizing({ id, startY: e.clientY, startH: heights[id] ?? currentH });
  };

  const resetHeight = (id: string) => {
    setHeights((prev) => {
      const next = { ...prev };
      delete next[id];
      persist(order, next);
      return next;
    });
  };

  const resetAll = () => {
    setOrder(items.map((it) => it.id));
    setHeights({});
    persist(items.map((it) => it.id), {});
  };

  const byOrder = order
    .map((id) => items.find((it) => it.id === id))
    .filter((it): it is FreeGridItem => Boolean(it));

  return (
    <div ref={gridRef} className="relative">
      {/* ─── Barre d'outils : Personnaliser / Terminer / Réinitialiser ─── */}
      <div className="mb-3 flex items-center justify-end gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={resetAll}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-accent-violet/40 hover:text-white"
            >
              {t('profile.gridReset')}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg bg-accent-violet px-3 py-1.5 text-xs font-bold text-ink-900 transition hover:opacity-90"
            >
              {t('profile.gridDone')}
            </button>
          </>
        ) : (
          <button
            type="button"
            // HTML5 DnD n'existe pas au doigt : le mode édition est
            // desktop-only. Mobile = lecture empilée, déjà propre.
            className="hidden rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-accent-violet/40 hover:text-white md:block"
            onClick={() => setEditing(true)}
          >
            {t('profile.gridCustomize')}
          </button>
        )}
      </div>

      {/* ─── Pile de blocs ─── */}
      <div className="flex flex-col gap-4">
        {byOrder.map((it, idx) => {
          const h = heights[it.id];
          const isDragging = dragId === it.id;
          return (
            <div
              key={it.id}
              data-block={it.id}
              draggable={editing}
              onDragStart={(e) => {
                setDragId(it.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', it.id);
              }}
              onDragOver={(e) => {
                if (!editing || !dragId || dragId === it.id) return;
                e.preventDefault();
                if (overId !== it.id) setOverId(it.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragId;
                setDragId(null);
                setOverId(null);
                if (from && from !== it.id) reorder(from, it.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={
                'grid-block rounded-2xl transition-shadow ' +
                (editing ? 'cursor-grab active:cursor-grabbing ' : '') +
                (isDragging ? 'opacity-40 ' : '') +
                (editing && overId === it.id && dragId && dragId !== it.id
                  ? 'ring-2 ring-accent-violet/60 '
                  : 'border border-transparent')
              }
            >
              {/* Bandeau d'édition — visible UNIQUEMENT en mode ✏️ */}
              {editing && (
                <div className="flex items-center justify-between gap-2 rounded-t-xl border border-white/10 bg-canvas-700/60 px-3 py-1.5 text-[10px] text-ink-400">
                  <span aria-hidden="true" className="select-none">⠿⠿</span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('profile.gridMoveUp')}
                      title={t('profile.gridMoveUp')}
                      disabled={idx === 0}
                      onClick={() => move(it.id, -1)}
                      className="rounded px-1.5 py-0.5 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={t('profile.gridMoveDown')}
                      title={t('profile.gridMoveDown')}
                      disabled={idx === byOrder.length - 1}
                      onClick={() => move(it.id, 1)}
                      className="rounded px-1.5 py-0.5 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </span>
                </div>
              )}

              {/* Corps : hauteur auto par défaut, forcée seulement si
                  l'utilisateur a tiré le bord bas. Le scroll interne
                  n'apparaît QUE dans ce dernier cas. */}
              <div
                className="grid-block-body rounded-2xl"
                style={
                  h
                    ? { height: h, overflowY: 'auto' }
                    : undefined
                }
              >
                {it.content}
              </div>

              {/* Bord bas de resize — uniquement en mode édition */}
              {editing && (
                <div
                  onPointerDown={(e) => startResize(it.id, e)}
                  onDoubleClick={() => resetHeight(it.id)}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={t('profile.gridResizeHint')}
                  title={t('profile.gridResizeHint')}
                  className="flex h-4 cursor-row-resize items-center justify-center rounded-b-xl text-[9px] text-ink-500 transition-colors hover:bg-accent-violet/10 hover:text-white"
                >
                  ┄
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FreeGrid;
