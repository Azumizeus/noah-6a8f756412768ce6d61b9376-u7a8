import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressCodec,
  getProgramDerivedAddress,
  getTransactionEncoder,
  lamports,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import type { Address } from "@solana/kit";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import fs from "fs";
import path from "path";

// ═══════════════════════════════════════════════════════════════════════════
//  BuildPact — TEST DE CHARGE + MIGRATION (upgrade du 27/08)
//
//  Fichier SÉPARÉ de tests/workspace.ts, volontairement : workspace.ts fait
//  ~700 lignes déjà vertes, y injecter du code c'est risquer de casser une
//  suite qui passe. Le glob `tests/**/*.ts` d'Anchor.toml ramasse les deux.
//
//  ─── LES QUATRE CHOSES À SAVOIR AVANT DE TOUCHER À CE FICHIER ───
//
//  1. LiteSVM N'APPLIQUE PAS le plafond de 1232 octets.
//     C'est une contrainte de TRANSPORT (taille de paquet UDP), imposée par le
//     validateur et le client RPC — pas par le runtime SBF. LiteSVM exécute en
//     mémoire, hors réseau : une transaction de 1400 octets y passe sans
//     broncher, puis échoue en production.
//     Donc un test qui appelle create_project avec 800 octets et constate que
//     « ça passe » NE PROUVE RIEN. Chaque cas limite doit encoder la
//     transaction signée et asserter sa taille réelle sur le fil. C'est le
//     rôle de measure() / measureAndSend().
//
//  2. JAMAIS `rejectedWith` ici.
//     LiteSVM ne lève AUCUNE exception sur une transaction échouée : elle
//     RETOURNE un FailedTransactionMetadata. `expect(...).to.be.rejectedWith()`
//     ne rejette rien, n'attrape rien, et passe au vert sans tester quoi que
//     ce soit — pire qu'un test absent, car un test absent se voit.
//     → chai-as-promised n'est PAS une dépendance de ce projet, volontairement.
//
//  3. finalize EXIGE AU MOINS 2 MEMBRES (lib.rs l.275, NotEnoughMembers).
//     Tout scénario qui finalise doit donc créer le pact avec une part < 10000
//     et ajouter au moins un membre. Voir la note « PACT SOLO » plus bas.
//
//  4. BN vient de @coral-xyz/anchor, pas de "bn.js".
//     bn.js n'est pas une dépendance directe du package.json racine (seul
//     @types/bn.js y figure) : `import BN from "bn.js"` ne résout que par
//     l'arbre transitif d'Anchor et casserait à la prochaine montée de version.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_TX_SIZE = 1232;

// Doivent rester synchrones avec programs/workspace/src/lib.rs (l.16-72).
const MAX_PROJECT_ID_LEN = 20;
const MAX_TITLE_LEN = 80;
const MAX_DESC_LEN = 800;
const MAX_ROLE_LEN = 32;
const MAX_MEMBERS = 8;

// Recalcul indépendant de Member::LEN / Project::LEN (lib.rs l.493-519).
// Member::LEN  = 32 + (4+32) + 2 + 1                        = 71
// Project::LEN = 32 +24 +84 +504 +4 + 71*8 +1 +32 +1        = 1250
// space        = 8 + Project::LEN                           = 1258
//
// Volontairement recalculé ici plutôt que lu depuis l'IDL : si une borne bouge
// dans lib.rs sans que ce fichier soit mis à jour, le test casse et prévient,
// au lieu de suivre silencieusement et de valider un realloc sous-dimensionné.
const MEMBER_LEN = 32 + (4 + MAX_ROLE_LEN) + 2 + 1;
const PROJECT_LEN =
  32 +
  (4 + MAX_PROJECT_ID_LEN) +
  (4 + MAX_TITLE_LEN) +
  (4 + MAX_DESC_LEN) +
  4 +
  MEMBER_LEN * MAX_MEMBERS +
  1 +
  32 +
  1;
const PROJECT_ACCOUNT_SIZE = 8 + PROJECT_LEN; // 1258

const ascii = (n: number) => "A".repeat(n);
const accented = (bytes: number) => "é".repeat(Math.floor(bytes / 2));
const utf8Len = (s: string) => new TextEncoder().encode(s).length;

