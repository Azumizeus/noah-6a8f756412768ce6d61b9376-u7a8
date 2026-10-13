// src/pages/premium/PremiumQuests.tsx
// ═══════════════════════════════════════════════════════════════════
// Panneau « Quêtes » du profil premium : les 3 quêtes hebdomadaires avec
// leur réclamation signée, la chronique on-chain du wallet, et l'historique
// des semaines réclamées.
//
// Seconde et dernière « perdue » de l'inventaire /v1 : tout cela vivait dans
// `components/QuestBoard.tsx`, habillé en `modal-surface` + `text-ink-*` +
// `bg-black/20`, atteignable seulement depuis `MonProfilPage` (legacy).
//
// La mécanique n'est pas rejouée : `claimQuestReward` fabrique le message
// signé et le serveur (`quest-write`) revérifie la complétion réelle avant de
// créditer — jamais sur la foi du client. Rejouer cette logique ici créerait
// un second contrat à tenir aligné sur l'Edge Function, exactement ce que la
// règle « pas de logique dupliquée » interdit.
//
// Ce qui a changé par rapport au legacy, et pourquoi :
//   1. les lectures passent par les variantes `…Result` de lib/gamification,
//      donc une base injoignable s'AFFICHE au lieu de ressembler à « aucune
//      quête, rien de réclamé, aucun événement » (les trois replis d'origine) ;
//   2. l'API de quêtes n'avait aucune surface d'erreur : un échec de
//      réclamation affichait une ligne rouge noyée dans le panneau. Ici
//      l'erreur est annoncée (`role="alert"`) ;
//   3. l'animation de particules au clic (ClaimBurst) n'est pas reprise : elle
//      portait l'habillage legacy et n'apportait aucune information.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  QUEST_BONUS_XP,
  QUEST_CLAIM_XP,
  QUEST_KEYS,
  claimQuestReward,
  fetchClaimedThisWeekResult,
  fetchQuestHistoryResult,
  fetchQuestStreak,
  fetchWalletChronicleResult,
  fetchWeeklyQuestProgressResult,
  type ChronicleEntry,
  type QuestKey,
  type QuestProgress,
  type QuestWeekHistory,
} from '../../lib/gamification';
import {
  CHRONICLE_ICON,
  IconApproveFilled,
  IconBonus,
  IconFinalizeFilled,
  IconFundFilled,
  IconStreak,
} from '../../components/QuestIcons';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import { readErrorLabel } from './premiumReadError';

type Tab = 'quests' | 'chronicle' | 'history';

const QUEST_LABEL_KEY: Record<QuestKey, string> = {
  fund: 'gamification.questFund',
  approve: 'gamification.questApprove',
  finalize: 'gamification.questFinalize',
};

const CHRONICLE_LABEL_KEY: Record<string, string> = {
  create: 'gamification.chronicleCreate',
  approve: 'gamification.chronicleApprove',
  fund: 'gamification.chronicleFund',
  finalize: 'gamification.chronicleFinalize',
  distribute: 'gamification.chronicleDistribute',
  add_member: 'gamification.chronicleAddMember',
};

const TABS: Array<{ id: Tab; key: string }> = [
  { id: 'quests', key: 'gamification.questsTab' },
  { id: 'chronicle', key: 'gamification.chronicleTab' },
  { id: 'history', key: 'gamification.historyTab' },
];

const ROW: React.CSSProperties = {
  background: 'var(--p-bg)',
  border: '1px solid var(--p-line)',
  borderRadius: 'var(--p-radius-xs)',
};

