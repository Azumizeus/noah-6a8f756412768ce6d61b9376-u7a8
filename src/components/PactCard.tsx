import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { approve, distributeWithReceipt, closeProject, findVaultPda } from '../lib/anchor';
import { triggerPushNotification } from '../lib/pushNotifications';
import { useAnchorProgram } from '../hooks/useProjects';
import { formatSol, formatAddress, parseTxError, explorerTxUrl, explorerAddressUrl, needsDescriptionMigration } from '../lib/pacts';
import { logPactEvent } from '../lib/activity';
import { fetchLatestChatTimestamp } from '../lib/chat';
import { fetchVaultSummary } from '../lib/vault';
import { isUnseen } from '../lib/seen';
import type { Pact, PactAction, DistributionReceipt } from '../types/pact';
import type { ProjectMedia } from '../lib/media';
import AddMemberModal from './AddMemberModal';
import EditMediaModal from './EditMediaModal';
import EditDescriptionModal from './EditDescriptionModal';
import ImageHoverPreview from './ImageHoverPreview';
import { parsePitch, stageBadgeLabel } from '../lib/pitch';
import PactTimeline from './pact/PactTimeline';
import OrbitalCapTable from './pact/OrbitalCapTable';
import VaultShareGauge from './pact/VaultShareGauge';
import { useLanguage } from '../lib/i18n/LanguageContext';

// Dégradé de secours déterministe si pas de bannière uploadée (même logique que MarketplaceCard)
function fallbackBannerStyle(seed: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue1 = hash % 360;
  const hue2 = (hue1 + 60 + ((hash >> 8) % 60)) % 360;
  return { background: `linear-gradient(135deg, hsl(${hue1} 70% 22%), hsl(${hue2} 70% 14%))` };
}

interface Props {
  pact: Pact;
  walletConnected: boolean;
  busyAction: PactAction | null;
  onFund: (pact: Pact, amount: number) => void;
  onFinalize: (pact: Pact) => void;
  /** @deprecated — distribute géré en interne (reçu signé). Prop conservée pour compat parent, ignorée. */
  onDistribute?: (pact: Pact) => void;
  /** Ferme le bandeau Fund/Finalize du haut au démarrage d'une distribution,
   *  pour éviter qu'un vieux message reste affiché au-dessus du nouveau reçu. */
  clearTopBanner?: () => void;
  /** BUG FIX : appelé juste après une distribution confirmée on-chain, pour que
   *  le parent refetch les comptes (vault balance / claimable restaient figés
   *  à l'ancienne valeur sinon — handleDistribute() gère le reçu en interne et
   *  ne passait jamais par usePactActions().runDistribute(), qui est le seul
   *  endroit qui appelait refresh() jusqu'ici). */
  onDistributed?: () => void;
  /** Logo/bannière du projet (Supabase, off-chain) — absent si jamais uploadé. */
  media?: ProjectMedia;
  /** Appelé après un upload réussi depuis EditMediaModal, pour que le parent
   *  rafraîchisse sa Map de médias (useProjectMedia().refresh()). */
  onMediaUpdated?: () => void;
  /** false quand PactCard est déjà affiché SUR la fiche du pact
   *  (PactPublicPage, qui rend chat + vault juste en dessous) — le bouton
   *  "Discussion & Vault" n'a alors plus aucune utilité (on y est déjà) et
   *  ne fait que dupliquer l'accès. Par défaut true (Dashboard/Pacts, où le
   *  bouton est le point d'entrée vers la fiche). */
  showOpenSheetButton?: boolean;
}

// ─── Reçus de distribution persistés en sessionStorage (survit à un reload) ───
const RECEIPTS_KEY = 'buildpact-distribution-receipts';

function loadReceipts(): Record<string, DistributionReceipt> {
  try {
    const raw = sessionStorage.getItem(RECEIPTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DistributionReceipt>) : {};
  } catch {
    return {};
  }
}

