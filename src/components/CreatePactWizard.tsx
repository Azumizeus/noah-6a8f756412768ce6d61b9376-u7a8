// src/components/CreatePactWizard.tsx
//
// Wizard de création de pact — 3 étapes.
// Les vues des étapes 1 et 3 vivent dans ./wizard/ (PactStep1, PactStep3) :
// le fichier monolithique dépassait 1400 lignes et n'était plus éditable
// d'un bloc par la plupart des outils. Toute la LOGIQUE reste ici, les
// sous-composants ne font qu'afficher.

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { createProject, addMember } from '../lib/anchor';
import { useAnchorProgram } from '../hooks/useProjects';
import { parseTxError } from '../lib/pacts';
import { ALL_ROLES, roleShortLabel, combineRoleLabels } from '../lib/roles';
import { STAGE_CANONICAL, type PactStage } from '../lib/pitch';
import { truncateUtf8, utf8ByteLength } from '../lib/textSafety';
import { pactPublicUrl } from '../lib/router';
import { uploadMediaFile, saveProjectMedia, signMediaWrite, type ProjectMediaPatch } from '../lib/media';
import { saveOpenRoles, MAX_OPEN_ROLES } from '../lib/openRoles';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { MAX_TITLE_LEN, MAX_DESC_LEN, MAX_ROLE_LEN, MAX_MEMBERS } from '../lib/onchainLimits';

import TxLink from './wizard/TxLink';
import PactStep1 from './wizard/PactStep1';
import PactStep3 from './wizard/PactStep3';
import {
  PLATFORM_WALLET,
  hintCls,
  loadDraft,
  draftKey,
  slugId,
  type MemberDraft,
  type PactDraft,
} from './wizard/wizardShared';

interface Props {
  onSuccess: () => void;
  onClose?: () => void;
}