export default function PremiumQuests({ wallet }: { wallet: string }) {
  const { t, lang } = useLanguage();
  const { signMessage } = useWallet();
  const [tab, setTab] = useState<Tab>('quests');

  // `null` = pas encore lu. Distinct de « lu, et vide » : c'est cette
  // distinction qui fait qu'une panne ne s'affiche pas comme une absence.
  const [quests, setQuests] = useState<QuestProgress | null>(null);
  const [claimed, setClaimed] = useState<Set<QuestKey | 'bonus'> | null>(null);
  const [streak, setStreak] = useState(0);
  const [chronicle, setChronicle] = useState<ChronicleEntry[] | null>(null);
  const [history, setHistory] = useState<QuestWeekHistory[] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<QuestKey | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let alive = true;
    setQuests(null);
    setClaimed(null);
    setChronicle(null);
    setHistory(null);
    setError(null);

    fetchWeeklyQuestProgressResult(wallet).then((r) => {
      if (!alive) return;
      if ('error' in r) setError(r.error);
      else setQuests(r.progress);
    });

    fetchClaimedThisWeekResult(wallet).then((r) => {
      if (!alive) return;
      if ('error' in r) setError(r.error);
      else setClaimed(r.claimed);
    });

    // Série de semaines : décoration. `fetchQuestStreak` replie sur 0 en cas
    // d'échec, ce qui a le même effet à l'écran que « aucune série » — assumé,
    // la puce de série disparaît simplement. Ce n'est ni une donnée
    // financière ni un contenu attendu.
    fetchQuestStreak(wallet).then((s) => {
      if (alive) setStreak(s);
    });

    return () => {
      alive = false;
    };
  }, [wallet, reloadToken]);

  // Chronique et historique ne sont lus qu'à l'ouverture de leur onglet : ce
  // sont deux lectures de plus dont l'onglet « Quêtes » n'a pas besoin.
  useEffect(() => {
    if (tab !== 'chronicle' || chronicle !== null) return;
    let alive = true;
    fetchWalletChronicleResult(wallet).then((r) => {
      if (!alive) return;
      if ('error' in r) setError(r.error);
      else setChronicle(r.entries);
    });
    return () => {
      alive = false;
    };
  }, [tab, wallet, chronicle]);

  useEffect(() => {
    if (tab !== 'history' || history !== null) return;
    let alive = true;
    fetchQuestHistoryResult(wallet).then((r) => {
      if (!alive) return;
      if ('error' in r) setError(r.error);
      else setHistory(r.weeks);
    });
    return () => {
      alive = false;
    };
  }, [tab, wallet, history]);

  const handleClaim = async (key: QuestKey) => {
    if (!signMessage) {
      setError(t('gamification.questClaimUnsupported'));
      return;
    }
    setClaiming(key);
    setError(null);
    const res = await claimQuestReward(wallet, key, signMessage);
    setClaiming(null);
    if (!res.ok) {
      setError(res.error ?? t('gamification.questClaimError'));
      return;
    }
    // On relit tout après un crédit : le serveur a pu verser le bonus en plus
    // de la quête, donc l'état local ne peut pas être deviné, seulement relu.
    setReloadToken((n) => n + 1);
  };

  const claimedCount = claimed ? QUEST_KEYS.filter((k) => claimed.has(k)).length : 0;
  const bonusClaimed = claimed?.has('bonus') ?? false;

  return (
    <section
      style={{
        marginTop: 22,
        padding: '18px 20px',
        background: 'var(--p-canvas)',
        border: '1px solid var(--p-line)',
        borderRadius: 'var(--p-radius-lg)',
        boxShadow: 'var(--p-shadow)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--p-ink)', margin: 0 }}>
          {t('gamification.questsHeading')}
        </h2>
        {streak > 0 && (
          <span
            title={t('gamification.questStreak', { n: streak })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 99,
              background: 'var(--p-warn-soft)',
              color: 'var(--p-warn)',
            }}
          >
            <span style={{ display: 'inline-flex', color: 'var(--p-warn)' }}>
              <IconStreak />
            </span>
            {t('gamification.questStreak', { n: streak })}
          </span>
        )}
      </div>

      {/* Une seule surface d'erreur pour le panneau : les trois lectures
          (quêtes, chronique, historique) alimentent les mêmes onglets, et
          empiler trois bandeaux identiques n'aiderait personne. */}
      {error && (
        <p
          role="alert"
          style={{
            fontSize: 11.5,
            lineHeight: 1.6,
            color: 'var(--p-err)',
            background: 'var(--p-bg)',
            border: '1px solid var(--p-err)',
            borderRadius: 'var(--p-radius-xs)',
            padding: '8px 12px',
            margin: '12px 0 0',
          }}
        >
          {readErrorLabel(t, error)}
        </p>
      )}

      <div role="tablist" style={{ display: 'flex', gap: 6, margin: '14px 0 0', flexWrap: 'wrap' }}>
        {TABS.map((entry) => {
          const on = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(entry.id)}
              style={{
                fontSize: 12,
                fontWeight: 650,
                padding: '7px 14px',
                minHeight: 34,
                borderRadius: 99,
                cursor: 'pointer',
                border: '1px solid ' + (on ? 'var(--p-accent)' : 'var(--p-line)'),
                background: on ? 'var(--p-accent-soft)' : 'transparent',
                color: on ? 'var(--p-accent)' : 'var(--p-ink2)',
              }}
            >
              {t(entry.key)}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        {tab === 'quests' && (
          <QuestList
            quests={quests}
            claimed={claimed}
            claimedCount={claimedCount}
            bonusClaimed={bonusClaimed}
            claiming={claiming}
            onClaim={handleClaim}
          />
        )}

        {tab === 'chronicle' &&
          (chronicle === null ? (
            <Skeleton rows={3} />
          ) : chronicle.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--p-ink3)', margin: 0 }}>
              {t('gamification.chronicleEmpty')}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chronicle.map((e, i) => {
                const ChronIcon = CHRONICLE_ICON[e.kind];
                return (
                  <li
                    key={`${e.createdAt}-${i}`}
                    style={{
                      ...ROW,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '8px 12px',
                      fontSize: 11.5,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--p-ink2)' }}>
                      {ChronIcon ? (
                        <span style={{ display: 'inline-flex', color: 'var(--p-ink3)' }}>
                          <ChronIcon />
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--p-ink3)' }}
                        />
                      )}
                      {t(CHRONICLE_LABEL_KEY[e.kind] ?? e.kind)}
                      {e.amountSol !== null && (
                        <span style={{ fontFamily: 'var(--p-font-display)', color: 'var(--p-ok)' }}>
                          {e.amountSol.toFixed(2)} SOL
                        </span>
                      )}
                    </span>
                    <span style={{ flexShrink: 0, fontFamily: 'var(--p-font-display)', color: 'var(--p-ink3)' }}>
                      {new Date(e.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          ))}

        {tab === 'history' &&
          (history === null ? (
            <Skeleton rows={3} />
          ) : history.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--p-ink3)', margin: 0 }}>
              {t('gamification.historyEmpty')}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map((week) => (
                <li key={week.weekStart} style={{ ...ROW, padding: '8px 12px', fontSize: 11.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontFamily: 'var(--p-font-display)', color: 'var(--p-ink2)' }}>
                      {t('gamification.historyWeekOf')} {week.weekStart}
                    </span>
                    <span style={{ fontFamily: 'var(--p-font-display)', fontWeight: 700, color: 'var(--p-ok)' }}>
                      +{week.xpTotal} XP
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    {QUEST_KEYS.map((k) => (
                      <span
                        key={k}
                        style={{
                          display: 'inline-flex',
                          color: week.claimedKeys.includes(k) ? 'var(--p-warn)' : 'var(--p-line)',
                        }}
                      >
                        <QuestBadgeIcon questKey={k} />
                      </span>
                    ))}
                    {week.claimedKeys.includes('bonus') && (
                      <span style={{ fontSize: 10.5, color: 'var(--p-warn)' }}>
                        {t('gamification.historyBonusIncluded')}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}

/** Pastille de badge d'une quête — la même icône pleine que la liste de la
 *  semaine, dans les deux contextes (liste active et historique) : une quête
 *  acquise doit se reconnaître au même glyphe partout. */
function QuestBadgeIcon({ questKey }: { questKey: QuestKey }) {
  if (questKey === 'fund') return <IconFundFilled />;
  if (questKey === 'approve') return <IconApproveFilled />;
  return <IconFinalizeFilled />;
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            height: 38,
            background: 'var(--p-bg)',
            border: '1px solid var(--p-line)',
            borderRadius: 'var(--p-radius-xs)',
          }}
        />
      ))}
    </div>
  );
}

interface QuestListProps {
  quests: QuestProgress | null;
  claimed: Set<QuestKey | 'bonus'> | null;
  claimedCount: number;
  bonusClaimed: boolean;
  claiming: QuestKey | null;
  onClaim: (key: QuestKey) => void;
}

function QuestList({ quests, claimed, claimedCount, bonusClaimed, claiming, onClaim }: QuestListProps) {
  const { t } = useLanguage();
  if (quests === null || claimed === null) return <Skeleton rows={3} />;

  return (
    <>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {QUEST_KEYS.map((key) => {
          const q = quests[key];
          const done = q.done >= q.target;
          const isClaimed = claimed.has(key);
          // Trois états seulement, et ils sont exclusifs : réclamé l'emporte
          // sur « atteint », sinon une quête payée resterait cliquable.
          const state: 'todo' | 'claimable' | 'claimed' = isClaimed
            ? 'claimed'
            : done
              ? 'claimable'
              : 'todo';
          return (
            <li
              key={key}
              style={{
                ...ROW,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                fontSize: 12,
                borderColor:
                  state === 'claimed'
                    ? 'var(--p-ok)'
                    : state === 'claimable'
                      ? 'var(--p-warn)'
                      : 'var(--p-line)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: 99,
                    border: '1px solid var(--p-line)',
                    background: 'var(--p-canvas)',
                    color:
                      state === 'claimed'
                        ? 'var(--p-ok)'
                        : state === 'claimable'
                          ? 'var(--p-warn)'
                          : 'var(--p-ink3)',
                  }}
                >
                  <QuestBadgeIcon questKey={key} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--p-ink)' }}>
                    {t(QUEST_LABEL_KEY[key])}
                    {!isClaimed && (
                      <span
                        style={{
                          fontFamily: 'var(--p-font-display)',
                          fontSize: 10,
                          padding: '1px 7px',
                          borderRadius: 99,
                          border: '1px solid var(--p-line)',
                          color: 'var(--p-ink3)',
                        }}
                      >
                        +{QUEST_CLAIM_XP[key]} XP
                      </span>
                    )}
                  </span>
                  {state === 'todo' && q.target > 1 && (
                    <span
                      aria-hidden="true"
                      style={{ display: 'block', width: 96, height: 4, borderRadius: 99, background: 'var(--p-line)', overflow: 'hidden' }}
                    >
                      <span
                        style={{
                          display: 'block',
                          height: '100%',
                          borderRadius: 99,
                          background: 'var(--p-accent)',
                          width: `${Math.min(100, (q.done / q.target) * 100)}%`,
                        }}
                      />
                    </span>
                  )}
                </span>
              </span>

              {isClaimed ? (
                <span style={{ fontFamily: 'var(--p-font-display)', fontSize: 11.5, fontWeight: 700, color: 'var(--p-ok)' }}>
                  ✓ {t('gamification.questClaimed')}
                </span>
              ) : done ? (
                <button
                  type="button"
                  onClick={() => onClaim(key)}
                  disabled={claiming === key}
                  style={{
                    flexShrink: 0,
                    padding: '7px 13px',
                    minHeight: 34,
                    borderRadius: 'var(--p-radius-xs)',
                    border: 0,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: claiming === key ? 'default' : 'pointer',
                    background: 'var(--p-warn)',
                    color: 'var(--p-canvas)',
                    opacity: claiming === key ? 0.5 : 1,
                  }}
                >
                  {claiming === key
                    ? t('gamification.questClaiming')
                    : t('gamification.questClaimButton', { n: QUEST_CLAIM_XP[key] })}
                </button>
              ) : (
                <span style={{ flexShrink: 0, fontFamily: 'var(--p-font-display)', fontSize: 11.5, color: 'var(--p-ink3)' }}>
                  {t('gamification.questProgress', { done: q.done, total: q.target })}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          fontSize: 11.5,
          lineHeight: 1.5,
          borderRadius: 'var(--p-radius-xs)',
          border: '1px solid ' + (bonusClaimed ? 'var(--p-warn)' : 'var(--p-line)'),
          background: bonusClaimed ? 'var(--p-warn-soft)' : 'var(--p-bg)',
          color: bonusClaimed ? 'var(--p-warn)' : 'var(--p-ink3)',
        }}
      >
        <span style={{ display: 'inline-flex', flexShrink: 0 }}>
          <IconBonus />
        </span>
        {bonusClaimed
          ? t('gamification.questBonusClaimed', { n: QUEST_BONUS_XP })
          : t('gamification.questBonusTeaser', {
              done: claimedCount,
              total: QUEST_KEYS.length,
              n: QUEST_BONUS_XP,
            })}
      </div>
    </>
  );
}