function saveReceipt(
  pdaKey: string,
  receipt: DistributionReceipt
): Record<string, DistributionReceipt> {
  const all = loadReceipts();
  all[pdaKey] = receipt;
  try {
    sessionStorage.setItem(RECEIPTS_KEY, JSON.stringify(all));
  } catch {
    /* stockage plein/refusé → non bloquant, reçu conservé en mémoire */
  }
  return all;
}

function clearReceipt(pdaKey: string): Record<string, DistributionReceipt> {
  const all = loadReceipts();
  delete all[pdaKey];
  try {
    sessionStorage.setItem(RECEIPTS_KEY, JSON.stringify(all));
  } catch {
    /* idem */
  }
  return all;
}

export default function PactCard({
  pact,
  walletConnected,
  busyAction,
  onFund,
  onFinalize,
  clearTopBanner,
  onDistributed,
  media,
  onMediaUpdated,
  showOpenSheetButton = true,
}: Props) {
  const { publicKey, signMessage } = useWallet();
  const { t, lang } = useLanguage();
  const program = useAnchorProgram();
  const [fundAmount, setFundAmount] = useState('0.1');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditMedia, setShowEditMedia] = useState(false);
  const [showEditDescription, setShowEditDescription] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSig, setApproveSig] = useState<string | null>(null);
  const [distributing, setDistributing] = useState(false);
  const [distributeError, setDistributeError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, DistributionReceipt>>(
    () => loadReceipts()
  );

  const pdaKey = pact.pda.toBase58();
  const vaultPdaKey = findVaultPda(pact.pda)[0].toBase58();
  const receipt = receipts[pdaKey];
  const busy = busyAction !== null;

  // Badges "nouveau" — best-effort, 100% côté client (localStorage), voir lib/seen.ts.
  // Chat = lecture publique ; vault = juste compteur/date (project_documents_summary),
  // jamais le contenu confidentiel des documents eux-mêmes.
  const [chatUnseen, setChatUnseen] = useState(false);
  const [vaultUnseen, setVaultUnseen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchLatestChatTimestamp(pdaKey).then((iso) => {
      if (!cancelled) setChatUnseen(isUnseen('chat', pdaKey, iso ? new Date(iso).getTime() : null));
    });
    fetchVaultSummary(pdaKey).then((s) => {
      if (!cancelled) setVaultUnseen(isUnseen('vault', pdaKey, s.latestAt ? new Date(s.latestAt).getTime() : null));
    });
    return () => { cancelled = true; };
  }, [pdaKey]);

  const statusColor =
    pact.status === 'active'
      ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
      : 'text-amber-400 border-amber-400/30 bg-amber-400/10';
  const statusLabel = pact.status === 'active' ? t('pactCard.finalized') : t('pactCard.open');

  const myAddr = publicKey?.toBase58();
  const me = pact.members.find((m) => m.wallet.toBase58() === myAddr);
  const iAmMember = !!me;
  const iHaveApproved = me?.approved ?? false;
  const iAmCreator = pact.creator.toBase58() === myAddr;
  const approvedCount = pact.members.filter((m) => m.approved).length;
  const allApproved =
    pact.members.length > 0 && pact.members.every((m) => m.approved);

  // Total des parts — le program exige EXACTEMENT 10000 bps (100%)
  const totalBps = pact.members.reduce((sum, m) => sum + m.shareBps, 0);
  const sharesComplete = totalBps === 10000;
  const totalPct = totalBps / 100;

  const canFinalize =
    pact.members.length >= 2 && allApproved && sharesComplete && iAmCreator;
  const canDistribute = pact.vaultBalanceSol > 0;

  const handleApprove = async () => {
    if (!publicKey || !program) return;
    setApproving(true);
    setApproveError(null);
    try {
      const sig = await approve(program, publicKey, pact.pda);
      // ⚠️ Pas de reload immédiat : on laisse le lien Explorer visible,
      // l'utilisateur rafraîchit lui-même une fois qu'il l'a vu/copié.
      setApproveSig(sig);
      logPactEvent({ projectPda: pdaKey, kind: 'approve', actor: publicKey.toBase58(), txSig: sig });
      // Push best-effort — ne doit jamais bloquer/faire échouer l'approbation
      // elle-même (voir triggerPushNotification, tuyau posé mais jusqu'ici
      // jamais appelé nulle part : point d'appel manquant, pas un bug de la
      // fonction). Silencieux si pas de signMessage ou si le wallet refuse
      // de signer : l'action approve() a déjà réussi, la notification est
      // secondaire.
      if (signMessage) {
        const actorWallet = publicKey.toBase58();
        triggerPushNotification({
          actorWallet,
          projectPda: pdaKey,
          type: 'approvals',
          wallets: pact.members.map((m) => m.wallet.toBase58()).filter((w) => w !== actorWallet),
          title: 'BuildPact',
          body: `${formatAddress(actorWallet)} a approuvé « ${pact.title} »`,
          url: `/#/pact/${pdaKey}`,
          signMessage,
        }).catch(() => {
          /* best-effort — voir commentaire ci-dessus */
        });
      }
    } catch (e) {
      setApproveError(parseTxError(e));
    } finally {
      setApproving(false);
    }
  };

  const handleDistribute = async () => {
    if (!publicKey || !program) return;
    clearTopBanner?.();
    setDistributing(true);
    setDistributeError(null);
    try {
      const r = await distributeWithReceipt(program, publicKey, pact);
      setReceipts(saveReceipt(pdaKey, r));
      logPactEvent({ projectPda: pdaKey, kind: 'distribute', actor: publicKey.toBase58(), amountSol: r.grossSol, txSig: r.signature });
      // Sans ça, "Your claimable" / "Vault balance" restent figés à l'ancienne
      // valeur : le reçu ci-dessous est correct, mais les chiffres du haut de
      // la carte ne bougent qu'après un refresh manuel de la page.
      onDistributed?.();
    } catch (e) {
      setDistributeError(parseTxError(e));
    } finally {
      setDistributing(false);
    }
  };

  const handleCancel = async () => {
    if (!publicKey || !program) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await closeProject(program, publicKey, pact.pda);
      // ⚠️ close_project ferme le compte Project (compte supprimé on-chain,
      // rent + solde vault restant remboursés au creator) — la carte elle-
      // même n'existe plus après ça. Un reload complet est le moyen le plus
      // sûr de faire disparaître ce pact de la liste sans état incohérent
      // (même pattern que AddMemberModal après un succès).
      window.location.reload();
    } catch (e) {
      setCancelError(parseTxError(e));
      setCancelling(false);
    }
  };

  const finalizeBlockReason = !iAmCreator
    ? t('pactCard.onlyFounderFinalize')
    : pact.members.length < 2
      ? t('pactCard.addAtLeast2')
      : !sharesComplete
        ? t('pactCard.sharesMustBe100', { pct: totalPct.toFixed(2) })
        : !allApproved
          ? t('pactCard.approvalsCount', { done: approvedCount, total: pact.members.length })
          : '';

  const isDetailView = !showOpenSheetButton;
  const parsed = parsePitch(pact.description);

  return (
    <>
      <article className="glass-panel card-lift group relative overflow-hidden rounded-2xl border border-white/5 p-6">
        {/* Bannière — bleed jusqu'aux bords du card grâce à overflow-hidden sur <article> */}
        {isDetailView ? (
          <div className="-mx-6 -mt-6 mb-4 relative h-40 w-[calc(100%+3rem)] overflow-hidden sm:h-52">
            {media?.bannerUrl ? (
              <ImageHoverPreview src={media.bannerUrl} alt={pact.title} kind="banner" className="h-full w-full">
                <img src={media.bannerUrl} alt="" className="h-full w-full object-cover" />
              </ImageHoverPreview>
            ) : (
              <div className="h-full w-full" style={fallbackBannerStyle(pdaKey)} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <h3 className="absolute inset-x-4 bottom-3 truncate font-sans text-2xl font-bold text-white drop-shadow-lg sm:inset-x-5 sm:text-3xl">
              {pact.title}
            </h3>
          </div>
        ) : (
          media?.bannerUrl && (
            <div className="-mx-6 -mt-6 mb-4 h-28 w-[calc(100%+3rem)] sm:h-36">
              <ImageHoverPreview src={media.bannerUrl} alt={pact.title} kind="banner" className="h-full w-full">
                <img src={media.bannerUrl} alt="" className="h-full w-full object-cover" />
              </ImageHoverPreview>
            </div>
          )
        )}

        <div className="mb-4 flex items-start justify-between gap-2">
          {/* min-w-0 : sans ça, un flex-item garde `min-width: auto` par défaut
              et refuse de rétrécir sous la largeur de son contenu — c'est ce
              qui forçait le titre à se compresser mot par mot au lieu de
              wrapper normalement (bug mobile signalé, voir colonne de droite
              ci-dessous pour la cause symétrique). */}
          <div className="flex min-w-0 items-start gap-3">
            {media?.logoUrl && (
              <ImageHoverPreview src={media.logoUrl} alt={pact.title} kind="logo" className="shrink-0">
                <img
                  src={media.logoUrl}
                  alt=""
                  className="h-10 w-10 rounded-lg object-cover ring-1 ring-white/10"
                />
              </ImageHoverPreview>
            )}
            <div className="min-w-0">
              {!isDetailView && (
                <h3 className="font-sans text-lg font-semibold text-white">
                  {pact.title}
                </h3>
              )}
              <p className={isDetailView ? 'font-mono text-xs text-ink-400' : 'mt-1 font-mono text-xs text-ink-400'}>
                {t('pactCard.creatorLabel')} {formatAddress(pact.creator.toBase58())}
              </p>
              {(chatUnseen || vaultUnseen) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {chatUnseen && (
                    <a href={`#/pact/${pdaKey}`} className="rounded-full border border-accent-neon/30 bg-accent-neon/10 px-2 py-0.5 text-[10px] font-medium text-accent-neon">
                      {t('pactCard.newChat')}
                    </a>
                  )}
                  {vaultUnseen && (
                    <a href={`#/pact/${pdaKey}`} className="rounded-full border border-accent-violet/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-accent-violet">
                      {t('pactCard.newDoc')}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* ⚠️ Bug mobile corrigé ici : cette colonne était en `shrink-0`
              avec du texte sans contrainte de largeur (liens Historique/
              Vault/Edit + badge de statut). En `shrink-0`, un flex-item
              prend sa largeur "max-content" — celle du texte non wrappé —
              QUELLE QUE SOIT la place réelle disponible. Sur un écran
              étroit, ça poussait toute la carte plus large que l'écran :
              le titre se compressait mot par mot (voir min-w-0 côté
              gauche) et ces libellés étaient tronqués/coupés par le cadre.
              Fix : `min-w-0` (autorise le rétrécissement) + `max-w-[45%]`
              sur mobile (force le retour à la ligne DANS la colonne plutôt
              que de la laisser s'étendre) — désactivé au-delà de `sm:`,
              où la carte a toujours eu assez de place. */}
          <div className="flex min-w-0 max-w-[45%] flex-col items-end gap-1.5 sm:max-w-none sm:shrink-0">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusColor}`}
            >
              {statusLabel}
            </span>
            <a
              href={`#/pact/${pdaKey}`}
              className="text-right text-[11px] text-ink-400 underline-offset-2 hover:text-accent-neon hover:underline"
              title="Voir la fiche publique de ce pact (lien partageable, sans wallet requis)"
            >
              {t('pactCard.sharePactLink')}
            </a>
            {/* Preuve on-chain canonique — indépendante de tout log applicatif
                (ActivityFeed ne montre que ce que CE frontend a loggé côté
                Supabase). Un juge doit pouvoir vérifier l'historique complet
                même si Supabase est down ou n'a jamais tourné pour ce pact. */}
            {/* Libellés explicites plutôt que "Projet"/"Vault" tout secs —
                un juge (ou n'importe qui) doit comprendre sans survoler. */}
            <span className="flex flex-col items-end gap-0.5 text-right text-[11px] text-ink-400">
              <a
                href={explorerAddressUrl(pdaKey)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-accent-neon hover:underline"
                title={t('pactCard.historyLinkTitle')}
              >
                {t('pactCard.historyLink')}
              </a>
              <a
                href={explorerAddressUrl(vaultPdaKey)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-accent-neon hover:underline"
                title={t('pactCard.vaultLinkTitle')}
              >
                {t('pactCard.vaultLink')}
              </a>
            </span>
            {iAmCreator && (
              <button
                type="button"
                onClick={() => setShowEditMedia(true)}
                className="text-right text-[11px] text-ink-400 underline-offset-2 hover:text-accent-neon hover:underline"
              >
                🖼️ {media?.logoUrl || media?.bannerUrl || media?.pitchVideoUrl ? t('pactCard.editMedia') : t('pactCard.addMedia')}
              </button>
            )}
            {/* Édition de la description on-chain — voir EditDescriptionModal.tsx
                pour pourquoi ce bouton n'existait nulle part avant : la fonction
                update_description existait dans lib/anchor.ts, mais rien ne
                l'appelait. needsDescriptionMigration() décide juste si on affiche
                le bandeau "migration", pas si le bouton apparaît.

                ⚠️ Verrou après finalisation : le programme rejette
                update_description dès que le pact n'est plus Open
                (lib.rs — require!(project.status == ProjectStatus::Open,
                ErrorCode::AlreadyFinalized), erreur 6014). Modifier le texte
                après coup reviendrait à altérer ce que les autres membres ont
                approuvé. Le bouton était affiché à tout iAmCreator sans tenir
                compte du statut → la transaction partait puis échouait on-chain.
                On affiche donc un état verrouillé explicite à la place. */}
            {iAmCreator &&
              (pact.status !== 'active' ? (
                <button
                  type="button"
                  onClick={() => setShowEditDescription(true)}
                  className="text-[11px] text-ink-400 underline-offset-2 hover:text-accent-neon hover:underline"
                >
                  ✏️ Modifier la description
                </button>
              ) : (
                <span
                  className="text-[11px] text-ink-500"
                  title="La description est figée une fois le pact finalisé : les membres ont approuvé ce texte, il ne peut plus être modifié on-chain."
                >
                  🔒 Description verrouillée (finalisé)
                </span>
              ))}
          </div>
        </div>

        {isDetailView && (
          <div className="mb-4 space-y-2">
            {parsed.stage && (
              <span className="inline-block rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-accent-violet">
                {stageBadgeLabel(parsed.stage)}
              </span>
            )}
            {/* Jamais de repli sur `pact.description` : la chaîne brute
                commence par « [<étape>] » et finit par les marqueurs du
                wizard — voir displayPitch dans lib/pitch.ts. */}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-200">
              {parsed.pitch}
            </p>
            {parsed.rolesWanted && (
              <p className="text-xs text-ink-400">
                <span className="text-ink-300">{t('pactCard.rolesWanted')} </span>{parsed.rolesWanted}
              </p>
            )}
          </div>
        )}

        {isDetailView && (() => {
          // Bascule FR/EN sur le sélecteur de langue de l'app — si la traduction
          // anglaise n'a pas été remplie par le founder, on retombe sur le
          // français plutôt que de laisser un juge anglophone sans rien.
          const aboutForLang =
            lang === 'en'
              ? media?.aboutTextEn || media?.aboutText
              : media?.aboutText || media?.aboutTextEn;
          if (!aboutForLang) return null;
          return (
            <div className="mb-4 border-t border-white/5 pt-4">
              <h4 className="mb-2 font-sans text-sm font-semibold text-white">
                {lang === 'en' ? 'About' : 'À propos'}
              </h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-300">
                {aboutForLang}
              </p>
            </div>
          );
        })()}

        {isDetailView && (
          <div className="mb-4 border-t border-white/5 pt-4">
            <PactTimeline pact={pact} hasReceipt={!!receipt} />
          </div>
        )}

        {/* Entrée principale vers la fiche (chat + vault) — avant, seul un
            petit lien "🔗 Partager" (pensé pour un tiers) y menait, ce qui le
            rendait invisible comme point d'accès pour SOI-même : le seul
            chemin trouvé passait par le Marketplace. Masqué quand ce card
            est déjà affiché SUR la fiche elle-même (voir showOpenSheetButton
            ci-dessus) — redondant puisque chat + vault sont juste dessous. */}
        {showOpenSheetButton && (
          <a
            href={`#/pact/${pdaKey}`}
            className="mb-4 flex items-center justify-center gap-1.5 rounded-lg border border-accent-violet/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-500/20"
          >
            {t('pactCard.openSheet')}
          </a>
        )}

        <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
          <div>
            <p className="text-xs text-ink-400">{t('pactCard.claimable')}</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-accent-neon">
              {formatSol(pact.myClaimableSol)} SOL
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-400">{t('pactCard.vaultBalance')}</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-white">
              {formatSol(pact.vaultBalanceSol)} SOL
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-400">{t('pactCard.yourShare')}</p>
            <p className="mt-0.5 font-mono text-sm text-white">
              {(pact.myShareBps / 100).toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-400">{t('pactCard.members')}</p>
            <p className="mt-0.5 font-mono text-sm text-white">
              {t('pactCard.memberCount', { n: pact.members.length })}
            </p>
          </div>
        </div>

        {pact.members.length > 0 && (
          <div className="mt-4 space-y-1 rounded-lg border border-white/5 bg-black/30 p-3">
            {pact.members.map((m) => (
              <div
                key={m.wallet.toBase58()}
                className="flex items-center justify-between font-mono text-xs"
              >
                <span className="text-ink-400">
                  {formatAddress(m.wallet.toBase58())} ·{' '}
                  {(m.shareBps / 100).toFixed(2)}%
                  {m.wallet.toBase58() === myAddr && (
                    <span className="ml-1 text-accent-violet">(toi)</span>
                  )}
                  {m.wallet.toBase58() === pact.creator.toBase58() && (
                    <span className="ml-1">👑</span>
                  )}
                </span>
                {pact.status !== 'active' && (
                  <span
                    className={
                      m.approved ? 'text-emerald-400' : 'text-amber-400'
                    }
                  >
                    {m.approved ? t('pactCard.approved') : t('pactCard.pending')}
                  </span>
                )}
              </div>
            ))}
            <div
              className={`flex justify-between border-t border-white/5 pt-1 font-mono text-xs font-bold ${
                sharesComplete ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              <span>{t('pactCard.total')}</span>
              <span>
                {totalPct.toFixed(2)}%{' '}
                {sharesComplete ? '✓' : t('pactCard.mustBe100')}
              </span>
            </div>
          </div>
        )}

        {isDetailView && pact.members.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-white/5 pt-4 sm:grid-cols-2">
            <OrbitalCapTable members={pact.members} creatorWallet={pact.creator.toBase58()} myWallet={myAddr} />
            <VaultShareGauge
              vaultBalanceSol={pact.vaultBalanceSol}
              myShareBps={pact.myShareBps}
              myClaimableSol={pact.myClaimableSol}
            />
          </div>
        )}

        {walletConnected && (
          <div className="mt-6 space-y-3 border-t border-white/5 pt-4">
            {/* Phantom/Backpack font leur propre simulation de sécurité via LEUR
                RPC devnet avant de signer — indépendant du RPC (Helius) que ce
                site utilise pour envoyer la transaction. Le devnet public est
                souvent saturé (confirmé : api.devnet.solana.com renvoie des 429
                en ce moment même) → le wallet affiche "Simulation Unavailable" /
                "Impossible de récupérer les frais". Ça ne veut PAS dire que la
                transaction est dangereuse : c'est le mobile/wallet qui n'arrive
                pas à joindre son propre RPC. On peut continuer sans risque. */}
            <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-300/90">
              {t('pactCard.congestionNotice')}
            </p>

            {pact.status !== 'active' && (
              <div className="flex flex-col gap-2">
                {iAmMember && !iHaveApproved && !approveSig && (
                  <button
                    onClick={handleApprove}
                    disabled={approving || busy}
                    className="w-full rounded-lg border border-emerald-500/50 bg-emerald-500/10 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {approving ? t('pactCard.approving') : t('pactCard.approveButton')}
                  </button>
                )}

                {approveSig && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                    <p className="text-xs font-medium text-emerald-300">{t('pactCard.approvedOnChain')}</p>
                    <a
                      href={explorerTxUrl(approveSig)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[11px] text-emerald-300 underline underline-offset-2 hover:opacity-80"
                    >
                      {t('common.viewTx')} : {approveSig.slice(0, 8)}…
                    </a>
                    <button
                      onClick={() => window.location.reload()}
                      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-1.5 text-xs font-medium text-white"
                    >
                      {t('pactCard.reload')}
                    </button>
                  </div>
                )}

                {iAmMember && iHaveApproved && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 py-2 text-center text-xs text-emerald-400">
                    {t('pactCard.youApproved')}
                  </div>
                )}

                {approveError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                    {approveError}
                  </div>
                )}

                {iAmCreator && (
                  <button
                    onClick={() => setShowAddMember(true)}
                    disabled={busy}
                    className="w-full rounded-lg border border-purple-500/50 bg-purple-500/10 py-2 text-sm font-medium text-purple-300 transition hover:bg-purple-500/20 disabled:opacity-50"
                  >
                    {t('pactCard.addMemberButton')}
                  </button>
                )}

                {/* Annuler le pact — creator only, tant que non finalisé.
                    close_project() rembourse automatiquement tout solde du
                    vault au creator avant de fermer le compte (voir lib.rs) —
                    action irréversible, d'où la confirmation en 2 étapes. */}
                {iAmCreator && !showCancelConfirm && (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={busy || cancelling}
                    className="w-full rounded-lg border border-red-500/30 bg-red-500/5 py-2 text-xs font-medium text-red-300/80 transition hover:bg-red-500/10 hover:text-red-300"
                  >
                    {t('pactCard.cancelPactButton')}
                  </button>
                )}

                {iAmCreator && showCancelConfirm && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2">
                    <p className="text-xs text-red-300">
                      {t('pactCard.cancelWarning')}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        disabled={cancelling}
                        className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs text-ink-300 hover:text-white disabled:opacity-50"
                      >
                        {t('pactCard.keepPact')}
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        {cancelling ? t('pactCard.cancelling') : t('pactCard.confirmCancel')}
                      </button>
                    </div>
                    {cancelError && (
                      <p className="text-[11px] text-red-400">{cancelError}</p>
                    )}
                  </div>
                )}

                <div className="text-xs text-ink-400">
                  {finalizeBlockReason
                    ? `⏳ ${finalizeBlockReason}`
                    : t('pactCard.readyToFinalize')}
                </div>
              </div>
            )}

            {pact.status === 'active' && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <label htmlFor={`fund-amount-${pdaKey}`} className="sr-only">
                    {t('pactCard.fundAmountLabel', { title: pact.title })}
                  </label>
                  <input
                    id={`fund-amount-${pdaKey}`}
                    type="number"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    min="0.001"
                    step="0.001"
                    className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-accent-violet/50 focus:outline-none"
                    placeholder={t('pactCard.fundPlaceholder')}
                  />
                  <button
                    onClick={() => onFund(pact, parseFloat(fundAmount))}
                    disabled={busy}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busyAction === 'fund'
                      ? t('pactCard.sending')
                      : t('pactCard.fundButton')}
                  </button>
                </div>
                <p className="text-center text-xs text-ink-400">
                  {t('pactCard.fundHint')}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {pact.status !== 'active' ? (
                iAmCreator ? (
                  <button
                    onClick={() => onFinalize(pact)}
                    disabled={busy || !canFinalize}
                    className="flex-1 rounded-lg bg-accent-violet px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-accent-violet/90 disabled:opacity-50"
                    title={finalizeBlockReason}
                  >
                    {busyAction === 'finalize'
                      ? t('pactCard.finalizing')
                      : t('pactCard.finalizeButton')}
                  </button>
                ) : (
                  <div className="flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-center text-xs text-ink-400">
                    {t('pactCard.onlyFounderUnlock')}
                  </div>
                )
              ) : iAmCreator ? (
                <div className="flex-1 space-y-1">
                  <button
                    onClick={handleDistribute}
                    disabled={busy || distributing || !canDistribute}
                    aria-describedby={`distrib-hint-${pdaKey}`}
                    className="w-full rounded-lg bg-accent-neon px-4 py-2 text-sm font-bold text-ink-900 transition hover:opacity-90 disabled:opacity-50"
                  >
                    {distributing
                      ? t('pactCard.distributing')
                      : t('pactCard.distributeButton', { amount: formatSol(pact.vaultBalanceSol) })}
                  </button>
                  <p
                    id={`distrib-hint-${pdaKey}`}
                    className="text-center text-xs text-ink-400"
                  >
                    {t('pactCard.distributeHint')}
                  </p>
                  {distributeError && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                      {distributeError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-center text-xs text-ink-400">
                  {t('pactCard.onlyFounderDistribute')}
                </div>
              )}
            </div>
          </div>
        )}

        {receipt && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400">
                {t('pactCard.distributionDone')}
              </span>
              <button
                onClick={() => setReceipts(clearReceipt(pdaKey))}
                aria-label={t('pactCard.closeReceipt')}
                className="-m-2.5 flex h-9 w-9 items-center justify-center p-2.5 text-ink-400 transition hover:text-white"
              >
                ×
              </button>
            </div>
            <a
              href={`https://solscan.io/tx/${receipt.signature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-xs text-accent-violet underline"
            >
              {t('pactCard.viewOnSolscan')}
            </a>
            <ul className="mt-2 space-y-1">
              {receipt.payouts.map((p) => (
                <li
                  key={p.wallet}
                  className="flex justify-between font-mono text-xs"
                >
                  <span className="text-ink-400">
                    {formatAddress(p.wallet)} · {(p.shareBps / 100).toFixed(2)}%
                  </span>
                  <span className="text-emerald-400">
                    +{formatSol(p.amountSol)} SOL
                  </span>
                </li>
              ))}
              <li className="flex justify-between border-t border-white/5 pt-1 font-mono text-xs">
                <span className="text-ink-400">{t('pactCard.protocolFee')}</span>
                <span className="text-white">
                  +{formatSol(receipt.feeSol)} SOL
                </span>
              </li>
            </ul>
          </div>
        )}
      </article>

      {showAddMember && (
        <AddMemberModal
          projectPda={pact.pda}
          projectTitle={pact.title}
          existingMembers={pact.members}
          onClose={() => setShowAddMember(false)}
          onSuccess={() => {
            setShowAddMember(false);
            window.location.reload();
          }}
        />
      )}

      {showEditMedia && (
        <EditMediaModal
          projectPda={pdaKey}
          projectTitle={pact.title}
          currentLogoUrl={media?.logoUrl}
          currentBannerUrl={media?.bannerUrl}
          currentVideoUrl={media?.pitchVideoUrl}
          currentAboutText={media?.aboutText}
          currentAboutTextEn={media?.aboutTextEn}
          onClose={() => setShowEditMedia(false)}
          onSuccess={() => {
            setShowEditMedia(false);
            onMediaUpdated?.();
          }}
        />
      )}

      {showEditDescription && (
        <EditDescriptionModal
          projectPda={pact.pda}
          projectTitle={pact.title}
          currentDescription={pact.description}
          isLegacyPact={needsDescriptionMigration(pact, publicKey)}
          onClose={() => setShowEditDescription(false)}
          onSuccess={() => {
            // Même pattern que AddMemberModal/handleCancel : la description
            // affichée vient de `pact` (prop figée), un reload complet est
            // le moyen le plus sûr de la refléter sans état incohérent.
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