function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="mb-6 flex items-center gap-1.5 sm:gap-2">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'active' : 'todo';
        return (
          <div key={label} className="flex flex-1 items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2">
              <div
                className={
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors sm:h-8 sm:w-8 ' +
                  (state === 'done'
                    // Restyle 21/09 (v3) : progression = accent, pas le vert
                    // néon (réservé aux mouvements de SOL).
                    ? 'bg-accent-violet text-ink-900'
                    : state === 'active'
                      ? 'bg-accent-violet text-ink-900 shadow-[0_0_0_4px_rgba(153,69,255,0.18)]'
                      : 'bg-white/5 text-ink-400')
                }
              >
                {state === 'done' ? '✓' : n}
              </div>
              <span
                className={
                  'hidden text-xs font-medium sm:inline ' +
                  (state === 'todo' ? 'text-ink-400' : 'text-white')
                }
              >
                {label}
              </span>
            </div>
            {n < labels.length && (
              <div
                className={'h-px flex-1 ' + (state === 'done' ? 'bg-accent-violet/50' : 'bg-white/10')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Calcule la part créateur suggérée selon les rôles cumulés + type de recherche
function suggestShare(roleIds: string[], customCount: number, stage: string): number {
  const baseWeight = roleIds
    .map((id) => ALL_ROLES.find((r) => r.id === id)?.weight ?? 0)
    .reduce((a, b) => a + b, 0);
  const totalWeight = baseWeight + customCount * 5;

  const suggested = Math.round(totalWeight * 0.8);
  const cap = stage === 'invest' ? 55 : 40;
  return Math.min(Math.max(suggested, 10), cap);
}

// Suggère une part (%) pour UN membre selon le(s) rôle(s) cumulé(s) — un membre peut
// porter plusieurs casquettes (ex: Lead Dev + UX/UI), sa part suggérée grimpe en conséquence.
// Investisseur seul (weight 0) = pas de suggestion auto, part liée au montant négocié.
function suggestMemberShare(roleIds: string[]): number {
  if (roleIds.length === 0) return 10;
  const weights = roleIds.map((id) => ALL_ROLES.find((r) => r.id === id)?.weight ?? 10);
  if (weights.every((w) => w === 0)) return 0; // uniquement investisseur
  const total = weights.reduce((a, b) => a + b, 0);
  return Math.min(Math.max(total, 5), 35);
}

export function CreatePactWizard({ onSuccess, onClose }: Props) {
  const { t } = useLanguage();
  const STAGES = [
    { id: 'dev', label: t('createWizard.stageDev') },
    { id: 'invest', label: t('createWizard.stageInvest') },
    { id: 'both', label: t('createWizard.stageBoth') },
  ] as const;
  const STEP_LABELS = [
    t('createWizard.stepProject'),
    t('createWizard.stepMembers'),
    t('createWizard.stepFinalize'),
  ];

  const { publicKey, signMessage } = useWallet();
  const program = useAnchorProgram();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ajout de membres = 1 transaction (donc 1 signature wallet) PAR membre — pas
  // de batch on-chain. On affiche une progression claire pendant la boucle pour
  // que l'utilisateur sache combien de fois Phantom va lui redemander de signer.
  const [addMemberProgress, setAddMemberProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['founder']);
  const [customRole, setCustomRole] = useState('');
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  // Rôles RECHERCHÉS (ce que le founder veut recruter) — off-chain, labels
  // affichés publiquement. Distinct de selectedRoles (rôles du founder lui-même).
  const [wantedRoles, setWantedRoles] = useState<string[]>([]);
  const [wantedCustomRole, setWantedCustomRole] = useState('');
  const [myShare, setMyShare] = useState(30);
  const [shareTouched, setShareTouched] = useState(false);
  const [stage, setStage] = useState<string>('both');
  const [seedAmount, setSeedAmount] = useState<string>(''); // invest founder (informatif)
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);

  const [projectPda, setProjectPda] = useState<PublicKey | null>(null);
  const [projectId, setProjectId] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // ═══ Signatures des transactions — affichées avec lien Explorer ═══
  const [createSig, setCreateSig] = useState<string | null>(null);
  const [memberSigs, setMemberSigs] = useState<{ wallet: string; sig: string }[]>([]);

  // Brouillon existant proposé à la reprise
  const [pendingDraft, setPendingDraft] = useState<PactDraft | null>(null);

  // ─── Restauration du brouillon au montage ───
  useEffect(() => {
    if (!publicKey) return;
    const d = loadDraft(publicKey.toBase58());
    if (d) setPendingDraft(d);
  }, [publicKey]);

  // ─── Sauvegarde automatique du brouillon à chaque changement ───
  useEffect(() => {
    if (!publicKey) return;
    // Ne sauvegarde que si quelque chose a été saisi
    if (!title && step === 1) return;
    const draft: PactDraft = {
      step,
      title,
      description,
      selectedRoles,
      customRoles,
      wantedRoles,
      myShare,
      shareTouched,
      stage,
      seedAmount,
      members,
      projectId,
      projectPda: projectPda ? projectPda.toBase58() : '',
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(draftKey(publicKey.toBase58()), JSON.stringify(draft));
    } catch {
      /* quota plein : non bloquant */
    }
  }, [
    publicKey,
    step,
    title,
    description,
    selectedRoles,
    customRoles,
    wantedRoles,
    myShare,
    shareTouched,
    stage,
    seedAmount,
    members,
    projectId,
    projectPda,
  ]);

  const clearDraft = () => {
    if (!publicKey) return;
    try {
      localStorage.removeItem(draftKey(publicKey.toBase58()));
    } catch {
      /* non bloquant */
    }
    setPendingDraft(null);
  };

  const resumeDraft = () => {
    if (!pendingDraft) return;
    setStep(pendingDraft.step);
    setTitle(pendingDraft.title);
    setDescription(pendingDraft.description);
    setSelectedRoles(pendingDraft.selectedRoles);
    setCustomRoles(pendingDraft.customRoles);
    setWantedRoles(pendingDraft.wantedRoles ?? []); // brouillons d'avant le 25/08 n'ont pas ce champ
    setMyShare(pendingDraft.myShare);
    setShareTouched(pendingDraft.shareTouched);
    setStage(pendingDraft.stage);
    setSeedAmount(pendingDraft.seedAmount);
    // Compat brouillons anciens (avant multi-rôles) : roleId string isolé → roleIds[].
    setMembers(
      pendingDraft.members.map((m) => {
        const legacy = m as MemberDraft & { roleId?: string };
        const roleIds = Array.isArray(legacy.roleIds)
          ? legacy.roleIds
          : legacy.roleId && legacy.roleId !== 'custom'
            ? [legacy.roleId]
            : [];
        return { ...m, roleIds };
      })
    );
    setProjectId(pendingDraft.projectId);
    if (pendingDraft.projectPda) {
      try {
        setProjectPda(new PublicKey(pendingDraft.projectPda));
      } catch {
        /* PDA corrompu dans le brouillon : on l'ignore */
      }
    }
    setPendingDraft(null);
  };

  if (!publicKey || !program) {
    return (
      <div className="glass-panel w-full p-8">
        <p className="text-ink-300">{t('createWizard.connectWalletFirst')}</p>
      </div>
    );
  }

  // Lien public de partage (fiche lecture seule #/pact/:pda) — sert aux membres pour
  // approuver depuis leur propre wallet sans passer par le wizard du créateur.
  const shareUrl = projectPda ? pactPublicUrl(projectPda.toBase58()) : '';
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* non bloquant — l'utilisateur peut toujours sélectionner le texte à la main */
    }
  };

  const handleNativeShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.share({ title: title || 'BuildPact', url: shareUrl });
    } catch {
      /* annulation utilisateur ou API indisponible — non bloquant */
    }
  };

  const suggested = suggestShare(selectedRoles, customRoles.length, stage);
  const effectiveShare = shareTouched ? myShare : suggested;
  // ⚠️ Audit 19/09 : le total ne doit compter que les lignes à wallet saisi —
  // une ligne vide n'ira jamais on-chain, la compter gonflait le total UI
  // (≠ total on-chain).
  const totalShares = effectiveShare + members
    .filter((m) => m.wallet.trim() !== '')
    .reduce((acc, m) => acc + (m.share || 0), 0);
  const remainingForMembers = 100 - effectiveShare;
  const cap = stage === 'invest' ? 55 : 40;
  const isGreedy = effectiveShare > cap;
  const myRoleLabel = [
    ...selectedRoles.map((id) => ALL_ROLES.find((r) => r.id === id)?.label ?? id),
    ...customRoles,
  ].join(' / ');

  // ⚠️ Bug trouvé lors de l'audit du 24/08 : la description on-chain packée
  // ([stage] pitch | Rôles créateur : ... | 💰 Seed founder : ...) est
  // tronquée SILENCIEUSEMENT par truncateUtf8() dans handleCreate() — si le
  // total dépasse, la fin est coupée AU MILIEU D'UN MOT ("UX/UI" → "UX/U").
  //
  // ÉTAT AU 28/08 : le binaire devnet a été vérifié on-chain (idl-check.mjs
  // — update_description présente, descriptions ≥ 400 octets acceptées), et
  // PROGRAM_UPGRADED = true est donc confirmé, pas simplement déclaré. La
  // troncature n'est plus définitive : EditDescriptionModal permet au
  // founder de réécrire la description après coup, y compris sur un vieux
  // pact (update_description réalloue le compte au passage).
  //
  // Cet avertissement pré-création reste utile pour autant : mieux vaut ne
  // pas tronquer que réparer ensuite, et l'utilisateur doit voir qu'il
  // dépasse AVANT de signer.
  //
  // La borne vient de onchainLimits.ts, plus de littéral ici : c'est ce qui
  // garantit que ce garde-fou suivra tout seul le prochain upgrade.
  const previewStageLabel = stage ? STAGE_CANONICAL[stage as Exclude<PactStage, null>] : '';
  const previewSeedInfo =
    seedAmount && Number(seedAmount) > 0
      ? ` | 💰 Seed founder : ${seedAmount} SOL (engagement annoncé)`
      : '';
  const previewFullDescription =
    '[' +
    previewStageLabel +
    '] ' +
    description +
    ' | Rôles créateur : ' +
    myRoleLabel +
    previewSeedInfo;
  const descBytesUsed = utf8ByteLength(previewFullDescription);
  const descWillTruncate = descBytesUsed > MAX_DESC_LEN;

  const toggleRole = (id: string) => {
    const next = selectedRoles.includes(id)
      ? selectedRoles.filter((r) => r !== id)
      : [...selectedRoles, id];
    setSelectedRoles(next);
    if (!shareTouched) setMyShare(suggestShare(next, customRoles.length, stage));
  };

  const addCustomRole = () => {
    const v = customRole.trim();
    if (v && !customRoles.includes(v)) {
      const next = [...customRoles, v];
      setCustomRoles(next);
      setCustomRole('');
      if (!shareTouched) setMyShare(suggestShare(selectedRoles, next.length, stage));
    }
  };

  const removeCustomRole = (r: string) => {
    const next = customRoles.filter((c) => c !== r);
    setCustomRoles(next);
    if (!shareTouched) setMyShare(suggestShare(selectedRoles, next.length, stage));
  };

  // ═══ Rôles RECHERCHÉS — pas de lien avec la part suggérée (contrairement
  // aux rôles du founder), juste une liste publique bornée à MAX_OPEN_ROLES ═══
  const toggleWantedRole = (label: string) => {
    setWantedRoles((prev) =>
      prev.includes(label)
        ? prev.filter((r) => r !== label)
        : prev.length >= MAX_OPEN_ROLES
          ? prev
          : [...prev, label]
    );
  };

  const addWantedCustomRole = () => {
    const v = wantedCustomRole.trim();
    if (
      v &&
      !wantedRoles.some((r) => r.toLowerCase() === v.toLowerCase()) &&
      wantedRoles.length < MAX_OPEN_ROLES
    ) {
      setWantedRoles((prev) => [...prev, v]);
    }
    setWantedCustomRole('');
  };

  const handleStage = (id: string) => {
    setStage(id);
    if (!shareTouched) setMyShare(suggestShare(selectedRoles, customRoles.length, id));
  };

  const handleCreate = async () => {
    // ═══ CORRECTIF — anti double-création (audit 19/09) ═══
    // Un brouillon restauré contenant déjà un PDA, plus une création
    // relancée dans la même session, pouvait écrire DEUX pacts on-chain
    // (faille rapportée par l'audit : L163-167/416). Un pact déjà créé
    // n'ouvre JAMAIS recompte : l'utilisateur repasse par le bouton
    // d'avancement du terminal du wizard.
    if (loading) return;
    if (createSig || projectPda) {
      setError(
        'Ce pact existe déjà dans cette session (transaction déjà signée). Termine les étapes en cours — rafraîchis la page si tu veux partir sur une nouvelle création SANS signature en attente.'
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // ⚠️ i18n : le bracket on-chain utilise TOUJOURS la clé canonique fixe
      // (STAGE_CANONICAL), jamais le libellé traduit affiché sur le bouton —
      // sinon un pact créé en anglais ne matcherait plus STAGE_MAP côté
      // parsing (pitch.ts) et perdrait son badge de stage sur la Marketplace.
      const stageLabel = stage ? STAGE_CANONICAL[stage as Exclude<PactStage, null>] : stage;
      const id = slugId(title); // ✅ ≤ 20 bytes garanti

      const seedInfo =
        seedAmount && Number(seedAmount) > 0
          ? ` | 💰 Seed founder : ${seedAmount} SOL (engagement annoncé)`
          : '';
      const rawDescription =
        '[' + stageLabel + '] ' + description + ' | Rôles créateur : ' + myRoleLabel + seedInfo;
      // ⚠️ Garde-fou défensif : le bouton d'étape 1 est désactivé au-delà de
      // la borne (PactStep1), mais ce handleCreate reste la dernière barrière
      // avant signature — on REFUSE plutôt que de tronquer silencieusement
      // (l'ancienne troncature coupait au milieu d'un mot, données perdues
      // on-chain sans retour utilisateur).
      if (utf8ByteLength(rawDescription) > MAX_DESC_LEN) {
        setError(
          `Description trop longue (${utf8ByteLength(rawDescription)}/${MAX_DESC_LEN} octets). Raccourcis ton pitch, tes rôles ou le seed.`
        );
        setLoading(false);
        return;
      }
      const fullDescription = rawDescription;

      // ✅ UN SEUL rôle, court, borné à MAX_ROLE_LEN octets pour le programme
      const creatorRoleOnChain =
        selectedRoles.length > 0
          ? roleShortLabel(selectedRoles[0])
          : truncateUtf8(customRoles[0] ?? 'Founder', MAX_ROLE_LEN);

      // ⚠️ Audit 19/09 : borné AVANT l'appel on-chain — un `myShare` NaN ou
      // hors bornes provenant d'un champ texte renverrait une part bps
      // invalide au programme (6005 après signature).
      const creatorShareBps = Math.round(
        Math.min(Math.max(Number.isFinite(effectiveShare) ? effectiveShare : 0, 0), cap) * 100
      );

      const { tx, projectPda: pda } = await createProject(
        program,
        publicKey,
        id,
        truncateUtf8(title, MAX_TITLE_LEN), // octets UTF-8, pas caractères JS
        fullDescription,
        creatorRoleOnChain,
        creatorShareBps,
        new PublicKey(PLATFORM_WALLET)
      );

      setProjectId(id);
      setProjectPda(pda);
      setCreateSig(tx);

      // Upload logo/bannière APRÈS la création : on a besoin du vrai PDA
      // on-chain comme clé (project_media.project_pda). Non bloquant.
      //
      // Depuis le verrouillage du bucket storage (migration 20260828190000),
      // l'upload lui-même exige une signature — voir lib/media.ts. On signe
      // UNE fois ici et on réutilise cette même signature pour les deux
      // fichiers puis pour saveProjectMedia : un seul popup wallet pour tout
      // le flux, juste après celui de la création.
      //
      // `id` (le project_id texte, pas le PDA) est passé à uploadMediaFile
      // parce que le compte vient tout juste d'être créé : le RPC peut ne
      // pas encore le voir, donc project-write ne peut pas lire
      // project.creator on-chain pour vérifier l'autorisation. Il redérive
      // le PDA depuis (wallet, id) à la place — voir project-write/index.ts.
      const mediaFailures: string[] = [];
      const mediaPatch: ProjectMediaPatch = {};
      if (logoFile || bannerFile) {
        if (!signMessage) {
          mediaFailures.push('Wallet incapable de signer un message');
        } else {
          const signed = await signMediaWrite(publicKey.toBase58(), pda.toBase58(), signMessage);
          if ('error' in signed) {
            mediaFailures.push(signed.error);
          } else {
            if (logoFile) {
              const r = await uploadMediaFile(pda.toBase58(), logoFile, 'logo', signed, id);
              if ('error' in r) mediaFailures.push(`Logo : ${r.error}`);
              else mediaPatch.logoUrl = r.url;
            }
            if (bannerFile) {
              const r = await uploadMediaFile(pda.toBase58(), bannerFile, 'banner', signed, id);
              if ('error' in r) mediaFailures.push(`Bannière : ${r.error}`);
              else mediaPatch.bannerUrl = r.url;
            }
            if (Object.keys(mediaPatch).length > 0) {
              const saved = await saveProjectMedia(
                pda.toBase58(),
                mediaPatch,
                { wallet: publicKey.toBase58(), signMessage },
                signed
              );
              if ('error' in saved) mediaFailures.push(saved.error);
            }
          }
        }
      }
      if (mediaFailures.length > 0) {
        setMediaWarning(
          mediaFailures.join(' — ') +
            ' (le projet est bien créé — réessaie depuis "Modifier les médias" sur sa carte)'
        );
      }

      // Rôles recherchés APRÈS la création : il faut le PDA on-chain comme clé
      // (project_open_roles.project_pda) + une signature signMessage (l'Edge
      // Function vérifie que le signataire est project.creator on-chain).
      // NON BLOQUANT — si la signature est refusée ou l'appel échoue, le pact
      // existe déjà ; le founder pourra définir ses rôles depuis la fiche pact.
      if (wantedRoles.length > 0) {
        if (signMessage) {
          const r = await saveOpenRoles(
            publicKey.toBase58(),
            signMessage,
            pda.toBase58(),
            wantedRoles
          );
          if ('error' in r) {
            setMediaWarning(
              (prev) => (prev ? prev + ' · ' : '') + t('createWizard.wantedRolesSaveFailed')
            );
          }
        } else {
          setMediaWarning(
            (prev) => (prev ? prev + ' · ' : '') + t('createWizard.wantedRolesSaveFailed')
          );
        }
      }

      setStep(2);
    } catch (e) {
      setError(parseTxError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!projectPda) return;
    setError(null);
    const validMembers = members.filter((m) => m.wallet.trim() !== '');

    // ═══ CORRECTIF 0 — limite réelle de membres (audit 19/09) ═══
    // La limite de 8 membres est affichée partout mais n'était pas bloquante :
    // le programme couperait au 9ᵉ (6021) APRÈS avoir fait signer 8 fois.
    if (validMembers.length > MAX_MEMBERS) {
      setError(`Maximum ${MAX_MEMBERS} membres par pact (sélection : ${validMembers.length}).`);
      return;
    }

    // ═══ CORRECTIF 0b — parts des membres (audit 19/09) ═══
    // Même protection que le créateur : part numérique finie, dans [0;100].
    const badShare = validMembers.find(
      (m) => !Number.isFinite(m.share) || m.share < 0 || m.share > 100
    );
    if (badShare) {
      setError(`Part hors limites pour ${badShare.wallet || 'un membre (wallet vide)'} : rentrée autorisée 0–100%.`);
      return;
    }

    // ═══ CORRECTIF 1/2 — validation AVANT la première signature ═══
    // `new PublicKey(...)` lève sur une adresse mal collée. Sans cette passe,
    // l'exception tombait AU MILIEU de la boucle : les membres déjà traités
    // étaient écrits on-chain, les suivants non. On refuse de démarrer tant
    // qu'une seule adresse est invalide — c'est de loin la cause d'échec la
    // plus fréquente, et la seule éliminable à coût nul.
    const badWallet = validMembers.find((m) => {
      try {
        new PublicKey(m.wallet.trim());
        return false;
      } catch {
        return true;
      }
    });
    if (badWallet) {
      setError(`Adresse wallet invalide : ${badWallet.wallet}`);
      return;
    }

    // Doublon dans le formulaire lui-même : le programme renverrait
    // DuplicateMember (6007) à la 2ᵉ occurrence, après avoir déjà fait signer
    // la 1ʳᵉ. Autant l'attraper ici, sans transaction.
    const seen = new Set<string>();
    const dup = validMembers.find((m) => {
      const w = m.wallet.trim();
      if (seen.has(w)) return true;
      seen.add(w);
      return false;
    });
    if (dup) {
      setError(`Ce wallet apparaît deux fois : ${dup.wallet}`);
      return;
    }

    setLoading(true);
    setAddMemberProgress({ done: 0, total: validMembers.length });

    // ═══ CORRECTIF 2/2 — reprise après échec partiel ═══
    // Chaque membre = 1 transaction indépendante. Si la 3ᵉ échoue (refus de
    // signature, RPC qui lâche), les 2 premières sont DÉJÀ on-chain et
    // définitives. On retire donc de `members` tout ce qui a réussi, pour
    // qu'un reclic ne renvoie que le reste. Sans ça, le reclic repartait de
    // zéro et se prenait DuplicateMember (6007) sur le premier membre —
    // pact bloqué, impossible d'ajouter les manquants depuis le wizard.
    const written: { wallet: string; sig: string }[] = [];
    try {
      let done = 0;
      for (const m of validMembers) {
        const sig = await addMember(
          program,
          publicKey,
          projectPda,
          new PublicKey(m.wallet.trim()),
          truncateUtf8(m.role, MAX_ROLE_LEN), // même bug 6005 si emoji/accents non tronqués en octets
          m.share * 100
        );
        written.push({ wallet: m.wallet, sig });
        done += 1;
        setAddMemberProgress({ done, total: validMembers.length });
      }
      setMemberSigs((prev) => [...prev, ...written]);
      setStep(3);
    } catch (e) {
      // On conserve les signatures déjà obtenues : elles restent affichables
      // et vérifiables sur l'Explorer même si la série n'est pas allée au bout.
      setMemberSigs((prev) => [...prev, ...written]);
      setError(
        parseTxError(e) +
          (written.length > 0
            ? ` — ${written.length} membre(s) déjà enregistré(s) on-chain : ils ont été retirés de la liste, reclique pour ajouter les restants.`
            : '')
      );
    } finally {
      // Purge des membres confirmés on-chain, succès comme échec.
      if (written.length > 0) {
        const writtenSet = new Set(written.map((w) => w.wallet));
        setMembers((prev) => prev.filter((m) => !writtenSet.has(m.wallet)));
      }
      setLoading(false);
      setAddMemberProgress(null);
    }
  };

  const updateMemberWallet = (index: number, value: string) => {
    const next = [...members];
    next[index] = { ...next[index], wallet: value };
    setMembers(next);
  };

  // Bascule un rôle dans la sélection multiple du membre (ajoute/retire).
  const toggleMemberRole = (index: number, roleId: string) => {
    const next = [...members];
    const m = { ...next[index] };
    m.roleIds = m.roleIds.includes(roleId)
      ? m.roleIds.filter((r) => r !== roleId)
      : [...m.roleIds, roleId];
    m.role = combineRoleLabels(m.roleIds, m.customRole);
    if (!m.shareTouched) m.share = suggestMemberShare(m.roleIds);
    next[index] = m;
    setMembers(next);
  };

  const updateMemberCustomRole = (index: number, text: string) => {
    const next = [...members];
    const m = { ...next[index], customRole: text };
    m.role = combineRoleLabels(m.roleIds, text);
    next[index] = m;
    setMembers(next);
  };

  const updateMemberShare = (index: number, value: number) => {
    const next = [...members];
    // ⚠️ Audit 19/09 : une valeur non numérique ou hors bornes ne doit jamais
    // atteindre le champ on-chain (shareBps négatif = erreur 6005 brutale).
    const safe = Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), 100) : next[index].share;
    next[index] = { ...next[index], share: safe, shareTouched: true };
    setMembers(next);
  };

  const resetMemberShareSuggestion = (index: number) => {
    const next = [...members];
    const m = next[index];
    next[index] = { ...m, share: suggestMemberShare(m.roleIds), shareTouched: false };
    setMembers(next);
  };

  // Calcule ce qu'il manque pour tomber pile sur 100%, en gardant les autres membres fixes
  const missingForRow = (index: number): number => {
    const othersSum = members.reduce(
      (acc, m, idx) => (idx === index ? acc : acc + (m.share || 0)),
      0
    );
    return Math.max(0, Math.round(remainingForMembers - othersSum));
  };

  const completeToHundred = (index: number) => {
    const next = [...members];
    next[index] = { ...next[index], share: missingForRow(index), shareTouched: true };
    setMembers(next);
  };

  return (
    <div className="glass-panel w-full p-6 sm:p-9">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-accent-neon">
            {t('createWizard.eyebrow')}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('createWizard.title')}
          </h2>
          <p className="mt-1.5 text-sm text-ink-300">
            {step === 1 && t('createWizard.step1Sub')}
            {step === 2 && t('createWizard.step2Sub')}
            {step === 3 && t('createWizard.step3Sub')}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('createWizard.close')}
            className="shrink-0 rounded-lg border border-white/10 p-2 text-ink-400 transition hover:border-white/20 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      <Stepper step={step} labels={STEP_LABELS} />

      {/* ═══ Reprise de brouillon (page fermée = rien perdu) ═══ */}
      {pendingDraft && step === 1 && (
        <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
          <p className="text-[12px] font-semibold text-amber-300">
            {t('createWizard.draftFound', { title: pendingDraft.title })}
            {pendingDraft.projectPda && t('createWizard.draftOnChainNote')}
          </p>
          <p className="mt-1 text-[11px] text-amber-200/70">{t('createWizard.draftHint')}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={resumeDraft}
              className="flex-1 rounded bg-amber-500 py-1.5 text-xs font-bold text-ink-900"
            >
              {t('createWizard.resumeDraft')}
            </button>
            <button
              type="button"
              onClick={clearDraft}
              className="rounded border border-amber-400/40 px-3 py-1.5 text-xs text-amber-300"
            >
              {t('createWizard.ignoreDraft')}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ ÉTAPE 1 — IDENTITÉ ═══════════ */}
      {step === 1 && (
        <PactStep1
          t={t}
          stages={STAGES}
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
          setLogoFile={setLogoFile}
          setBannerFile={setBannerFile}
          stage={stage}
          onStage={handleStage}
          seedAmount={seedAmount}
          setSeedAmount={setSeedAmount}
          selectedRoles={selectedRoles}
          toggleRole={toggleRole}
          customRole={customRole}
          setCustomRole={setCustomRole}
          addCustomRole={addCustomRole}
          customRoles={customRoles}
          removeCustomRole={removeCustomRole}
          wantedRoles={wantedRoles}
          toggleWantedRole={toggleWantedRole}
          wantedCustomRole={wantedCustomRole}
          setWantedCustomRole={setWantedCustomRole}
          addWantedCustomRole={addWantedCustomRole}
          effectiveShare={effectiveShare}
          suggested={suggested}
          remainingForMembers={remainingForMembers}
          cap={cap}
          isGreedy={isGreedy}
          onShareChange={(v) => {
            setShareTouched(true);
            setMyShare(v);
          }}
          onResetShare={() => {
            setShareTouched(false);
            setMyShare(suggested);
          }}
          descWillTruncate={descWillTruncate}
          descBytesUsed={descBytesUsed}
          loading={loading}
          onCreate={handleCreate}
        />
      )}

      {/* ═══════════ ÉTAPE 2 — MEMBRES ═══════════ */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-green-400">
            {t('createWizard.projectCreated', { id: projectId })}
          </p>
          {createSig && <TxLink sig={createSig} label={t('createWizard.creationTxLabel')} />}
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-left text-[11px] leading-relaxed text-emerald-200">
            {t('createWizard.canCloseNow')}
          </div>
          {mediaWarning && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-left text-[11px] text-amber-200">
              ⚠️ {mediaWarning}
            </div>
          )}
          <p className="text-xs text-ink-400">{t('createWizard.addMembersHint')}</p>

          <div className="rounded-lg border border-accent-violet/25 bg-violet-500/10 p-3 text-[11px] text-ink-300">
            💡 {t('createWizard.myShareReminder', { n: effectiveShare })}
            {t('createWizard.remainingForMembers', { n: remainingForMembers })}
            <br />
            {t('createWizard.minMembersWarning')}
          </div>

          {members.map((m, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-white/5 p-2">
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded border border-white/10 bg-canvas-800 p-2 text-sm text-white"
                  placeholder={t('createWizard.memberWalletPlaceholder')}
                  value={m.wallet}
                  onChange={(e) => updateMemberWallet(i, e.target.value)}
                />
                <input
                  type="number"
                  className="w-16 rounded border border-white/10 bg-canvas-800 p-2 text-sm text-white"
                  placeholder="%"
                  value={m.share}
                  onChange={(e) => updateMemberShare(i, Number(e.target.value))}
                />
              </div>

              {/* Rôles du membre — multi-sélection, un membre peut cumuler plusieurs casquettes */}
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-ink-400">
                  {t('createWizard.memberRolesLabel')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleMemberRole(i, r.id)}
                      className={
                        'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ' +
                        (m.roleIds.includes(r.id)
                          ? 'border-accent-violet/60 bg-violet-500/20 text-white'
                          : 'border-white/10 text-ink-300 hover:text-white')
                      }
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <input
                className="w-full rounded border border-white/10 bg-canvas-800 p-2 text-sm text-white"
                placeholder={t('createWizard.memberCustomRolePlaceholder')}
                value={m.customRole}
                onChange={(e) => updateMemberCustomRole(i, e.target.value)}
              />

              {m.roleIds.length === 0 && !m.customRole.trim() && (
                <small className="block text-[11px] text-red-400">
                  {t('createWizard.memberRoleRequired')}
                </small>
              )}

              <div className="flex flex-wrap items-center gap-x-3">
                {m.roleIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => resetMemberShareSuggestion(i)}
                    className="text-[10px] text-accent-violet hover:underline"
                  >
                    {t('createWizard.memberSuggested', { n: suggestMemberShare(m.roleIds) })}
                    {m.roleIds.length === 1 && m.roleIds[0] === 'investor'
                      ? t('createWizard.memberInvestorNote')
                      : ''}
                  </button>
                )}
                {totalShares !== 100 && missingForRow(i) > 0 && (
                  <button
                    type="button"
                    onClick={() => completeToHundred(i)}
                    className="text-[10px] text-emerald-400 hover:underline"
                  >
                    {t('createWizard.completeToHundred', { n: missingForRow(i) })}
                  </button>
                )}
              </div>

              <small className={hintCls}>{t('createWizard.memberHint')}</small>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setMembers([
                ...members,
                { wallet: '', roleIds: [], customRole: '', role: '', share: 0, shareTouched: false },
              ])
            }
            className="text-sm text-accent-violet hover:underline"
          >
            {t('createWizard.addMember')}
          </button>

          {members.length === 0 && (
            <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-[11px] text-red-300">
              {t('createWizard.noMemberError')}
            </div>
          )}

          {members.length >= 8 && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-[11px] text-amber-300">
              {t('createWizard.tooManyMembers')}
            </div>
          )}

          <p
            className={
              'text-sm font-bold ' + (totalShares === 100 ? 'text-green-400' : 'text-amber-400')
            }
          >
            {t('createWizard.totalShares', { n: totalShares })}{' '}
            {totalShares === 100
              ? t('createWizard.totalOk')
              : totalShares < 100
                ? t('createWizard.totalMissing', { n: Math.abs(100 - totalShares) })
                : t('createWizard.totalExtra', { n: Math.abs(100 - totalShares) })}
          </p>

          {/* Chaque membre = 1 instruction on-chain séparée = 1 signature Phantom.
              Pas de batch possible avec le programme actuel — on le dit clairement
              AVANT de cliquer, pour ne pas surprendre avec N popups de suite. */}
          {(() => {
            const walletCount = members.filter((m) => m.wallet.trim()).length;
            return walletCount > 0 ? (
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
                {t('createWizard.signaturesWarning', { n: walletCount })}
              </div>
            ) : null;
          })()}

          {addMemberProgress && (
            <div className="rounded-lg border border-accent-violet/30 bg-violet-500/10 p-3 text-center text-[11px] text-ink-200">
              {t('createWizard.signatureProgress', {
                done: addMemberProgress.done + 1,
                total: addMemberProgress.total,
              })}
              {addMemberProgress.done > 0 &&
                t('createWizard.signatureProgressDone', { n: addMemberProgress.done })}
            </div>
          )}

          <button
            type="button"
            onClick={handleAddMember}
            disabled={
              loading ||
              totalShares !== 100 ||
              members.filter((m) => m.wallet.trim()).length === 0 ||
              members.some((m) => m.wallet.trim() && m.roleIds.length === 0 && !m.customRole.trim())
            }
            className="w-full rounded-xl bg-accent-violet py-3.5 text-sm font-bold text-ink-900 transition hover:bg-accent-violet/90 disabled:opacity-50"
          >
            {addMemberProgress
              ? t('createWizard.signatureButton', {
                  done: addMemberProgress.done + 1,
                  total: addMemberProgress.total,
                })
              : t('createWizard.addMembersButton')}
          </button>
        </div>
      )}

      {/* ═══════════ ÉTAPE 3 — FINALISATION ═══════════ */}
      {step === 3 && (
        <PactStep3
          t={t}
          memberSigs={memberSigs}
          shareUrl={shareUrl}
          canNativeShare={canNativeShare}
          linkCopied={linkCopied}
          onCopyShareLink={handleCopyShareLink}
          onNativeShare={handleNativeShare}
          onCloseAndReturn={() => {
            clearDraft();
            onSuccess();
          }}
        />
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
