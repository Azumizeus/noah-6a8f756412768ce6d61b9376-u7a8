// src/pages/premium/PremiumDemo.tsx
// ═══════════════════════════════════════════════════════════════════
// Page #/demo — rejeu SCRIPTÉ du parcours complet, sans wallet.
//
// Ce que la page montre : create → add_member → approve → finalize → fund →
// distribute, avec le vault qui se remplit puis se vide, les 2 % de frais
// protocole et la répartition aux membres. Ce qu'elle ne fait pas : aucune
// transaction, aucun appel RPC, aucune signature demandée.
//
// ⚠️ L'honnêteté de l'affichage fait partie de la fonctionnalité : la page
// l'annonce en clair (bandeau + sous-titre), et les adresses/signatures
// affichées sont fictives (lib/demoScenario.ts les génère de façon
// reproductible). Une démo qui laisserait croire à des transactions réelles
// serait un mensonge pour les juges — et un piège le jour où le parcours
// wallet, lui, échoue pour de vrai.
//
// Pourquoi la page n'appelle AUCUN hook de chaîne : un rejeu qui dépendrait
// du RPC ne serait pas rejouable le jour où le RPC ne répond pas —
// précisément le jour où on en a besoin.
//
// ── Mode tournage (#/demo?tournage=1) ────────────────────────────────
// Deux automatismes, et rien de plus : le rejeu part au chargement, et le
// bandeau de santé RPC (monté par PremiumNav, donc sur TOUTES les pages
// premium) se masque. Le but est de pouvoir lancer l'enregistrement sans
// toucher la souris : on ouvre le lien, on appuie sur REC.
// L'état vit dans le hash (lib/tournage.ts), donc le lien est partageable
// et le mode survit à un rechargement — sans quoi un rafraîchissement en
// pleine prise ramènerait le bandeau au milieu de la vidéo.
// Le mode n'est JAMAIS activé par défaut : masquer un incident RPC doit
// rester un geste explicite, jamais un effet de bord d'une page.

// ── Mise en page (revue le 11/10/2026 à l'écran) ─────────────────────
// La carte de l'étape courante vit dans la colonne de GAUCHE, sous le vault,
// et les colonnes sont alignées en haut (`alignItems: 'start'`). Avant :
// elle était sous une chronologie de huit lignes, donc hors de l'écran — la
// répartition aux membres, qui est le point que la vidéo doit montrer,
// demandait de faire défiler la page en pleine prise.
//
// ── Cadrage 1000 px (12/10/2026) ─────────────────────────────────────
// Mesuré en fenêtre 1000 × 1000 le 12/10/2026 : la page demandait 319 px de
// défilement et la carte de la répartition tombait 223 px sous la ligne de
// flottaison. Le mode tournage impose donc un CADRAGE : largeur fixée à
// 1000 px, marges et cartes resserrées, et surtout participants et vault
// côte à côte AU-DESSUS de la carte d'étape, qui garde toute la largeur.
//
// Ce n'est pas une page différente : c'est la même information repliée
// autrement. Aucun élément n'est retiré — le bandeau d'honnêteté (« rejeu
// hors chaîne ») reste affiché, et c'est le seul point non négociable de
// cette page. Un cadrage qui masquerait ce que la page admet ne montrerait
// plus le produit, il montrerait une publicité.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PremiumNav from './PremiumNav';
import { construireScenarioDemo, etapeDemo, nombreEtapes, type EtapeDemo } from '../../lib/demoScenario';
import { CADRAGE_PX, DELAI_MS_DEFAUT, echelleCadrage } from '../../lib/tournage';
import { useModeTournage } from '../../hooks/useModeTournage';
import '../../styles/premium.css';

/** Rythmes proposés à l'écran. Le réglage vit dans l'URL (`?pas=`, en
 *  secondes) : ces trois valeurs sont des raccourcis, pas la source de
 *  vérité — `?pas=5` écrit à la main fonctionne aussi. */
const RYTHMES = [
  { ms: 1600, cle: 'demo.rythmeRapide' },
  { ms: DELAI_MS_DEFAUT, cle: 'demo.rythmeNormal' },
  { ms: 3500, cle: 'demo.rythmeLent' },
] as const;

/** Secondes formatées pour l'affichage : « 2,4 » en français, « 2.4 » en anglais. */
function secondes(ms: number, lang: string): string {
  return (ms / 1000).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
}

/** Signature tronquée façon explorer : 8 premiers + 8 derniers caractères. */
function signatureCourte(signature: string): string {
  return signature.length > 20 ? `${signature.slice(0, 8)}…${signature.slice(-8)}` : signature;
}