describe("buildpact — charge & migration (upgrade 27/08)", () => {
  const repoRoot = process.cwd();
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, "target/idl/workspace.json"), "utf8")
  );
  const coder = new anchor.BorshCoder(idl);
  const programAddress = address((idl as any).address);
  const systemProgramAddress = address("11111111111111111111111111111111");

  // Doit rester identique à PROTOCOL_WALLET dans lib.rs (l.14).
  const PROTOCOL_WALLET = address("AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH");

  const addressCodec = getAddressCodec();
  const txEncoder = getTransactionEncoder();

  let svm: LiteSVM;
  let funder: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  const measurements: { label: string; size: number }[] = [];

  // ═══════════════════════ Helpers ═══════════════════════

  async function buildSigned(ix: any, feePayerSigner: any) {
    const msg = appendTransactionMessageInstruction(
      ix,
      setTransactionMessageFeePayerSigner(
        feePayerSigner,
        createTransactionMessage({ version: 0 })
      )
    );
    const withLifetime = svm.setTransactionMessageLifetimeUsingLatestBlockhash(msg);
    return signTransactionMessageWithSigners(withLifetime, { abortSignal: undefined });
  }

  async function sendIx(ix: any, feePayerSigner: any) {
    const tx = await buildSigned(ix, feePayerSigner);
    const res = svm.sendTransaction(tx);
    if (res instanceof FailedTransactionMetadata) {
      throw new Error(res.meta().prettyLogs());
    }
    return res;
  }

  // Le SEUL pattern d'échec valide sous LiteSVM. Voir note 2 en tête de fichier.
  async function expectFailure(ix: any, feePayerSigner: any, includes: string) {
    const tx = await buildSigned(ix, feePayerSigner);
    const res = svm.simulateTransaction(tx);
    expect(res).to.be.instanceOf(FailedTransactionMetadata);
    const logText = (res as FailedTransactionMetadata).meta().logs().join("\n");
    expect(logText).to.include(includes);
  }

  // Cœur du fichier : svm.sendTransaction accepterait n'importe quelle taille.
  // Seul cet encodage reproduit ce que le client RPC refusera en production.
  async function measure(label: string, ix: any, feePayerSigner: any): Promise<number> {
    const tx = await buildSigned(ix, feePayerSigner);
    const size = txEncoder.encode(tx).length;
    measurements.push({ label, size });
    const margin = MAX_TX_SIZE - size;
    console.log(
      `    ↳ ${label.padEnd(46)} ${String(size).padStart(4)} / ${MAX_TX_SIZE} octets  (marge ${margin >= 0 ? "+" : ""}${margin})`
    );
    return size;
  }

  async function measureAndSend(label: string, ix: any, signer: any): Promise<number> {
    const size = await measure(label, ix, signer);
    expect(
      size,
      `${label} dépasse le plafond de transport : LiteSVM l'accepte, un validateur le refusera`
    ).to.be.at.most(MAX_TX_SIZE);
    await sendIx(ix, signer);
    return size;
  }

  async function freshSigner(sol: bigint = 50n) {
    const s = await generateKeyPairSigner();
    svm.airdrop(s.address, lamports(sol * 1_000_000_000n));
    return s;
  }

  async function pdasFor(creatorAddress: string, id: string) {
    const [pda] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        new TextEncoder().encode("project"),
        addressCodec.encode(address(creatorAddress)),
        new TextEncoder().encode(id),
      ],
    });
    const [vault] = await getProgramDerivedAddress({
      programAddress,
      seeds: [new TextEncoder().encode("vault"), addressCodec.encode(pda)],
    });
    return { pda, vault };
  }

  function fetchProject(addr: Address): any {
    const acc = svm.getAccount(addr);
    if (!acc) throw new Error(`Compte Project introuvable : ${addr}`);
    return coder.accounts.decode("Project", Buffer.from(acc.data));
  }

  // ═══════════════════ Constructeurs d'instructions ═══════════════════

  function createProjectIx(
    pda: Address,
    signer: any,
    opts: {
      id: string;
      title: string;
      description: string;
      role: string;
      shareBps: number;
      protocolWallet?: string;
    }
  ): any {
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("create_project", {
        project_id: opts.id,
        title: opts.title,
        description: opts.description,
        creator_role: opts.role,
        creator_share_bps: opts.shareBps,
        protocol_wallet: new anchor.web3.PublicKey(opts.protocolWallet ?? PROTOCOL_WALLET),
      }),
    };
  }

  function updateDescriptionIx(pda: Address, signer: any, description: string): any {
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("update_description", { description }),
    };
  }

  function addMemberIx(
    pda: Address,
    signer: any,
    wallet: string,
    role: string,
    shareBps: number
  ): any {
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.READONLY_SIGNER, signer },
      ],
      data: coder.instruction.encode("add_member", {
        wallet: new anchor.web3.PublicKey(wallet),
        role,
        share_bps: shareBps,
      }),
    };
  }

  function approveIx(pda: Address, signer: any): any {
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.READONLY_SIGNER, signer },
      ],
      data: coder.instruction.encode("approve", {}),
    };
  }

  function finalizeIx(pda: Address, signer: any): any {
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.READONLY_SIGNER, signer },
      ],
      data: coder.instruction.encode("finalize", {}),
    };
  }

  function fundIx(pda: Address, vault: Address, signer: any, amount: bigint | number): any {
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.READONLY },
        { address: vault, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("fund", {
        amount_lamports: new BN(amount.toString()),
      }),
    };
  }

  function distributeIx(
    pda: Address,
    vault: Address,
    signer: any,
    memberWallets: string[]
  ): any {
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.READONLY },
        { address: vault, role: AccountRole.WRITABLE },
        { address: PROTOCOL_WALLET, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.READONLY_SIGNER, signer },
        { address: systemProgramAddress, role: AccountRole.READONLY },
        // remaining_accounts : wallets dans l'ordre EXACT de project.members.
        // L'ordre est vérifié on-chain — un décalage donne MemberMismatch.
        ...memberWallets.map((w) => ({ address: address(w), role: AccountRole.WRITABLE })),
      ],
      data: coder.instruction.encode("distribute", {}),
    };
  }

  function closeProjectIx(pda: Address, vault: Address, signer: any): any {
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.WRITABLE },
        { address: vault, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("close_project", {}),
    };
  }

  // ═══════════════════════════════════════════════════════

  before(async () => {
    svm = new LiteSVM()
      .withSysvars()
      .withBuiltins()
      .withTransactionHistory(0n)
      .withLogBytesLimit(256n * 1024n);

    svm.addProgramFromFile(
      programAddress,
      path.resolve(repoRoot, "target/deploy/workspace.so")
    );

    const clock = svm.getClock();
    clock.unixTimestamp = BigInt(Math.floor(Date.now() / 1000));
    svm.setClock(clock);

    funder = await freshSigner(200n);

    // Garde-fou. Sans lui, un .so antérieur à l'upgrade ferait échouer les
    // tests de migration sur une erreur de discriminateur incompréhensible.
    const hasUpdate = (idl as any).instructions?.some(
      (i: any) => i.name === "update_description" || i.name === "updateDescription"
    );
    if (!hasUpdate) {
      throw new Error(
        "L'IDL ne contient pas `update_description` : target/deploy/workspace.so est " +
          "antérieur à l'upgrade du 27/08. Relancer `anchor build` avant les tests."
      );
    }
  });

  after(() => {
    if (measurements.length === 0) return;
    const worst = measurements.reduce((a, b) => (a.size > b.size ? a : b));
    console.log("\n  ═══ Récapitulatif des tailles de transaction ═══");
    for (const m of measurements) {
      console.log(`    ${String(m.size).padStart(4)} octets  ${m.label}`);
    }
    console.log(
      `\n    PIRE CAS : ${worst.size} / ${MAX_TX_SIZE} octets — marge ${MAX_TX_SIZE - worst.size} octets`
    );
    console.log(`    « ${worst.label} »`);
    if (MAX_TX_SIZE - worst.size < 100) {
      console.log(
        "    /!\\ Marge sous 100 octets : ne pas élargir MAX_DESC_LEN sans re-mesurer."
      );
    }
    console.log("  ═══════════════════════════════════════════════\n");
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  1. CHARGE — taille réelle des transactions
  //
  //  Étape 2b.5b du plan. lib.rs (l.30-40) AFFIRME que 800 octets tiennent
  //  dans les 1232 octets d'une transaction. C'était une estimation au doigt
  //  mouillé. Ici on mesure.
  // ═══════════════════════════════════════════════════════════════════════

  it("create_project au maximum absolu (20/80/800/32) tient sous 1232 octets", async () => {
    // Tous les champs textuels simultanément à leur borne : aucune combinaison
    // d'arguments valides ne peut produire une transaction plus lourde. Si ce
    // test passe, create_project est sûre pour toute entrée acceptée on-chain.
    const c = await freshSigner();
    const id = ascii(MAX_PROJECT_ID_LEN);
    const { pda } = await pdasFor(c.address, id);

    const ix = createProjectIx(pda, c, {
      id,
      title: ascii(MAX_TITLE_LEN),
      description: ascii(MAX_DESC_LEN),
      role: ascii(MAX_ROLE_LEN),
      shareBps: 10000,
    });

    await measureAndSend("create_project — toutes bornes au max", ix, c);

    const project = fetchProject(pda);
    expect(utf8Len(project.description)).to.equal(MAX_DESC_LEN);
    expect(utf8Len(project.title)).to.equal(MAX_TITLE_LEN);
    expect(utf8Len(project.members[0].role)).to.equal(MAX_ROLE_LEN);
    expect(svm.getAccount(pda)!.data.length).to.equal(PROJECT_ACCOUNT_SIZE);
  });

  it("update_description avec 800 octets tient largement sous le plafond", async () => {
    // 3 comptes, un seul argument. lib.rs (l.141-145) affirme qu'elle est
    // moins contrainte que create_project — on le vérifie par comparaison.
    const c = await freshSigner();
    const id = "load-update";
    const { pda } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "Court",
        description: "Court",
        role: "Lead",
        shareBps: 10000,
      }),
      c
    );

    const size = await measureAndSend(
      "update_description — 800 octets",
      updateDescriptionIx(pda, c, ascii(MAX_DESC_LEN)),
      c
    );

    const createMax = measurements.find((m) =>
      m.label.startsWith("create_project — toutes bornes")
    );
    if (createMax) {
      expect(
        size,
        "update_description devrait être plus légère que create_project"
      ).to.be.below(createMax.size);
    }
    expect(utf8Len(fetchProject(pda).description)).to.equal(MAX_DESC_LEN);
  });

  it("distribute à 8 membres (13 comptes) tient sous 1232 octets", async () => {
    // Cas le plus lourd en NOMBRE DE COMPTES : 5 fixes + 8 remaining = 13,
    // soit ~416 octets rien qu'en clés publiques, alors que les données
    // d'instruction sont minuscules. C'est l'inverse de create_project — d'où
    // la nécessité de mesurer les deux séparément.
    //
    // lib.rs (l.69-71) avertit que chaque membre ajoute un CPI transfer.
    // La consommation de calcul est validée par le fait que la transaction
    // s'exécute réellement, pas seulement qu'elle tienne en taille.
    const c = await freshSigner();
    const id = "load-distribute";
    const { pda, vault } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: ascii(MAX_TITLE_LEN),
        description: ascii(MAX_DESC_LEN),
        role: ascii(MAX_ROLE_LEN),
        shareBps: 3000,
      }),
      c
    );

    const members: any[] = [];
    for (let i = 0; i < MAX_MEMBERS - 1; i++) {
      const m = await freshSigner(2n);
      members.push(m);
      await sendIx(addMemberIx(pda, c, m.address, ascii(MAX_ROLE_LEN), 1000), c);
      await sendIx(approveIx(pda, m), m);
    }

    expect(fetchProject(pda).members.length).to.equal(MAX_MEMBERS);
    await sendIx(finalizeIx(pda, c), c);
    await sendIx(fundIx(pda, vault, funder, 8_000_000_000n), funder);

    const wallets = [c.address, ...members.map((m) => m.address)];
    const before = members.map((m) => BigInt(svm.getAccount(m.address)!.lamports));

    await measureAndSend(
      "distribute — 8 membres, 13 comptes",
      distributeIx(pda, vault, funder, wallets),
      funder
    );

    members.forEach((m, i) => {
      expect(
        BigInt(svm.getAccount(m.address)!.lamports) > before[i],
        `membre ${i} non payé`
      ).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  2. BORNES — la frontière exacte, dans les deux sens
  //
  //  Un test qui vérifie seulement « 800 passe » ne prouve pas que la borne
  //  est à 800 : elle pourrait être à 5000. Il faut les deux côtés.
  // ═══════════════════════════════════════════════════════════════════════

  it("accepte 800 octets de description, refuse 801", async () => {
    const c = await freshSigner();
    const id = "bound-desc";
    const { pda } = await pdasFor(c.address, id);

    await expectFailure(
      createProjectIx(pda, c, {
        id,
        title: "T",
        description: ascii(MAX_DESC_LEN + 1),
        role: "Lead",
        shareBps: 10000,
      }),
      c,
      "InvalidParameter"
    );

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "T",
        description: ascii(MAX_DESC_LEN),
        role: "Lead",
        shareBps: 10000,
      }),
      c
    );
    expect(utf8Len(fetchProject(pda).description)).to.equal(MAX_DESC_LEN);
  });

  it("accepte 80 octets de titre, refuse 81", async () => {
    const c = await freshSigner();
    const id = "bound-title";
    const { pda } = await pdasFor(c.address, id);

    await expectFailure(
      createProjectIx(pda, c, {
        id,
        title: ascii(MAX_TITLE_LEN + 1),
        description: "D",
        role: "Lead",
        shareBps: 10000,
      }),
      c,
      "InvalidParameter"
    );

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: ascii(MAX_TITLE_LEN),
        description: "D",
        role: "Lead",
        shareBps: 10000,
      }),
      c
    );
    expect(utf8Len(fetchProject(pda).title)).to.equal(MAX_TITLE_LEN);
  });

  it("accepte 32 octets de rôle, refuse 33, sur create_project comme sur add_member", async () => {
    const c = await freshSigner();
    const id = "bound-role";
    const { pda } = await pdasFor(c.address, id);

    // Le cas d'usage qui a motivé le passage de 24 à 32 octets.
    const realWorld = "Responsable Marketing Digital";
    expect(utf8Len(realWorld)).to.equal(29);

    await expectFailure(
      createProjectIx(pda, c, {
        id,
        title: "T",
        description: "D",
        role: ascii(MAX_ROLE_LEN + 1),
        shareBps: 10000,
      }),
      c,
      "InvalidParameter"
    );

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "T",
        description: "D",
        role: realWorld,
        shareBps: 5000,
      }),
      c
    );

    const m1 = await freshSigner(1n);
    await sendIx(addMemberIx(pda, c, m1.address, ascii(MAX_ROLE_LEN), 3000), c);

    const m2 = await freshSigner(1n);
    await expectFailure(
      addMemberIx(pda, c, m2.address, ascii(MAX_ROLE_LEN + 1), 1000),
      c,
      "InvalidParameter"
    );

    const project = fetchProject(pda);
    expect(project.members.length).to.equal(2);
    expect(utf8Len(project.members[1].role)).to.equal(MAX_ROLE_LEN);
  });

  it("compte des OCTETS UTF-8, pas des caractères : 400 « é » passent, 401 non", async () => {
    // LE test qui protège l'utilisateur francophone.
    //
    // lib.rs (l.50-54) avertit que le compteur de l'UI doit compter des OCTETS.
    // Si le frontend utilise `s.length`, il annonce 800 caractères disponibles
    // alors que le programme n.en accepte que 400 en français accentué —
    // l'utilisateur rédige tout, puis se prend un InvalidParameter au moment de
    // signer. Le compteur doit utiliser `new TextEncoder().encode(s).length`.
    const c = await freshSigner();
    const id = "bound-utf8";
    const { pda } = await pdasFor(c.address, id);

    const exactly500 = accented(800);
    expect(exactly500.length).to.equal(400); // 500 CARACTÈRES…
    expect(utf8Len(exactly500)).to.equal(800); // …mais 1000 OCTETS

    const tooLong = exactly500 + "é";
    expect(tooLong.length).to.equal(401);
    expect(utf8Len(tooLong)).to.equal(802);

    // 251 caractères seulement, et pourtant refusé : la borne est en octets.
    await expectFailure(
      createProjectIx(pda, c, {
        id,
        title: "T",
        description: tooLong,
        role: "Lead",
        shareBps: 10000,
      }),
      c,
      "InvalidParameter"
    );

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "T",
        description: exactly500,
        role: "Lead",
        shareBps: 10000,
      }),
      c
    );

    const stored = fetchProject(pda).description;
    expect(utf8Len(stored)).to.equal(800);
    expect(stored).to.equal(exactly500);
  });

  it("refuse une description de 801 octets via update_description", async () => {
    const c = await freshSigner();
    const id = "bound-upd";
    const { pda } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "T",
        description: "D",
        role: "Lead",
        shareBps: 10000,
      }),
      c
    );

    await expectFailure(
      updateDescriptionIx(pda, c, ascii(MAX_DESC_LEN + 1)),
      c,
      "InvalidParameter"
    );
    expect(fetchProject(pda).description).to.equal("D");
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  3. MIGRATION — update_description comme realloc
  //
  //  Limite honnête : LiteSVM charge le .so COURANT, donc tous les comptes
  //  créés ici le sont déjà à 1258 octets. On ne peut PAS simuler un compte
  //  réellement ancien (créé à 8 + ancien LEN) sans écrire un compte brut à la
  //  main. Ce qui est vérifié ici : le realloc ne rétrécit jamais, il est
  //  idempotent, il ne corrompt pas les membres, et les contrôles d'accès
  //  tiennent.
  //
  //  → La migration RÉELLE depuis l'ancien format doit être vérifiée sur
  //    devnet, sur un pact existant, avant d'annoncer la fonctionnalité.
  //    Étape à ne pas sauter : aucun test local ne peut la couvrir.
  // ═══════════════════════════════════════════════════════════════════════

  it("le realloc porte le compte à 8 + Project::LEN et ne le rétrécit jamais", async () => {
    // lib.rs (l.154-157) : le realloc cible systématiquement Project::LEN,
    // jamais une taille calculée sur le contenu. On écrit une description
    // MINUSCULE : si la taille du compte bougeait, la prochaine écriture
    // longue échouerait en AccountDidNotSerialize — une erreur très difficile
    // à relier à sa cause.
    const c = await freshSigner();
    const id = "mig-noshrink";
    const { pda } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: ascii(MAX_TITLE_LEN),
        description: ascii(MAX_DESC_LEN),
        role: ascii(MAX_ROLE_LEN),
        shareBps: 10000,
      }),
      c
    );
    expect(svm.getAccount(pda)!.data.length).to.equal(PROJECT_ACCOUNT_SIZE);

    await sendIx(updateDescriptionIx(pda, c, "x"), c);
    expect(
      svm.getAccount(pda)!.data.length,
      "le compte a rétréci — la prochaine écriture longue échouera"
    ).to.equal(PROJECT_ACCOUNT_SIZE);
    expect(fetchProject(pda).description).to.equal("x");

    await sendIx(updateDescriptionIx(pda, c, ascii(MAX_DESC_LEN)), c);
    expect(utf8Len(fetchProject(pda).description)).to.equal(MAX_DESC_LEN);
    expect(svm.getAccount(pda)!.data.length).to.equal(PROJECT_ACCOUNT_SIZE);
  });

  it("update_description est idempotent : deux appels de suite, aucun effet de bord", async () => {
    // Un pact créé APRÈS l'upgrade a déjà la bonne taille : le realloc est un
    // no-op. Il ne doit ni échouer, ni refacturer du rent, ni corrompre le
    // Vec<Member> qui suit la description dans la sérialisation Borsh.
    const c = await freshSigner();
    const id = "mig-idem";
    const { pda } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "Titre",
        description: "Initiale",
        role: "Lead",
        shareBps: 6000,
      }),
      c
    );
    const m = await freshSigner(2n);
    await sendIx(addMemberIx(pda, c, m.address, "Designer", 4000), c);

    const text = ascii(MAX_DESC_LEN);
    await sendIx(updateDescriptionIx(pda, c, text), c);
    const afterFirst = BigInt(svm.getAccount(c.address)!.lamports);

    await sendIx(updateDescriptionIx(pda, c, text), c);
    const afterSecond = BigInt(svm.getAccount(c.address)!.lamports);

    // Seuls les frais de transaction (5000 lamports) doivent séparer les deux.
    expect(
      Number(afterFirst - afterSecond),
      "le second realloc a facturé du rent — il devrait être un no-op"
    ).to.be.below(100_000);

    // Le Vec<Member> est sérialisé APRÈS la description : c'est lui qui
    // trinquerait en premier si le realloc décalait les offsets.
    const project = fetchProject(pda);
    expect(project.members.length).to.equal(2);
    expect(Number(project.members[0].share_bps)).to.equal(6000);
    expect(Number(project.members[1].share_bps)).to.equal(4000);
    expect(project.members[0].approved).to.be.true;
    expect(project.members[1].approved).to.be.false;
    expect(svm.getAccount(pda)!.data.length).to.equal(PROJECT_ACCOUNT_SIZE);
  });

  it("refuse update_description sur un pact finalisé", async () => {
    // lib.rs (l.159-160) : modifier après finalize altérerait le texte que les
    // autres membres ont explicitement approuvé.
    const c = await freshSigner();
    const id = "mig-final";
    const { pda } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "Titre",
        description: "Texte approuvé par tous",
        role: "Lead",
        shareBps: 5000,
      }),
      c
    );
    const m = await freshSigner(2n);
    await sendIx(addMemberIx(pda, c, m.address, "Builder", 5000), c);
    await sendIx(approveIx(pda, m), m);
    await sendIx(finalizeIx(pda, c), c);

    await expectFailure(
      updateDescriptionIx(pda, c, "Texte réécrit après approbation"),
      c,
      "AlreadyFinalized"
    );
    expect(fetchProject(pda).description).to.equal("Texte approuvé par tous");
  });

  it("refuse update_description depuis un signataire non-créateur", async () => {
    // has_one = creator @ ErrorCode::Unauthorized (lib.rs l.555).
    const c = await freshSigner();
    const id = "mig-auth";
    const { pda } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "Titre",
        description: "Original",
        role: "Lead",
        shareBps: 5000,
      }),
      c
    );
    const m = await freshSigner(2n);
    await sendIx(addMemberIx(pda, c, m.address, "Builder", 5000), c);

    // Un membre légitime du pact, mais pas le créateur : doit être refusé.
    await expectFailure(updateDescriptionIx(pda, m, "Détourné"), m, "Unauthorized");
    expect(fetchProject(pda).description).to.equal("Original");
  });

  it("un pact au maximum reste finalisable et distribuable après update_description", async () => {
    // Bout-en-bout : le realloc ne doit rien casser en aval de la chaîne.
    const c = await freshSigner();
    const id = "mig-e2e";
    const { pda, vault } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "Titre initial",
        description: "Courte",
        role: "Lead",
        shareBps: 5000,
      }),
      c
    );
    const m = await freshSigner(2n);
    await sendIx(addMemberIx(pda, c, m.address, ascii(MAX_ROLE_LEN), 5000), c);
    await sendIx(approveIx(pda, m), m);

    // Description portée au maximum, en UTF-8 multi-octets, juste avant finalize.
    await sendIx(updateDescriptionIx(pda, c, accented(800)), c);
    await sendIx(finalizeIx(pda, c), c);
    await sendIx(fundIx(pda, vault, funder, 4_000_000_000n), funder);

    const memberBefore = BigInt(svm.getAccount(m.address)!.lamports);
    await sendIx(distributeIx(pda, vault, funder, [c.address, m.address]), funder);

    expect(BigInt(svm.getAccount(m.address)!.lamports) > memberBefore).to.be.true;
    expect(utf8Len(fetchProject(pda).description)).to.equal(800);
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  4. PACT SOLO — la conséquence de `members.len() >= 2`
  //
  //  lib.rs (l.275) impose au moins 2 membres pour finaliser. Un pact créé
  //  avec creator_share_bps = 10000 est donc dans un état PARTICULIER :
  //
  //    • il ne peut pas être finalisé (NotEnoughMembers) ;
  //    • il ne peut pas accueillir un membre avec une part > 0, puisque le
  //      créateur détient déjà les 10000 bps (ShareExceeded) ;
  //    • et il n'existe AUCUNE instruction pour réduire la part d'un membre
  //      déjà inscrit.
  //
  //  Ce n'est PAS un blocage de fonds : le pact est encore Open, donc son
  //  vault est vide (fund exige Finalized), et close_project rend le rent au
  //  créateur. Mais c'est une impasse fonctionnelle silencieuse, et ces trois
  //  tests la documentent de façon exécutable.
  //
  //  Conséquence pour l'UI : le wizard ne doit jamais laisser créer un pact à
  //  10000 bps pour le créateur seul sans avertissement. Voir le tableau des
  //  deux sorties dans BUILDPACT_MIGRATION_PLAN.md.
  // ═══════════════════════════════════════════════════════════════════════

  it("un pact solo ne peut pas être finalisé (NotEnoughMembers)", async () => {
    const c = await freshSigner();
    const id = "solo-final";
    const { pda } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "Pact solo",
        description: "Créateur seul à 100%",
        role: "Founder",
        shareBps: 10000,
      }),
      c
    );

    const project = fetchProject(pda);
    expect(project.members.length).to.equal(1);
    expect(project.members[0].approved).to.be.true; // le créateur s'auto-approuve
    expect(Number(project.members[0].share_bps)).to.equal(10000);

    // Toutes les autres conditions de finalize sont réunies — seul le nombre
    // de membres bloque.
    await expectFailure(finalizeIx(pda, c), c, "NotEnoughMembers");
    expect(fetchProject(pda).status).to.deep.equal({ Open: {} });
  });

  it("sortie n°1 d'un pact solo à 100% : ajouter un membre à 0 bps", async () => {
    // Le créateur garde 100% des revenus, le second membre n'est là que pour
    // satisfaire la contrainte des 2 membres. Fonctionne, mais donne un
    // co-fondateur à 0% dans la cap table — à n'utiliser qu'en connaissance
    // de cause.
    const c = await freshSigner();
    const id = "solo-zero";
    const { pda, vault } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "Solo puis 0 bps",
        description: "Contourne NotEnoughMembers sans diluer le créateur",
        role: "Founder",
        shareBps: 10000,
      }),
      c
    );

    const witness = await freshSigner(2n);

    // Toute part > 0 est refusée : le créateur détient déjà la totalité.
    await expectFailure(
      addMemberIx(pda, c, witness.address, "Advisor", 1),
      c,
      "ShareExceeded"
    );

    // 0 bps passe : le total reste à 10000.
    await sendIx(addMemberIx(pda, c, witness.address, "Advisor", 0), c);
    await sendIx(approveIx(pda, witness), witness);
    await sendIx(finalizeIx(pda, c), c);
    expect(fetchProject(pda).status).to.deep.equal({ Finalized: {} });

    // Et la distribution fonctionne : le membre à 0 bps ne reçoit rien.
    await sendIx(fundIx(pda, vault, funder, 2_000_000_000n), funder);
    const witnessBefore = BigInt(svm.getAccount(witness.address)!.lamports);
    const creatorBefore = BigInt(svm.getAccount(c.address)!.lamports);

    await sendIx(distributeIx(pda, vault, funder, [c.address, witness.address]), funder);

    expect(BigInt(svm.getAccount(witness.address)!.lamports)).to.equal(witnessBefore);
    expect(BigInt(svm.getAccount(c.address)!.lamports) > creatorBefore).to.be.true;
  });

  it("sortie n°2 d'un pact solo : le fermer et le recréer, rent récupéré", async () => {
    // La sortie propre. Aucun fonds n'est bloqué : le pact est Open, donc son
    // vault est forcément vide (fund exige Finalized), et close_project rend
    // le rent au créateur. Le même project_id peut ensuite être réutilisé,
    // puisque le PDA a été libéré.
    const c = await freshSigner();
    const id = "solo-reset";
    const { pda, vault } = await pdasFor(c.address, id);

    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "À refaire",
        description: "Part créateur mal calibrée",
        role: "Founder",
        shareBps: 10000,
      }),
      c
    );

    const rentLocked = BigInt(svm.getAccount(pda)!.lamports);
    const balanceBefore = BigInt(svm.getAccount(c.address)!.lamports);

    await sendIx(closeProjectIx(pda, vault, c), c);

    const closed = svm.getAccount(pda);
    const isGone = !closed || closed.exists === false || Boolean((closed as any).lamports === undefined) || BigInt((closed as any).lamports ?? 0n) === 0n;
    expect(isGone, "le compte Project devrait être fermé").to.be.true;

    const balanceAfter = BigInt(svm.getAccount(c.address)!.lamports);
    expect(balanceAfter - balanceBefore >= rentLocked - 10_000n).to.be.true;

    // Le même project_id est réutilisable, cette fois avec une part laissant
    // de la place à un co-fondateur.
    await sendIx(
      createProjectIx(pda, c, {
        id,
        title: "Refait correctement",
        description: "60/40 entre deux co-fondateurs",
        role: "Founder",
        shareBps: 6000,
      }),
      c
    );

    const partner = await freshSigner(2n);
    await sendIx(addMemberIx(pda, c, partner.address, "Co-founder", 4000), c);
    await sendIx(approveIx(pda, partner), partner);
    await sendIx(finalizeIx(pda, c), c);

    expect(fetchProject(pda).status).to.deep.equal({ Finalized: {} });
  });
});
