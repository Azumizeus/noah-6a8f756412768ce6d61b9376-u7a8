// ═══════════════════════════════════════════════════════════════════════════
//  BuildPact — suite d'audit LiteSVM
//
//  Note sur l'import de BN (corrigé le 27/08) :
//  `import BN from "bn.js"` fonctionnait, mais bn.js n'est PAS une dépendance
//  directe du package.json racine — la résolution passait par l'arbre de
//  dépendances d'Anchor. Une montée de version d'Anchor qui déplacerait ou
//  hisserait bn.js casserait ce fichier sans qu'aucun changement de code ne
//  l'explique. Anchor ré-exporte la même classe, même instance : passer par
//  son export supprime la dépendance fantôme sans rien installer.
// ═══════════════════════════════════════════════════════════════════════════

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
  lamports,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import type { Address } from "@solana/kit";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import fs from "fs";
import path from "path";

describe("buildpact - LiteSVM", () => {
  const repoRoot = process.cwd();
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, "target/idl/workspace.json"), "utf8")
  );
  const coder = new anchor.BorshCoder(idl);
  const programAddress = address((idl as any).address);
  const systemProgramAddress = address("11111111111111111111111111111111");
  // Must match PROTOCOL_WALLET locked in programs/workspace/src/lib.rs
  const PROTOCOL_WALLET = address("AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH");

  let svm: LiteSVM;
  const addressCodec = getAddressCodec();

  let creator: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let memberA: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let memberB: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let funder: Awaited<ReturnType<typeof generateKeyPairSigner>>;

  let projectPDA: Address;
  let vaultPDA: Address;

  const projectId = "pact-1";
  const FUND_AMOUNT = 10_000_000_000n; // 10 SOL

  async function sendIx(ix: any, feePayerSigner: any) {
    const msg = appendTransactionMessageInstruction(
      ix,
      setTransactionMessageFeePayerSigner(
        feePayerSigner,
        createTransactionMessage({ version: 0 })
      )
    );
    const msgWithLifetime = svm.setTransactionMessageLifetimeUsingLatestBlockhash(msg);
    const tx = await signTransactionMessageWithSigners(msgWithLifetime, {
      abortSignal: undefined,
    });
    const res = svm.sendTransaction(tx);
    if (res instanceof FailedTransactionMetadata) {
      throw new Error(res.meta().prettyLogs());
    }
    return res;
  }

  async function expectFailure(ix: any, feePayerSigner: any, includes: string) {
    const msg = appendTransactionMessageInstruction(
      ix,
      setTransactionMessageFeePayerSigner(
        feePayerSigner,
        createTransactionMessage({ version: 0 })
      )
    );
    const msgWithLifetime = svm.setTransactionMessageLifetimeUsingLatestBlockhash(msg);
    const tx = await signTransactionMessageWithSigners(msgWithLifetime, {
      abortSignal: undefined,
    });
    const res = svm.simulateTransaction(tx);
    expect(res).to.be.instanceOf(FailedTransactionMetadata);
    const logText = (res as FailedTransactionMetadata).meta().logs().join("\n");
    expect(logText).to.include(includes);
  }

  function fetchAccount<T>(name: string, addr: Address): T {
    const acc = svm.getAccount(addr);
    if (!acc || ("exists" in acc && !(acc as any).exists)) {
      throw new Error(`Missing account ${name} at ${addr}`);
    }
    return coder.accounts.decode(name, Buffer.from(acc.data)) as T;
  }

  function toAddressString(value: any): string {
    if (typeof value === "string") return value;
    if (value instanceof Uint8Array) return getAddressCodec().decode(value);
    if (value && typeof value.toBase58 === "function") return value.toBase58();
    if (value && typeof value.length === "number") {
      return getAddressCodec().decode(Uint8Array.from(value));
    }
    throw new Error("Unable to decode address");
  }

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

    creator = await generateKeyPairSigner();
    memberA = await generateKeyPairSigner();
    memberB = await generateKeyPairSigner();
    funder = await generateKeyPairSigner();

    svm.airdrop(creator.address, lamports(100n * 1_000_000_000n));
    svm.airdrop(memberA.address, lamports(10n * 1_000_000_000n));
    svm.airdrop(memberB.address, lamports(10n * 1_000_000_000n));
    svm.airdrop(funder.address, lamports(100n * 1_000_000_000n));

    [projectPDA] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        new TextEncoder().encode("project"),
        addressCodec.encode(creator.address),
        new TextEncoder().encode(projectId),
      ],
    });

    [vaultPDA] = await getProgramDerivedAddress({
      programAddress,
      seeds: [new TextEncoder().encode("vault"), addressCodec.encode(projectPDA)],
    });
  });

  it("creates the project with creator as approved member[0]", async () => {
    const data = coder.instruction.encode("create_project", {
      project_id: projectId,
      title: "Buildpact Test",
      description: "End to end collaboration pact test",
      creator_role: "Lead Dev",
      creator_share_bps: 5000,
      protocol_wallet: new anchor.web3.PublicKey(PROTOCOL_WALLET),
    });

    const ix: any = {
      programAddress,
      accounts: [
        { address: projectPDA, role: AccountRole.WRITABLE },
        { address: creator.address, role: AccountRole.WRITABLE_SIGNER, signer: creator },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data,
    };
    await sendIx(ix, creator);

    const project = fetchAccount<any>("Project", projectPDA);
    expect(project.members.length).to.equal(1);
    expect(project.members[0].approved).to.be.true;
    expect(Number(project.members[0].share_bps)).to.equal(5000);
    expect(toAddressString(project.protocol_wallet)).to.equal(PROTOCOL_WALLET);
  });

  it("rejects create_project with a protocol_wallet that is not the locked one", async () => {
    const rogueCreator = await generateKeyPairSigner();
    const rogueWallet = await generateKeyPairSigner();
    svm.airdrop(rogueCreator.address, lamports(10n * 1_000_000_000n));

    const rogueId = "pact-rogue-protocol";
    const [roguePDA] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        new TextEncoder().encode("project"),
        addressCodec.encode(rogueCreator.address),
        new TextEncoder().encode(rogueId),
      ],
    });

    const data = coder.instruction.encode("create_project", {
      project_id: rogueId,
      title: "Rogue",
      description: "Attempts to redirect protocol fees",
      creator_role: "Lead",
      creator_share_bps: 10000,
      protocol_wallet: new anchor.web3.PublicKey(rogueWallet.address),
    });

    const ix: any = {
      programAddress,
      accounts: [
        { address: roguePDA, role: AccountRole.WRITABLE },
        {
          address: rogueCreator.address,
          role: AccountRole.WRITABLE_SIGNER,
          signer: rogueCreator,
        },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data,
    };

    await expectFailure(ix, rogueCreator, "InvalidProtocolWallet");
  });

  it("adds two more members (creator signs)", async () => {
    const addMember = async (wallet: string, role: string, shareBps: number) => {
      const data = coder.instruction.encode("add_member", {
        wallet: new anchor.web3.PublicKey(wallet),
        role,
        share_bps: shareBps,
      });
      const ix: any = {
        programAddress,
        accounts: [
          { address: projectPDA, role: AccountRole.WRITABLE },
          { address: creator.address, role: AccountRole.READONLY_SIGNER, signer: creator },
        ],
        data,
      };
      await sendIx(ix, creator);
    };

    await addMember(memberA.address, "Designer", 3000);
    await addMember(memberB.address, "Marketing", 2000);

    const project = fetchAccount<any>("Project", projectPDA);
    expect(project.members.length).to.equal(3);
  });

  it("rejects add_member from a non-creator signer", async () => {
    const data = coder.instruction.encode("add_member", {
      wallet: new anchor.web3.PublicKey(funder.address),
      role: "Investor",
      share_bps: 100,
    });
    const ix: any = {
      programAddress,
      accounts: [
        { address: projectPDA, role: AccountRole.WRITABLE },
        { address: memberA.address, role: AccountRole.READONLY_SIGNER, signer: memberA },
      ],
      data,
    };
    await expectFailure(ix, memberA, "Unauthorized");
  });

  it("members approve the pact", async () => {
    const approve = async (memberSigner: any) => {
      const data = coder.instruction.encode("approve", {});
      const ix: any = {
        programAddress,
        accounts: [
          { address: projectPDA, role: AccountRole.WRITABLE },
          {
            address: memberSigner.address,
            role: AccountRole.READONLY_SIGNER,
            signer: memberSigner,
          },
        ],
        data,
      };
      await sendIx(ix, memberSigner);
    };

    await approve(memberA);
    await approve(memberB);

    const project = fetchAccount<any>("Project", projectPDA);
    expect(project.members.every((m: any) => m.approved)).to.be.true;
  });

  it("finalizes the pact once all members approved and shares sum to 100%", async () => {
    const data = coder.instruction.encode("finalize", {});
    const ix: any = {
      programAddress,
      accounts: [
        { address: projectPDA, role: AccountRole.WRITABLE },
        { address: creator.address, role: AccountRole.READONLY_SIGNER, signer: creator },
      ],
      data,
    };
    await sendIx(ix, creator);

    const project = fetchAccount<any>("Project", projectPDA);
    expect(project.status).to.deep.equal({ Finalized: {} });
  });

  it("funds the finalized project's vault", async () => {
    const data = coder.instruction.encode("fund", {
      amount_lamports: new BN(FUND_AMOUNT.toString()),
    });
    const ix: any = {
      programAddress,
      accounts: [
        { address: projectPDA, role: AccountRole.READONLY },
        { address: vaultPDA, role: AccountRole.WRITABLE },
        { address: funder.address, role: AccountRole.WRITABLE_SIGNER, signer: funder },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data,
    };
    await sendIx(ix, funder);

    const vaultAccount = svm.getAccount(vaultPDA);
    expect(BigInt(vaultAccount!.lamports) >= FUND_AMOUNT).to.be.true;
  });

  it("distributes funds: protocol gets exactly 2%, members split 98% pro-rata", async () => {
    const rentMin = BigInt(svm.minimumBalanceForRentExemption(0n).toString());
    const vaultBefore = BigInt(svm.getAccount(vaultPDA)!.lamports);
    const available = vaultBefore - rentMin;

    const expectedFee = (available * 200n) / 10000n;
    const afterFee = available - expectedFee;
    const expectedCreator = (afterFee * 5000n) / 10000n;
    const expectedMemberA = (afterFee * 3000n) / 10000n;
    const expectedMemberB = (afterFee * 2000n) / 10000n;

    const protocolBefore = BigInt(svm.getAccount(PROTOCOL_WALLET)?.lamports ?? 0);
    const creatorBefore = BigInt(svm.getAccount(creator.address)!.lamports);
    const memberABefore = BigInt(svm.getAccount(memberA.address)!.lamports);
    const memberBBefore = BigInt(svm.getAccount(memberB.address)!.lamports);

    const data = coder.instruction.encode("distribute", {});
    const ix: any = {
      programAddress,
      accounts: [
        { address: projectPDA, role: AccountRole.READONLY },
        { address: vaultPDA, role: AccountRole.WRITABLE },
        { address: PROTOCOL_WALLET, role: AccountRole.WRITABLE },
        { address: funder.address, role: AccountRole.READONLY_SIGNER, signer: funder },
        { address: systemProgramAddress, role: AccountRole.READONLY },
        // remaining_accounts: member wallets in project.members order
        { address: creator.address, role: AccountRole.WRITABLE },
        { address: memberA.address, role: AccountRole.WRITABLE },
        { address: memberB.address, role: AccountRole.WRITABLE },
      ],
      data,
    };
    await sendIx(ix, funder);

    const protocolAfter = BigInt(svm.getAccount(PROTOCOL_WALLET)!.lamports);
    const creatorAfter = BigInt(svm.getAccount(creator.address)!.lamports);
    const memberAAfter = BigInt(svm.getAccount(memberA.address)!.lamports);
    const memberBAfter = BigInt(svm.getAccount(memberB.address)!.lamports);

    expect(protocolAfter - protocolBefore).to.equal(expectedFee);
    // exactly 2% of the available (post-rent) vault balance
    expect(expectedFee).to.equal((available * 2n) / 100n);

    expect(creatorAfter - creatorBefore).to.equal(expectedCreator);
    expect(memberAAfter - memberABefore).to.equal(expectedMemberA);
    expect(memberBAfter - memberBBefore).to.equal(expectedMemberB);

    const vaultAfter = BigInt(svm.getAccount(vaultPDA)!.lamports);
    expect(vaultAfter >= rentMin).to.be.true;
  });

  it("rejects funding a still-open project", async () => {
    const otherProjectId = "pact-open";
    const otherCreator = await generateKeyPairSigner();
    svm.airdrop(otherCreator.address, lamports(10n * 1_000_000_000n));

    const [otherProjectPDA] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        new TextEncoder().encode("project"),
        addressCodec.encode(otherCreator.address),
        new TextEncoder().encode(otherProjectId),
      ],
    });
    const [otherVaultPDA] = await getProgramDerivedAddress({
      programAddress,
      seeds: [new TextEncoder().encode("vault"), addressCodec.encode(otherProjectPDA)],
    });

    const createData = coder.instruction.encode("create_project", {
      project_id: otherProjectId,
      title: "Still Open",
      description: "Not finalized",
      creator_role: "Lead",
      creator_share_bps: 10000,
      protocol_wallet: new anchor.web3.PublicKey(PROTOCOL_WALLET),
    });
    const createIx: any = {
      programAddress,
      accounts: [
        { address: otherProjectPDA, role: AccountRole.WRITABLE },
        { address: otherCreator.address, role: AccountRole.WRITABLE_SIGNER, signer: otherCreator },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data: createData,
    };
    await sendIx(createIx, otherCreator);

    const fundData = coder.instruction.encode("fund", {
      amount_lamports: new BN(1_000_000_000),
    });
    const fundIx: any = {
      programAddress,
      accounts: [
        { address: otherProjectPDA, role: AccountRole.READONLY },
        { address: otherVaultPDA, role: AccountRole.WRITABLE },
        { address: funder.address, role: AccountRole.WRITABLE_SIGNER, signer: funder },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data: fundData,
    };
    await expectFailure(fundIx, funder, "NotFinalized");
  });

  // ═══════════════════════════════════════════════════════════════
  //  CLOSE PROJECT — CIPHER AUDIT SUITE
  // ═══════════════════════════════════════════════════════════════

  async function createOpenProject(creatorSigner: any, id: string) {
    const [pda] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        new TextEncoder().encode("project"),
        addressCodec.encode(creatorSigner.address),
        new TextEncoder().encode(id),
      ],
    });
    const [vault] = await getProgramDerivedAddress({
      programAddress,
      seeds: [new TextEncoder().encode("vault"), addressCodec.encode(pda)],
    });

    const data = coder.instruction.encode("create_project", {
      project_id: id,
      title: "Closable",
      description: "Will be closed",
      creator_role: "Lead",
      creator_share_bps: 10000,
      protocol_wallet: new anchor.web3.PublicKey(PROTOCOL_WALLET),
    });
    const ix: any = {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.WRITABLE },
        { address: creatorSigner.address, role: AccountRole.WRITABLE_SIGNER, signer: creatorSigner },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data,
    };
    await sendIx(ix, creatorSigner);
    return { pda, vault };
  }

  function closeIx(pda: Address, vault: Address, signer: any): any {
    const data = coder.instruction.encode("close_project", {});
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.WRITABLE },
        { address: vault, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data,
    };
  }

  it("rejects close_project from a non-creator signer", async () => {
    const { pda, vault } = await createOpenProject(creator, "pact-close-1");
    const attacker = await generateKeyPairSigner();
    svm.airdrop(attacker.address, lamports(10n * 1_000_000_000n));

    await expectFailure(closeIx(pda, vault, attacker), attacker, "Unauthorized");
  });

  it("closes an open project: creator recovers rent, vault is closed too", async () => {
    const { pda, vault } = await createOpenProject(creator, "pact-close-2");

    const creatorBefore = BigInt(svm.getAccount(creator.address)!.lamports);
    const projectRent = BigInt(svm.getAccount(pda)!.lamports);

    await sendIx(closeIx(pda, vault, creator), creator);

    // Project account must be gone (or zeroed by Anchor close)
    const projectAcc = svm.getAccount(pda);
    const projectGone =
      !projectAcc ||
      ("exists" in projectAcc && !(projectAcc as any).exists) ||
      BigInt(projectAcc.lamports) === 0n;
    expect(projectGone).to.be.true;

    // Vault drained and closed (0 lamports, owned by system or gone)
    const vaultAcc = svm.getAccount(vault);
    if (vaultAcc && !("exists" in vaultAcc && !(vaultAcc as any).exists)) {
      expect(BigInt(vaultAcc.lamports)).to.equal(0n);
    }

    // Creator recovered the project rent (minus tiny tx fee)
    const creatorAfter = BigInt(svm.getAccount(creator.address)!.lamports);
    expect(creatorAfter - creatorBefore >= projectRent - 10000n).to.be.true;
  });

  it("dust attack is harmless: closing a dusted vault refunds creator instead of blocking", async () => {
    const { pda, vault } = await createOpenProject(creator, "pact-close-3");

    // Attacker sends 1 lamport of dust to the vault (would have blocked V1)
    svm.airdrop(vault, lamports(1n));

    const creatorBefore = BigInt(svm.getAccount(creator.address)!.lamports);

    // Close must succeed despite the dust
    await sendIx(closeIx(pda, vault, creator), creator);

    const projectAcc = svm.getAccount(pda);
    const projectGone =
      !projectAcc ||
      ("exists" in projectAcc && !(projectAcc as any).exists) ||
      BigInt(projectAcc.lamports) === 0n;
    expect(projectGone).to.be.true;

    // Creator got project rent + the dust back (attacker lost his lamport, lol)
    const creatorAfter = BigInt(svm.getAccount(creator.address)!.lamports);
    expect(creatorAfter > creatorBefore).to.be.true;
  });

  // ── Audit finding #2 (Noah AI, 24/08): "Locked Funds Due to Inability to
  //    Close Finalized Projects". Two mirrored tests below prove the fix is
  //    safe: a finalized pact that still holds real funds CANNOT be closed,
  //    while a finalized pact whose vault has been distributed CAN.

  async function createFinalizedProject(creatorSigner: any, id: string) {
    const member = await generateKeyPairSigner();
    svm.airdrop(member.address, lamports(10n * 1_000_000_000n));

    const [pda] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        new TextEncoder().encode("project"),
        addressCodec.encode(creatorSigner.address),
        new TextEncoder().encode(id),
      ],
    });
    const [vault] = await getProgramDerivedAddress({
      programAddress,
      seeds: [new TextEncoder().encode("vault"), addressCodec.encode(pda)],
    });

    const createData = coder.instruction.encode("create_project", {
      project_id: id,
      title: "Finalized",
      description: "Finalized pact used for close_project checks",
      creator_role: "Lead",
      creator_share_bps: 5000,
      protocol_wallet: new anchor.web3.PublicKey(PROTOCOL_WALLET),
    });
    await sendIx(
      {
        programAddress,
        accounts: [
          { address: pda, role: AccountRole.WRITABLE },
          {
            address: creatorSigner.address,
            role: AccountRole.WRITABLE_SIGNER,
            signer: creatorSigner,
          },
          { address: systemProgramAddress, role: AccountRole.READONLY },
        ],
        data: createData,
      } as any,
      creatorSigner
    );

    const addData = coder.instruction.encode("add_member", {
      wallet: new anchor.web3.PublicKey(member.address),
      role: "Builder",
      share_bps: 5000,
    });
    await sendIx(
      {
        programAddress,
        accounts: [
          { address: pda, role: AccountRole.WRITABLE },
          {
            address: creatorSigner.address,
            role: AccountRole.READONLY_SIGNER,
            signer: creatorSigner,
          },
        ],
        data: addData,
      } as any,
      creatorSigner
    );

    const approveData = coder.instruction.encode("approve", {});
    await sendIx(
      {
        programAddress,
        accounts: [
          { address: pda, role: AccountRole.WRITABLE },
          { address: member.address, role: AccountRole.READONLY_SIGNER, signer: member },
        ],
        data: approveData,
      } as any,
      member
    );

    const finalizeData = coder.instruction.encode("finalize", {});
    await sendIx(
      {
        programAddress,
        accounts: [
          { address: pda, role: AccountRole.WRITABLE },
          {
            address: creatorSigner.address,
            role: AccountRole.READONLY_SIGNER,
            signer: creatorSigner,
          },
        ],
        data: finalizeData,
      } as any,
      creatorSigner
    );

    return { pda, vault, member };
  }

  it("rejects close_project on a finalized pact whose vault still holds funds", async () => {
    const closeCreator = await generateKeyPairSigner();
    svm.airdrop(closeCreator.address, lamports(50n * 1_000_000_000n));

    const { pda, vault } = await createFinalizedProject(closeCreator, "pact-close-4");

    const fundData = coder.instruction.encode("fund", {
      amount_lamports: new BN(5_000_000_000),
    });
    await sendIx(
      {
        programAddress,
        accounts: [
          { address: pda, role: AccountRole.READONLY },
          { address: vault, role: AccountRole.WRITABLE },
          { address: funder.address, role: AccountRole.WRITABLE_SIGNER, signer: funder },
          { address: systemProgramAddress, role: AccountRole.READONLY },
        ],
        data: fundData,
      } as any,
      funder
    );

    // The founder must NOT be able to close and siphon an undistributed vault
    await expectFailure(closeIx(pda, vault, closeCreator), closeCreator, "VaultNotEmpty");
  });

  it("closes the distributed pact: creator recovers rent instead of locking it forever", async () => {
    // pact-1 was funded and distributed earlier, so its vault only holds
    // rent + rounding dust — closing it must now succeed (audit finding #2).
    const creatorBefore = BigInt(svm.getAccount(creator.address)!.lamports);
    const projectRent = BigInt(svm.getAccount(projectPDA)!.lamports);

    await sendIx(closeIx(projectPDA, vaultPDA, creator), creator);

    const projectAcc = svm.getAccount(projectPDA);
    const projectGone =
      !projectAcc ||
      ("exists" in projectAcc && !(projectAcc as any).exists) ||
      BigInt(projectAcc.lamports) === 0n;
    expect(projectGone).to.be.true;

    const creatorAfter = BigInt(svm.getAccount(creator.address)!.lamports);
    expect(creatorAfter - creatorBefore >= projectRent - 10000n).to.be.true;
  });

  // ═══════════════════════════════════════════════════════════════
  //  SHARE BOUNDS — prove share_bps can never exceed 100%
  //
  //  The cap table displayed by the frontend is only trustworthy if the
  //  program guarantees the shares it stores are bounded. These tests pin
  //  every rejection path so the guarantee is executable, not just claimed.
  // ═══════════════════════════════════════════════════════════════

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

  function createProjectIx(pda: Address, signer: any, id: string, shareBps: number): any {
    return {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.WRITABLE },
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
        { address: systemProgramAddress, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("create_project", {
        project_id: id,
        title: "Bounds",
        description: "Share bound verification pact",
        creator_role: "Lead",
        creator_share_bps: shareBps,
        protocol_wallet: new anchor.web3.PublicKey(PROTOCOL_WALLET),
      }),
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

  async function openProjectWithShare(id: string, creatorShareBps: number) {
    const c = await freshSigner();
    const { pda, vault } = await pdasFor(c.address, id);
    await sendIx(createProjectIx(pda, c, id, creatorShareBps), c);
    return { creator: c, pda, vault };
  }

  it("rejects create_project when creator_share_bps exceeds 100%", async () => {
    const c = await freshSigner();
    const id = "bound-create";
    const { pda } = await pdasFor(c.address, id);

    // 10001 bps = 100.01% — must be refused at creation, not silently stored
    await expectFailure(createProjectIx(pda, c, id, 10001), c, "ShareExceeded");
  });

  it("rejects add_member when the running total would exceed 100%", async () => {
    const { creator: c, pda } = await openProjectWithShare("bound-total", 7000);
    const m = await freshSigner(1n);

    // 7000 + 4000 = 11000 bps — the cumulative check must reject it
    await expectFailure(addMemberIx(pda, c, m.address, "Dev", 4000), c, "ShareExceeded");

    // and the member list must be untouched after the rejection
    const project = fetchAccount<any>("Project", pda);
    expect(project.members.length).to.equal(1);
    expect(Number(project.members[0].share_bps)).to.equal(7000);
  });

  it("accepts add_member that lands exactly on 100% but rejects one more lamport of share", async () => {
    const { creator: c, pda } = await openProjectWithShare("bound-exact", 6000);
    const m1 = await freshSigner(1n);
    const m2 = await freshSigner(1n);

    // 6000 + 4000 = exactly 10000 — allowed
    await sendIx(addMemberIx(pda, c, m1.address, "Dev", 4000), c);

    // any further share, even 1 bps, breaks the invariant
    await expectFailure(addMemberIx(pda, c, m2.address, "Extra", 1), c, "ShareExceeded");

    const project = fetchAccount<any>("Project", pda);
    const total = project.members.reduce(
      (acc: number, m: any) => acc + Number(m.share_bps),
      0
    );
    expect(total).to.equal(10000);
  });

  it("rejects finalize when shares do not sum to exactly 100%", async () => {
    const { creator: c, pda } = await openProjectWithShare("bound-partial", 5000);
    const m = await freshSigner();

    await sendIx(addMemberIx(pda, c, m.address, "Dev", 3000), c);
    await sendIx(approveIx(pda, m), m);

    // everyone approved, but 5000 + 3000 = 8000 bps — the pact must stay open
    await expectFailure(finalizeIx(pda, c), c, "SharesNotComplete");

    const project = fetchAccount<any>("Project", pda);
    expect(project.status).to.deep.equal({ Open: {} });
  });

  it("rejects finalize while a member has not approved", async () => {
    const { creator: c, pda } = await openProjectWithShare("bound-approve", 5000);
    const m = await freshSigner();

    // shares sum to 100% but the member never approved
    await sendIx(addMemberIx(pda, c, m.address, "Dev", 5000), c);

    await expectFailure(finalizeIx(pda, c), c, "NotAllApproved");
  });

  it("rejects a duplicate member wallet", async () => {
    const { creator: c, pda } = await openProjectWithShare("bound-dup", 5000);
    const m = await freshSigner(1n);

    await sendIx(addMemberIx(pda, c, m.address, "Dev", 2000), c);

    // same wallet twice would let it collect its share twice at distribute
    await expectFailure(addMemberIx(pda, c, m.address, "Dev2", 1000), c, "DuplicateMember");
  });

  it("rejects a 9th member (cap table is capped at 8)", async () => {
    const { creator: c, pda } = await openProjectWithShare("bound-cap", 3000);

    // creator + 7 members = 8, the on-chain maximum
    for (let i = 0; i < 7; i++) {
      const m = await freshSigner(1n);
      await sendIx(addMemberIx(pda, c, m.address, `Role${i}`, 1000), c);
    }

    const project = fetchAccount<any>("Project", pda);
    expect(project.members.length).to.equal(8);

    const extra = await freshSigner(1n);
    await expectFailure(addMemberIx(pda, c, extra.address, "Extra", 1), c, "TooManyMembers");
  });

  it("rejects approve from a wallet that is not a member", async () => {
    const { creator: c, pda } = await openProjectWithShare("bound-notmember", 5000);
    const m = await freshSigner(1n);
    await sendIx(addMemberIx(pda, c, m.address, "Dev", 5000), c);

    const outsider = await freshSigner();
    await expectFailure(approveIx(pda, outsider), outsider, "NotAMember");
  });

  it("rejects add_member on an already finalized pact (shares are locked)", async () => {
    const fc = await freshSigner();
    const { pda } = await createFinalizedProject(fc, "bound-locked");

    const late = await freshSigner(1n);
    await expectFailure(addMemberIx(pda, fc, late.address, "Late", 0), fc, "AlreadyFinalized");
  });

  it("rejects distribute when a payout account does not match the on-chain member", async () => {
    const dc = await freshSigner();
    const { pda, vault, member } = await createFinalizedProject(dc, "bound-payout");

    await sendIx(
      {
        programAddress,
        accounts: [
          { address: pda, role: AccountRole.READONLY },
          { address: vault, role: AccountRole.WRITABLE },
          { address: funder.address, role: AccountRole.WRITABLE_SIGNER, signer: funder },
          { address: systemProgramAddress, role: AccountRole.READONLY },
        ],
        data: coder.instruction.encode("fund", {
          amount_lamports: new BN(2_000_000_000),
        }),
      } as any,
      funder
    );

    const attacker = await freshSigner(1n);
    const distributeData = coder.instruction.encode("distribute", {});

    // Swapping a member wallet for the attacker's must be refused: the payout
    // targets are pinned to project.members, not chosen by the caller.
    const hijackIx: any = {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.READONLY },
        { address: vault, role: AccountRole.WRITABLE },
        { address: PROTOCOL_WALLET, role: AccountRole.WRITABLE },
        { address: funder.address, role: AccountRole.READONLY_SIGNER, signer: funder },
        { address: systemProgramAddress, role: AccountRole.READONLY },
        { address: dc.address, role: AccountRole.WRITABLE },
        { address: attacker.address, role: AccountRole.WRITABLE },
      ],
      data: distributeData,
    };
    await expectFailure(hijackIx, funder, "MemberMismatch");

    // Truncating the payout list must be refused too
    const truncatedIx: any = {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.READONLY },
        { address: vault, role: AccountRole.WRITABLE },
        { address: PROTOCOL_WALLET, role: AccountRole.WRITABLE },
        { address: funder.address, role: AccountRole.READONLY_SIGNER, signer: funder },
        { address: systemProgramAddress, role: AccountRole.READONLY },
        { address: dc.address, role: AccountRole.WRITABLE },
      ],
      data: distributeData,
    };
    await expectFailure(truncatedIx, funder, "MemberMismatch");

    // The real member list still distributes correctly
    const memberBefore = BigInt(svm.getAccount(member.address)!.lamports);
    const goodIx: any = {
      programAddress,
      accounts: [
        { address: pda, role: AccountRole.READONLY },
        { address: vault, role: AccountRole.WRITABLE },
        { address: PROTOCOL_WALLET, role: AccountRole.WRITABLE },
        { address: funder.address, role: AccountRole.READONLY_SIGNER, signer: funder },
        { address: systemProgramAddress, role: AccountRole.READONLY },
        { address: dc.address, role: AccountRole.WRITABLE },
        { address: member.address, role: AccountRole.WRITABLE },
      ],
      data: distributeData,
    };
    await sendIx(goodIx, funder);

    const memberAfter = BigInt(svm.getAccount(member.address)!.lamports);
    expect(memberAfter > memberBefore).to.be.true;
  });

  // ═══════════════════════════════════════════════════════════════
  //  PACT SOLO — la règle « au moins 2 membres » et sa porte de sortie
  //
  //  Ajouté le 27/08 après vérification directe de lib.rs.
  //
  //  Contexte : `finalize` exige members.len() >= 2 (NotEnoughMembers,
  //  l.275 de lib.rs) alors que `create_project` accepte 10000 bps pour le
  //  seul créateur. On pouvait croire à une impasse — un pact créé, du rent
  //  prélevé, et plus aucun moyen d'avancer puisque les 100% sont déjà pris.
  //
  //  Ce n'en est pas une : `add_member` autorise share_bps = 0. Le total
  //  reste à 10000, le second membre approuve, et finalize passe.
  //
  //  Ces deux tests épinglent le comportement exact pour que personne ne
  //  « corrige » create_project en croyant réparer un bug inexistant — un
  //  tel changement casserait la configuration légitime fondateur 100% /
  //  advisor 0%.
  // ═══════════════════════════════════════════════════════════════

  it("refuse de finaliser un pact à un seul membre, même à 100% des parts", async () => {
    const { creator: c, pda } = await openProjectWithShare("solo-block", 10000);

    const project = fetchAccount<any>("Project", pda);
    expect(project.members.length).to.equal(1);
    expect(Number(project.members[0].share_bps)).to.equal(10000);
    expect(project.members[0].approved).to.be.true;

    // Les parts totalisent bien 100% et l'unique membre a approuvé : la seule
    // chose qui manque est un second signataire. Un pact est un accord, pas
    // un compte de retrait.
    await expectFailure(finalizeIx(pda, c), c, "NotEnoughMembers");

    expect(fetchAccount<any>("Project", pda).status).to.deep.equal({ Open: {} });
  });

  it("un pact à 100% pour le créateur reste finalisable via un second membre à 0 bps", async () => {
    // LA porte de sortie. Sans ce test, un futur contributeur pourrait ajouter
    // `require!(creator_share_bps < TOTAL_BPS)` dans create_project en croyant
    // débloquer les utilisateurs — et interdirait du même coup le montage
    // parfaitement légitime « fondateur 100%, advisor 0% ».
    const { creator: c, pda } = await openProjectWithShare("solo-escape", 10000);
    const advisor = await freshSigner(1n);

    // 10000 + 0 = 10000 : la borne cumulative est respectée.
    await sendIx(addMemberIx(pda, c, advisor.address, "Advisor", 0), c);
    await sendIx(approveIx(pda, advisor), advisor);
    await sendIx(finalizeIx(pda, c), c);

    const project = fetchAccount<any>("Project", pda);
    expect(project.status).to.deep.equal({ Finalized: {} });
    expect(project.members.length).to.equal(2);
    expect(Number(project.members[1].share_bps)).to.equal(0);
  });

  it("un pact solo non finalisé se ferme proprement : le rent revient au créateur", async () => {
    // Seconde sortie : abandonner. Le vault est nécessairement vide puisque
    // `fund` exige Finalized — il n'y a donc aucun fonds bloqué, seulement du
    // rent, et close_project le restitue.
    const { creator: c, pda, vault } = await openProjectWithShare("solo-close", 10000);

    const before = BigInt(svm.getAccount(c.address)!.lamports);
    const rent = BigInt(svm.getAccount(pda)!.lamports);

    await sendIx(closeIx(pda, vault, c), c);

    const acc = svm.getAccount(pda);
    const gone =
      !acc || ("exists" in acc && !(acc as any).exists) || BigInt(acc.lamports) === 0n;
    expect(gone).to.be.true;

    expect(BigInt(svm.getAccount(c.address)!.lamports) - before >= rent - 10000n).to.be
      .true;
  });
});