function adresseCourte(adresse: string): string {
  return adresse.length > 16 ? `${adresse.slice(0, 6)}…${adresse.slice(-6)}` : adresse;
}

export default function PremiumDemo() {
  const { t, lang } = useLanguage();
  // Scénario figé : deux prises de la même page donnent la même chose
  // (aucun tirage aléatoire dans lib/demoScenario.ts). Il est reconstruit au
  // changement de langue, uniquement pour les RÔLES — des données que l'app
  // possède, contrairement aux rôles d'un vrai pacte. La vidéo étant tournée
  // en anglais, une table de participants en français se verrait.
  const scenario = useMemo(
    () =>
      construireScenarioDemo({
        participants: [
          { pseudo: 'Ada', role: t('demo.role.founder'), shareBps: 5000, createur: true },
          { pseudo: 'Kwame', role: t('demo.role.engineer'), shareBps: 3000 },
          { pseudo: 'Sofia', role: t('demo.role.design'), shareBps: 2000 },
        ],
      }),
    [t]
  );
  const total = nombreEtapes(scenario);

  // On démarre avec la première étape déjà jouée : la page n'est jamais
  // vide à l'ouverture, ce qui compte quand elle est filmée.
  const [visibles, setVisibles] = useState(1);
  const [lecture, setLecture] = useState(false);
  const termine = visibles >= total;

  // ── Mode tournage (`#/demo?tournage=1`) ──
  // Allumé : le rejeu part tout seul au chargement et le bandeau de santé
  // RPC se masque (il est monté par PremiumNav, il lit le même store).
  // L'intérêt est de pouvoir enregistrer la vidéo sans une seule
  // manipulation : on ouvre l'URL, on appuie sur « REC ».
  const { actif: tournage, basculer: basculerTournage, delaiMs, setDelaiMs } = useModeTournage();

  // Échelle du cadre de tournage (voir echelleCadrage dans lib/tournage.ts).
  // Elle ne dépend que de la hauteur de la fenêtre : un rechargement ou un
  // redimensionnement en pleine prise ne peut donc pas changer la largeur du
  // cadre, seulement son rendu.
  const [echelleCadre, setEchelleCadre] = useState(1);
  useEffect(() => {
    if (!tournage) {
      setEchelleCadre(1);
      return;
    }
    const mesurer = () => setEchelleCadre(echelleCadrage(window.innerHeight));
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, [tournage]);
  useEffect(() => {
    if (!tournage) return;
    // Redémarre à l'étape 1 : allumer le mode au milieu d'un rejeu déjà joué
    // enregistrerait une vidéo qui commence au milieu du parcours.
    setVisibles(1);
    setLecture(true);
  }, [tournage]);

  useEffect(() => {
    if (!lecture) return;
    if (termine) {
      setLecture(false);
      return;
    }
    const minuteur = setTimeout(() => setVisibles((n) => Math.min(n + 1, total)), delaiMs);
    return () => clearTimeout(minuteur);
    // `delaiMs` en dépendance : changer le rythme en cours de lecture doit
    // s'appliquer à l'étape suivante, pas seulement au prochain lancement.
  }, [lecture, termine, visibles, total, delaiMs]);

  const courante = etapeDemo(scenario, visibles - 1);
  const soldeVault = scenario.soldesVaultSol[visibles - 1] ?? 0;
  const progression = Math.round((visibles / total) * 100);
  const montrerPaiements = Boolean(courante?.paiements?.length);

  const carte: CSSProperties = {
    background: 'var(--p-card)',
    border: '1px solid var(--p-line)',
    borderRadius: 16,
    padding: tournage ? '12px 14px' : '18px 20px',
  };

  // Cadrage : largeur figée, marges resserrées, et cartes plus denses. Les
  // valeurs du cadrage ne sont appliquées qu'en mode tournage — la page
  // publique garde exactement la mise en page validée les 10 et 11/10.
  const gapCartes = tournage ? 10 : 16;

  // ⚠️ Les PARAMÈTRES de l'étape sont indispensables : `t()` laisse les
  // `{{placeholders}}` en place quand ils ne sont pas fournis. Constaté à
  // l'écran (11/10/2026) : la chronologie affichait « Création du pacte
  // « {{titre}} » ». scripts/demo-scenario.test.ts vérifie désormais que
  // chaque libellé reçoit bien les siens.
  const libelleEtape = (etape: EtapeDemo) => t(`demo.step.${etape.id}`, etape.params);

  return (
    <div className="p-page">
      <div
        // Conteneur du cadre : il porte la hauteur RÉELLE occupée (cadre
        // logique × échelle). C'est lui qui garantit l'absence de défilement —
        // sans lui, le cadre garderait 1000 px de boîte et la page défilerait
        // malgré l'échelle.
        style={
          tournage
            ? {
                height: CADRAGE_PX * echelleCadre,
                overflow: 'hidden',
                display: 'flex',
                justifyContent: 'center',
              }
            : undefined
        }
      >
      <div
        // Marqueur du cadrage : les tests et les captures s'y accrochent, et
        // un `data-` visible dans l'inspecteur explique d'un coup d'œil
        // pourquoi la page n'a pas sa largeur habituelle.
        data-cadrage={tournage ? String(CADRAGE_PX) : undefined}
        data-echelle-cadrage={tournage ? echelleCadre.toFixed(2) : undefined}
        style={{
          width: tournage ? CADRAGE_PX : undefined,
          minHeight: tournage ? CADRAGE_PX : undefined,
          maxWidth: tournage ? undefined : 1160,
          flexShrink: 0,
          transform: tournage ? `scale(${echelleCadre})` : undefined,
          transformOrigin: 'top center',
          margin: '0 auto',
          padding: tournage ? '12px 20px 10px' : '20px 24px 96px',
        }}
      >
        <PremiumNav active="#/demo" />

        <div className="p-hero">
          <p className="p-eyebrow">{t('demo.eyebrow')}</p>
          <h1 style={tournage ? { margin: '6px 0 4px', fontSize: 26 } : { margin: '10px 0 8px' }}>
            {t('demo.title')}
          </h1>
          <p
            className="sub"
            style={{
              fontSize: tournage ? 12.5 : 14,
              color: 'var(--p-ink2)',
              maxWidth: 620,
              lineHeight: tournage ? 1.5 : 1.65,
            }}
          >
            {t('demo.subtitle')}
          </p>
          <p
            className="p-pill"
            style={{ marginTop: tournage ? 8 : 14, borderColor: 'var(--p-line)', color: 'var(--p-ink2)' }}
          >
            {t('demo.banner')}
          </p>
        </div>

        {/* ── Commandes du rejeu ──
            ⚠️ Les variantes `.p-btn primary` / `.p-btn ghost` de premium.css
            sont OBLIGATOIRES : `.p-btn` seul ne pose ni fond ni bordure (il
            n'est stylé que comme base des deux variantes). Constaté à
            l'écran le 11/10/2026 : le bouton principal apparaissait comme du
            texte nu. De même, `.p-track` attend un enfant `<i>` (c'est lui
            qui porte le dégradé), pas un `<div>`. */}
        <p
          style={{
            margin: tournage ? '14px 0 0' : '26px 0 0',
            fontSize: 12.5,
            fontWeight: 700,
            color: 'var(--p-ink2)',
          }}
        >
          {t('demo.stepLabel', { n: visibles, total })}
        </p>
        {/* État du mode tournage, VISIBLE : sans ce rappel, on ne comprend pas
            pourquoi le bandeau de santé a disparu — et un état invisible se
            diagnostique mal pendant une prise. La durée et le cadrage
            effectifs y figurent : une valeur d'URL refusée se voit donc ici
            plutôt que de changer la prise en silence. */}
        {tournage && (
          <p
            className="p-pill"
            style={{ marginTop: 6, borderColor: 'var(--p-line)', color: 'var(--p-ink2)' }}
          >
            {t('demo.tournageOn', {
              pas: secondes(delaiMs, lang),
              largeur: CADRAGE_PX,
            })}
          </p>
        )}
        {/* Rythme — visible uniquement en tournage : c'est un réglage de
            prise, pas une commande du rejeu public. Chaque bouton ÉCRIT dans
            l'URL (`?pas=`), donc le lien partagé rejoue la même prise. */}
        {tournage && (
          <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--p-ink3)' }}>
              {t('demo.rythme')}
            </span>
            {RYTHMES.map((rythme) => {
              const s = secondes(rythme.ms, lang);
              const choisi = delaiMs === rythme.ms;
              return (
                <button
                  key={rythme.ms}
                  type="button"
                  className="p-btn ghost"
                  onClick={() => setDelaiMs(rythme.ms)}
                  aria-pressed={choisi}
                  title={t('demo.rythmeHint')}
                  // `.p-btn` a `min-height: 38px` et `flex: 1` (c'est un bouton
                  // de commande pleine largeur ailleurs) : en cadrage, ce
                  // serait 15 px pris sur la hauteur utile pour trois
                  // pastilles de réglage. On rend le bouton à sa taille ici.
                  style={{
                    flex: '0 0 auto',
                    minHeight: 26,
                    padding: '4px 10px',
                    fontSize: 11.5,
                    ...(choisi ? { borderColor: 'var(--p-accent)', color: 'var(--p-accent)' } : {}),
                  }}
                >
                  {t(rythme.cle, { s })}
                </button>
              );
            })}
          </div>
        )}
        <div className="p-actions">
          <button
            type="button"
            className="p-btn primary"
            onClick={() => {
              if (termine) {
                setVisibles(1);
                setLecture(true);
                return;
              }
              setLecture((l) => !l);
            }}
            aria-pressed={lecture}
          >
            {lecture ? t('demo.pause') : t('demo.play')}
          </button>
          <button
            type="button"
            className="p-btn ghost"
            onClick={() => setVisibles((n) => Math.min(n + 1, total))}
            disabled={termine}
          >
            {t('demo.next')}
          </button>
          <button
            type="button"
            className="p-btn ghost"
            onClick={() => {
              setLecture(false);
              setVisibles(1);
            }}
          >
            {t('demo.restart')}
          </button>
          {/* Bascule du mode tournage. Le titre porte la règle complète :
              lecture automatique + bandeau de santé masqué. */}
          <button
            type="button"
            className="p-btn ghost"
            onClick={() => basculerTournage(!tournage)}
            aria-pressed={tournage}
            title={t('demo.tournageHint')}
          >
            {tournage ? t('demo.tournageOff') : t('demo.tournage')}
          </button>
        </div>

        <div className="p-track" style={{ marginTop: 12 }} aria-hidden="true">
          <i style={{ width: `${progression}%` }} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
            // `start` : sans ça, la carte des participants s'étire sur toute
            // la hauteur de la chronologie et laisse un grand vide.
            alignItems: 'start',
            gap: gapCartes,
            marginTop: tournage ? 12 : 22,
          }}
        >
          {/* ── Colonne gauche : participants → vault → étape courante ──
              En cadrage, participants et vault passent CÔTE À CÔTE et la
              carte d'étape garde les deux colonnes. C'est ce repli qui fait
              tenir la répartition nominative dans l'écran (mesuré : 319 px
              de défilement en moins), sans retirer une seule information. */}
          <div
            style={
              tournage
                ? {
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: gapCartes,
                    // `alignItems: start` (et pas `stretch`, le défaut) : sinon
                    // chaque carte s'étire à la hauteur de la plus haute et
                    // laisse un grand vide sous les participants. Vu à
                    // l'écran le 12/10 en cadrage 1000 px.
                    alignItems: 'start',
                  }
                : { display: 'grid', gap: 16 }
            }
          >
            <div style={carte}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--p-ink)', margin: 0 }}>
                {t('demo.participants')}
              </h2>
              <ul
                style={{
                  listStyle: 'none',
                  margin: tournage ? '8px 0 0' : '12px 0 0',
                  padding: 0,
                  display: 'grid',
                  gap: tournage ? 6 : 10,
                }}
              >
                {scenario.participants.map((p) => (
                  <li
                    key={p.wallet}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: 'var(--p-ink)', fontWeight: 600 }}>
                      {p.pseudo}
                      {p.createur && (
                        <span className="p-pill" style={{ marginLeft: 8, fontSize: 10 }}>
                          {t('demo.creatorBadge')}
                        </span>
                      )}
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--p-ink3)', fontWeight: 500 }}>
                        {p.role}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--p-accent)' }}>
                        {p.shareBps / 100} %
                      </span>
                      <span
                        title={p.wallet}
                        style={{
                          display: 'block',
                          fontFamily: 'monospace',
                          fontSize: 10.5,
                          color: 'var(--p-ink3)',
                        }}
                      >
                        {adresseCourte(p.wallet)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={carte}>
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--p-ink3)',
                }}
              >
                {t('demo.vault')}
              </p>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: tournage ? 22 : 26,
                  fontWeight: 800,
                  color: 'var(--p-ink)',
                }}
              >
                {soldeVault.toFixed(4)} <small style={{ fontSize: 13, fontWeight: 600 }}>SOL</small>
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--p-ink3)' }}>{t('demo.vaultAfter')}</p>

              {termine && (
                <div style={{ marginTop: tournage ? 8 : 14, display: 'grid', gap: tournage ? 3 : 6 }}>
                  {/* `.p-kv` est un grid 1fr 1fr : à la largeur du cadrage
                      (≈ 100 px par colonne), « Frais protocole (2 %) »
                      passait à la ligne et le montant se retrouvait seul sur
                      la première. `auto auto` rend aux colonnes la largeur
                      de leur contenu — le libellé tient sur une ligne et le
                      montant reste aligné à droite. */}
                  <p
                    className="p-kv"
                    style={
                      tournage
                        ? { margin: 0, gridTemplateColumns: 'auto auto', justifyContent: 'space-between' }
                        : { margin: 0 }
                    }
                  >
                    <span>{t('demo.fee')}</span>
                    <span>{scenario.fraisProtocoleSol.toFixed(4)} SOL</span>
                  </p>
                  <p
                    className="p-kv"
                    style={
                      tournage
                        ? { margin: 0, gridTemplateColumns: 'auto auto', justifyContent: 'space-between' }
                        : { margin: 0 }
                    }
                  >
                    <span>{t('demo.net')}</span>
                    <span>{scenario.netMembresSol.toFixed(4)} SOL</span>
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--p-ok)', fontWeight: 600 }}>
                    {t('demo.done')}
                  </p>
                </div>
              )}
            </div>

            {/* Étape courante — remontée ici (voir l'en-tête du fichier) pour
                que la répartition aux membres soit visible sans défiler. */}
            {courante && (
              // `gridColumn: '1 / -1'` : la carte d'étape traverse les deux
              // colonnes du cadrage (elle est la seule à porter la répartition).
              <div style={tournage ? { ...carte, gridColumn: '1 / -1' } : carte} data-etape={courante.id}>
                <p className="p-kv" style={{ margin: 0 }}>
                  <span>{t('demo.instruction')}</span>
                  <span style={{ fontFamily: 'monospace' }}>{courante.instruction}</span>
                </p>
                <p className="p-kv" style={{ margin: '8px 0 0' }}>
                  <span>{t('demo.signer')}</span>
                  <span>{courante.signataire}</span>
                </p>
                <p className="p-kv" style={{ margin: '8px 0 0' }}>
                  <span>{t('demo.signature')}</span>
                  <span title={courante.signature} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {signatureCourte(courante.signature)}
                  </span>
                </p>

                {montrerPaiements && courante.paiements && (
                  <div style={{ marginTop: tournage ? 10 : 16 }}>
                    <h3
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: 'var(--p-ink)',
                        margin: '0 0 6px',
                      }}
                    >
                      {t('demo.payouts')}
                    </h3>
                    <ul
                      style={{
                        listStyle: 'none',
                        margin: 0,
                        padding: 0,
                        display: 'grid',
                        gap: tournage ? 4 : 6,
                      }}
                    >
                      {courante.paiements.map((p) => (
                        <li
                          key={p.wallet}
                          style={{
                            fontSize: 12,
                            color: 'var(--p-ink2)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <span>
                            {t('demo.payoutLine', {
                              pseudo: p.pseudo,
                              shares: `${p.shareBps / 100} % ${t('demo.shares')}`,
                              amount: p.amountSol.toFixed(4),
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--p-ink3)' }}>
                      {t('demo.wallet')} : {adresseCourte(scenario.protocolWallet)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Colonne droite : chronologie ── */}
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={carte}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--p-ink)', margin: 0 }}>
                {t('demo.timeline')}
              </h2>
              <ol
                style={{
                  listStyle: 'none',
                  margin: tournage ? '8px 0 0' : '12px 0 0',
                  padding: 0,
                  display: 'grid',
                  gap: tournage ? 5 : 8,
                }}
              >
                {scenario.etapes.map((e, i) => {
                  const jouee = i < visibles;
                  const active = i === visibles - 1;
                  return (
                    <li
                      key={e.signature}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        opacity: jouee ? 1 : 0.4,
                        padding: tournage ? '3px 6px' : '6px 8px',
                        borderRadius: 10,
                        background: active ? 'var(--p-accent-soft)' : 'transparent',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          flexShrink: 0,
                          width: tournage ? 18 : 20,
                          height: tournage ? 18 : 20,
                          borderRadius: 99,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: jouee ? 'var(--p-accent)' : 'var(--p-line)',
                          color: jouee ? '#fff' : 'var(--p-ink3)',
                        }}
                      >
                        {i + 1}
                      </span>
                      <span
                        style={{
                          fontSize: tournage ? 11.5 : 12,
                          color: 'var(--p-ink)',
                          lineHeight: tournage ? 1.35 : 1.5,
                        }}
                      >
                        {libelleEtape(e)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
          {/* Fin du cadre de tournage — voir `data-cadrage` à l'ouverture. */}
        </div>
      </div>
    </div>
  );
}
