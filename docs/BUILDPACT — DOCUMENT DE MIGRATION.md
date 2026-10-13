BUILDPACT — DOCUMENT DE MIGRATION
1. Program ID + réseau
Program ID : 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ
Réseau     : devnet
Cluster    : https://api.devnet.solana.com
Anchor.toml: [programs.localnet] workspace = "9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ"
             [provider] cluster = "devnet", wallet = "~/.config/solana/id.json"

Protocol wallet (verrouillé on-chain) : AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH
Protocol fee : 200 bps (2%)
Anchor : 0.31.1 · Crate : workspace · Version : 0.1.0
2. programs/workspace/src/lib.rs — contenu complet et actuel
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ");

pub const PROTOCOL_FEE_BPS: u16 = 200; // 2%
pub const TOTAL_BPS: u16 = 10000;

// Wallet protocole verrouillé on-chain — doit être identique à PLATFORM_WALLET
// dans frontend/src/components/CreatePactWizard.tsx. Avant ce fix, create_project
// acceptait n'importe quel protocol_wallet fourni par l'appelant : le frontend
// officiel envoyait toujours la bonne valeur, mais un appel direct au programme
// (script, autre front) pouvait détourner les 2% de frais vers un autre wallet.
pub const PROTOCOL_WALLET: Pubkey = pubkey!("AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH");

pub const MAX_PROJECT_ID_LEN: usize = 20;
pub const MAX_TITLE_LEN: usize = 40;
pub const MAX_DESC_LEN: usize = 280;
pub const MAX_ROLE_LEN: usize = 24;
pub const MAX_MEMBERS: usize = 8;

// Trouvaille #2 audit Noah AI (24/08) : "Locked Funds Due to Inability to
// Close Finalized Projects" — tolérance de poussière d'arrondi (bien en
// dessous de tout montant réel) sous laquelle un pact finalisé est considéré
// comme entièrement distribué et peut être fermé pour récupérer le loyer.
pub const DUST_TOLERANCE_LAMPORTS: u64 = 1000; // 0.000001 SOL

#[program]
pub mod workspace {
    use super::*;

    pub fn create_project(
        ctx: Context<CreateProject>,
        project_id: String,
        title: String,
        description: String,
        creator_role: String,
        creator_share_bps: u16,
        protocol_wallet: Pubkey,
    ) -> Result<()> {
        require!(project_id.len() <= MAX_PROJECT_ID_LEN, ErrorCode::InvalidParameter);
        require!(title.len() <= MAX_TITLE_LEN, ErrorCode::InvalidParameter);
        require!(description.len() <= MAX_DESC_LEN, ErrorCode::InvalidParameter);
        require!(creator_role.len() <= MAX_ROLE_LEN, ErrorCode::InvalidParameter);
        require!(creator_share_bps <= TOTAL_BPS, ErrorCode::ShareExceeded);
        require!(protocol_wallet == PROTOCOL_WALLET, ErrorCode::InvalidProtocolWallet);

        let creator_key = ctx.accounts.creator.key();

        let project = &mut ctx.accounts.project;
        project.bump = ctx.bumps.project;
        project.creator = creator_key;
        project.project_id = project_id;
        project.title = title;
        project.description = description;
        project.protocol_wallet = protocol_wallet;
        project.status = ProjectStatus::Open;
        project.members = vec![Member {
            wallet: creator_key,
            role: creator_role,
            share_bps: creator_share_bps,
            approved: true,
        }];

        emit!(ProjectCreated {
            project: project.key(),
            creator: creator_key,
            title: project.title.clone(),
        });

        Ok(())
    }

    pub fn add_member(
        ctx: Context<AddMember>,
        wallet: Pubkey,
        role: String,
        share_bps: u16,
    ) -> Result<()> {
        require!(role.len() <= MAX_ROLE_LEN, ErrorCode::InvalidParameter);
        require!(share_bps <= TOTAL_BPS, ErrorCode::ShareExceeded);

        let project = &mut ctx.accounts.project;
        require!(project.status == ProjectStatus::Open, ErrorCode::AlreadyFinalized);
        require!(project.members.len() < MAX_MEMBERS, ErrorCode::TooManyMembers);
        require!(
            !project.members.iter().any(|m| m.wallet == wallet),
            ErrorCode::DuplicateMember
        );

        let current_total: u128 = project
            .members
            .iter()
            .try_fold(0u128, |acc, m| acc.checked_add(m.share_bps as u128))
            .ok_or(ErrorCode::MathOverflow)?;
        let new_total = current_total
            .checked_add(share_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(new_total <= TOTAL_BPS as u128, ErrorCode::ShareExceeded);

        project.members.push(Member {
            wallet,
            role,
            share_bps,
            approved: false,
        });

        emit!(MemberAdded {
            project: project.key(),
            wallet,
            share_bps,
        });

        Ok(())
    }

    pub fn remove_member(ctx: Context<RemoveMember>, member_wallet: Pubkey) -> Result<()> {
        let project = &mut ctx.accounts.project;
        require!(project.status == ProjectStatus::Open, ErrorCode::AlreadyFinalized);
        require!(member_wallet != project.creator, ErrorCode::CannotRemoveCreator);

        let index = project
            .members
            .iter()
            .position(|m| m.wallet == member_wallet)
            .ok_or(ErrorCode::MemberNotFound)?;

        require!(!project.members[index].approved, ErrorCode::MemberAlreadyApproved);

        project.members.remove(index);

        emit!(MemberRemoved {
            project: project.key(),
            wallet: member_wallet,
        });

        Ok(())
    }

    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        let member_key = ctx.accounts.member.key();
        let project = &mut ctx.accounts.project;
        require!(project.status == ProjectStatus::Open, ErrorCode::AlreadyFinalized);

        let member = project
            .members
            .iter_mut()
            .find(|m| m.wallet == member_key)
            .ok_or(ErrorCode::NotAMember)?;
        require!(!member.approved, ErrorCode::AlreadyApproved);
        member.approved = true;

        emit!(MemberApproved {
            project: project.key(),
            wallet: member_key,
        });

        Ok(())
    }

    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        let project = &mut ctx.accounts.project;
        require!(project.status == ProjectStatus::Open, ErrorCode::AlreadyFinalized);
        require!(project.members.len() >= 2, ErrorCode::NotEnoughMembers);
        require!(
            project.members.iter().all(|m| m.approved),
            ErrorCode::NotAllApproved
        );

        let total: u128 = project
            .members
            .iter()
            .try_fold(0u128, |acc, m| acc.checked_add(m.share_bps as u128))
            .ok_or(ErrorCode::MathOverflow)?;
        require!(total == TOTAL_BPS as u128, ErrorCode::SharesNotComplete);

        project.status = ProjectStatus::Finalized;

        emit!(ProjectFinalized {
            project: project.key(),
        });

        Ok(())
    }

    pub fn fund(ctx: Context<Fund>, amount_lamports: u64) -> Result<()> {
        require!(
            ctx.accounts.project.status == ProjectStatus::Finalized,
            ErrorCode::NotFinalized
        );
        require!(amount_lamports > 0, ErrorCode::InvalidAmount);

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.funder.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount_lamports,
        )?;

        emit!(ProjectFunded {
            project: ctx.accounts.project.key(),
            amount_lamports,
        });

        Ok(())
    }

    pub fn distribute<'info>(
        ctx: Context<'_, '_, '_, 'info, Distribute<'info>>,
    ) -> Result<()> {
        let project = &ctx.accounts.project;
        require!(project.status == ProjectStatus::Finalized, ErrorCode::NotFinalized);
        let members = project.members.clone();
        require!(
            ctx.remaining_accounts.len() == members.len(),
            ErrorCode::MemberMismatch
        );
        let project_key = ctx.accounts.project.key();
        let vault_bump = ctx.bumps.vault;

        let rent_min = Rent::get()?.minimum_balance(0);
        let vault_balance = ctx.accounts.vault.lamports();
        let available = vault_balance
            .checked_sub(rent_min)
            .ok_or(ErrorCode::InsufficientFunds)?;
        require!(available > 0, ErrorCode::DistributionEmpty);

        let fee: u64 = (available as u128)
            .checked_mul(PROTOCOL_FEE_BPS as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(TOTAL_BPS as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .try_into()
            .map_err(|_| ErrorCode::MathOverflow)?;

        let after_fee = available.checked_sub(fee).ok_or(ErrorCode::MathOverflow)?;

        let mut member_amounts: Vec<u64> = Vec::with_capacity(members.len());
        let mut total_transferred: u64 = 0;
        for m in members.iter() {
            let amt: u64 = (after_fee as u128)
                .checked_mul(m.share_bps as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(TOTAL_BPS as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .try_into()
                .map_err(|_| ErrorCode::MathOverflow)?;
            total_transferred = total_transferred
                .checked_add(amt)
                .ok_or(ErrorCode::MathOverflow)?;
            member_amounts.push(amt);
        }

        let bump_arr = [vault_bump];
        let seeds: &[&[u8]] = &[b"vault", project_key.as_ref(), &bump_arr];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        if fee > 0 {
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.protocol_wallet.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee,
            )?;
        }

        for (i, member) in members.iter().enumerate() {
            let target = &ctx.remaining_accounts[i];
            require!(target.key() == member.wallet, ErrorCode::MemberMismatch);
            let amt = member_amounts[i];
            if amt > 0 {
                transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: target.clone(),
                        },
                        signer_seeds,
                    ),
                    amt,
                )?;
            }
        }

        // Trouvaille #4 audit Noah AI (26/08) : "Inaccurate Event Emission in
        // distribute" — l'événement reportait after_fee, alors que la division
        // entière des parts laisse quelques lamports de poussière dans le vault.
        // On loggue maintenant la somme exacte des montants réellement virés.
        emit!(FundsDistributed {
            project: project_key,
            fee_lamports: fee,
            total_distributed_lamports: total_transferred,
        });

        Ok(())
    }

    pub fn close_project(ctx: Context<CloseProject>) -> Result<()> {
        let vault_lamports = ctx.accounts.vault.lamports();

        // Trouvaille #2 audit Noah AI (24/08) : "Locked Funds Due to
        // Inability to Close Finalized Projects" — avant ce fix, un pact
        // finalisé ne pouvait JAMAIS être fermé, gelant loyer + poussière
        // d'arrondi pour toujours. On autorise maintenant la fermeture
        // UNIQUEMENT si le vault ne contient plus que de la poussière
        // (DUST_TOLERANCE_LAMPORTS, très en dessous de tout montant réel).
        //
        // Trouvaille #1 audit Noah AI (26/08) : "Unprotected Vault Closure for
        // Open Projects" — ce contrôle était auparavant enfermé dans un
        // `if status == Finalized`. Un transfert SOL natif direct vers le PDA
        // vault d'un pact encore Open contournait donc entièrement la
        // vérification, permettant au créateur de balayer ces fonds via
        // close_project. Le seuil s'applique désormais à tous les états : un
        // vault contenant autre chose que de la poussière bloque la fermeture,
        // quel que soit le statut du pact.
        let rent_min = Rent::get()?.minimum_balance(0);
        let threshold = rent_min
            .checked_add(DUST_TOLERANCE_LAMPORTS)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(vault_lamports <= threshold, ErrorCode::VaultNotEmpty);

        if vault_lamports > 0 {
            let project_key = ctx.accounts.project.key();
            let bump_arr = [ctx.bumps.vault];
            let seeds: &[&[u8]] = &[b"vault", project_key.as_ref(), &bump_arr];
            let signer_seeds: &[&[&[u8]]] = &[seeds];

            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.creator.to_account_info(),
                    },
                    signer_seeds,
                ),
                vault_lamports,
            )?;
        }

        emit!(ProjectClosed {
            project: ctx.accounts.project.key(),
        });

        Ok(())
    }
}

// Trouvaille #1 audit Noah AI (24/08) : "Unused Global Configuration and Dead
// Code" — le compte Config (initialize_config) était créé mais jamais lu par
// aucune instruction (create_project/distribute utilisaient déjà les
// constantes codées en dur ci-dessus). Supprimé plutôt que branché : les
// constantes sont volontairement immuables pour ce hackathon, dynamiser la
// config est hors scope V1. Anciens comptes Config déjà créés on-chain
// (5yRNQhn7W6sCFNVWhTWbZowQRKL7dNSaqYkpTtPxEF2C) restent orphelins mais
// inoffensifs — plus aucune instruction n'y fait référence.

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProjectStatus {
    Open,
    Finalized,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Member {
    pub wallet: Pubkey,
    pub role: String,
    pub share_bps: u16,
    pub approved: bool,
}

impl Member {
    pub const LEN: usize = 32 + (4 + MAX_ROLE_LEN) + 2 + 1;
}

#[account]
pub struct Project {
    pub creator: Pubkey,
    pub project_id: String,
    pub title: String,
    pub description: String,
    pub members: Vec<Member>,
    pub status: ProjectStatus,
    pub protocol_wallet: Pubkey,
    pub bump: u8,
}

impl Project {
    pub const LEN: usize = 32
        + (4 + MAX_PROJECT_ID_LEN)
        + (4 + MAX_TITLE_LEN)
        + (4 + MAX_DESC_LEN)
        + 4
        + (Member::LEN * MAX_MEMBERS)
        + 1
        + 32
        + 1;
}

#[derive(Accounts)]
#[instruction(project_id: String)]
pub struct CreateProject<'info> {
    #[account(
        init,
        seeds = [b"project", creator.key().as_ref(), project_id.as_bytes()],
        bump,
        payer = creator,
        space = 8 + Project::LEN
    )]
    pub project: Account<'info, Project>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddMember<'info> {
    #[account(
        mut,
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
        has_one = creator @ ErrorCode::Unauthorized,
    )]
    pub project: Account<'info, Project>,

    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct RemoveMember<'info> {
    #[account(
        mut,
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
        has_one = creator @ ErrorCode::Unauthorized,
    )]
    pub project: Account<'info, Project>,

    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct Approve<'info> {
    #[account(
        mut,
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
    )]
    pub project: Account<'info, Project>,

    pub member: Signer<'info>,
}

#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(
        mut,
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
        has_one = creator @ ErrorCode::Unauthorized,
    )]
    pub project: Account<'info, Project>,

    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
    )]
    pub project: Account<'info, Project>,

    #[account(
        mut,
        seeds = [b"vault", project.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub funder: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
    )]
    pub project: Account<'info, Project>,

    #[account(
        mut,
        seeds = [b"vault", project.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: validated against project.protocol_wallet via the address constraint
    #[account(mut, address = project.protocol_wallet @ ErrorCode::InvalidParameter)]
    pub protocol_wallet: UncheckedAccount<'info>,

    pub caller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseProject<'info> {
    #[account(
        mut,
        close = creator,
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
        has_one = creator @ ErrorCode::Unauthorized,
    )]
    pub project: Account<'info, Project>,

    #[account(
        mut,
        seeds = [b"vault", project.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// Trouvaille #4 audit Noah AI (24/08) : "Missing On-Chain Event Emissions" —
// événements pour chaque changement d'état important, pour permettre à un
// indexeur/frontend de s'abonner au lieu de parser les logs ou poller les
// comptes en continu.
#[event]
pub struct ProjectCreated {
    pub project: Pubkey,
    pub creator: Pubkey,
    pub title: String,
}

#[event]
pub struct MemberAdded {
    pub project: Pubkey,
    pub wallet: Pubkey,
    pub share_bps: u16,
}

#[event]
pub struct MemberRemoved {
    pub project: Pubkey,
    pub wallet: Pubkey,
}

#[event]
pub struct MemberApproved {
    pub project: Pubkey,
    pub wallet: Pubkey,
}

#[event]
pub struct ProjectFinalized {
    pub project: Pubkey,
}

#[event]
pub struct ProjectFunded {
    pub project: Pubkey,
    pub amount_lamports: u64,
}

#[event]
pub struct FundsDistributed {
    pub project: Pubkey,
    pub fee_lamports: u64,
    pub total_distributed_lamports: u64,
}

#[event]
pub struct ProjectClosed {
    pub project: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow occurred")]
    MathOverflow,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Account is inactive")]
    InactiveAccount,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Too many members")]
    TooManyMembers,
    #[msg("Duplicate member wallet")]
    DuplicateMember,
    #[msg("Total share exceeds 100%")]
    ShareExceeded,
    #[msg("Signer is not a project member")]
    NotAMember,
    #[msg("Member has already approved")]
    AlreadyApproved,
    #[msg("Project needs at least two members")]
    NotEnoughMembers,
    #[msg("Not all members have approved")]
    NotAllApproved,
    #[msg("Total shares must equal exactly 100%")]
    SharesNotComplete,
    #[msg("Project is already finalized")]
    AlreadyFinalized,
    #[msg("Project is not finalized")]
    NotFinalized,
    #[msg("Member account list does not match project members")]
    MemberMismatch,
    #[msg("Nothing available to distribute")]
    DistributionEmpty,
    #[msg("Cannot remove the project creator")]
    CannotRemoveCreator,
    #[msg("Member not found")]
    MemberNotFound,
    #[msg("Cannot remove a member who already approved")]
    MemberAlreadyApproved,
    #[msg("protocol_wallet must match the locked BuildPact protocol wallet")]
    InvalidProtocolWallet,
    #[msg("A finalized project can only be closed once its vault is fully distributed")]
    VaultNotEmpty,
}
3. Seeds de PDA
Config — n'existe plus. Le compte Config et l'instruction initialize_config ont été supprimés (trouvaille #1, audit 24/08 : dead code). Aucune instruction n'y fait référence. Anciens comptes orphelins on-chain : 5yRNQhn7W6sCFNVWhTWbZowQRKL7dNSaqYkpTtPxEF2C.

Project PDA
seeds = [b"project", creator.key().as_ref(), project_id.as_bytes()]
#	Seed	Type	Détail
0	"project"	const ASCII	bytes [112,114,111,106,101,99,116]
1	creator	Pubkey	32 bytes, .as_ref() — à la création : creator.key() ; ensuite : project.creator
2	project_id	String	UTF-8 brut, sans préfixe de longueur, max 20 bytes
Owner : programme · Espace : 8 + Project::LEN · Bump stocké dans project.bump

TypeScript :

const [projectPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('project'), creator.toBuffer(), Buffer.from(projectId)],
  PROGRAM_ID
);
Vault PDA
seeds = [b"vault", project.key().as_ref()]
#	Seed	Type	Détail
0	"vault"	const ASCII	bytes [118,97,117,108,116]
1	project	Pubkey	32 bytes — adresse du Project PDA ci-dessus
Type : SystemAccount<'info> (compte SOL natif, pas de data) · Bump : non stocké, re-dérivé via ctx.bumps.vault à chaque instruction · Signe les CPI transfer sortants dans distribute et close_project.

TypeScript :

const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault'), projectPda.toBuffer()],
  PROGRAM_ID
);
Aucune dépendance circulaire : project ← (creator, project_id) ; vault ← project. Sens unique.

4. Commandes de rebuild + redéploiement à l'identique
# 0. Prérequis
solana --version          # 1.18.x ou +
anchor --version          # 0.31.1 (impératif : autre version = binaire différent)
solana config set --url devnet
solana balance            # prévoir ≥ 3 SOL pour un upgrade

# 1. Vérifier que l'ID du keypair correspond bien au Program ID
solana address -k target/deploy/workspace-keypair.json
# doit afficher exactement : 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ

# 2. Build
anchor build

# 3. Vérifier la cohérence du declare_id
anchor keys list
# workspace: 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ

# 4. Tests (LiteSVM) — 24 tests attendus au vert
anchor test --skip-deploy

# 5. Comparer l'IDL on-chain avec l'IDL local avant de déployer
anchor idl fetch 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ \
  --provider.cluster devnet -o /tmp/onchain-idl.json
diff /tmp/onchain-idl.json target/idl/workspace.json
# diff vide => rien à redéployer

# 6. Upgrade du programme (devnet)
solana program deploy target/deploy/workspace.so \
  --program-id target/deploy/workspace-keypair.json \
  --upgrade-authority ~/.config/solana/id.json \
  --url devnet

# 6bis. Si le déploiement échoue en cours de route (buffer orphelin)
solana program show --buffers --url devnet
solana program deploy target/deploy/workspace.so \
  --program-id target/deploy/workspace-keypair.json \
  --buffer <BUFFER_PUBKEY> \
  --upgrade-authority ~/.config/solana/id.json \
  --url devnet
solana program close <BUFFER_PUBKEY> --url devnet   # récupérer le loyer

# 7. Mettre à jour l'IDL on-chain
anchor idl upgrade 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ \
  -f target/idl/workspace.json --provider.cluster devnet
# (première publication uniquement : anchor idl init ...)

# 8. Propager l'IDL vers les 3 consommateurs
cp target/idl/workspace.json frontend/src/idl/buildpact.json
cp target/idl/workspace.json supabase/functions/vault/buildpact_idl.json
cp target/idl/workspace.json supabase/functions/open-roles/buildpact_idl.json

# 9. Vérifier le déploiement
solana program show 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ --url devnet

# 10. Contrôle avant push : le keypair ne doit JAMAIS être versionné
git ls-files target/deploy/     # doit être vide
Fichiers indispensables pour reproduire le déploiement à l'identique :

target/deploy/workspace-keypair.json (secret — hors git, sauvegarde chiffrée)

~/.config/solana/id.json = upgrade authority

Anchor.toml, Cargo.toml, Cargo.lock, programs/workspace/Cargo.toml, programs/workspace/Xargo.toml

5. IDL actuel — target/idl/workspace.json
{
  "address": "9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ",
  "metadata": {
    "name": "workspace",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "add_member",
      "discriminator": [13, 116, 123, 130, 126, 198, 57, 34],
      "accounts": [
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [112, 114, 111, 106, 101, 99, 116] },
              { "kind": "account", "path": "project.creator", "account": "Project" },
              { "kind": "account", "path": "project.project_id", "account": "Project" }
            ]
          }
        },
        { "name": "creator", "signer": true, "relations": ["project"] }
      ],
      "args": [
        { "name": "wallet", "type": "pubkey" },
        { "name": "role", "type": "string" },
        { "name": "share_bps", "type": "u16" }
      ]
    },
    {
      "name": "approve",
      "discriminator": [69, 74, 217, 36, 115, 117, 97, 76],
      "accounts": [
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [112, 114, 111, 106, 101, 99, 116] },
              { "kind": "account", "path": "project.creator", "account": "Project" },
              { "kind": "account", "path": "project.project_id", "account": "Project" }
            ]
          }
        },
        { "name": "member", "signer": true }
      ],
      "args": []
    },
    {
      "name": "close_project",
      "discriminator": [117, 209, 53, 106, 93, 55, 112, 49],
      "accounts": [
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [112, 114, 111, 106, 101, 99, 116] },
              { "kind": "account", "path": "project.creator", "account": "Project" },
              { "kind": "account", "path": "project.project_id", "account": "Project" }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [118, 97, 117, 108, 116] },
              { "kind": "account", "path": "project" }
            ]
          }
        },
        { "name": "creator", "writable": true, "signer": true, "relations": ["project"] },
        { "name": "system_program", "address": "11111111111111111111111111111111" }
      ],
      "args": []
    },
    {
      "name": "create_project",
      "discriminator": [148, 219, 181, 42, 221, 114, 145, 190],
      "accounts": [
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [112, 114, 111, 106, 101, 99, 116] },
              { "kind": "account", "path": "creator" },
              { "kind": "arg", "path": "project_id" }
            ]
          }
        },
        { "name": "creator", "writable": true, "signer": true },
        { "name": "system_program", "address": "11111111111111111111111111111111" }
      ],
      "args": [
        { "name": "project_id", "type": "string" },
        { "name": "title", "type": "string" },
        { "name": "description", "type": "string" },
        { "name": "creator_role", "type": "string" },
        { "name": "creator_share_bps", "type": "u16" },
        { "name": "protocol_wallet", "type": "pubkey" }
      ]
    },
    {
      "name": "distribute",
      "discriminator": [191, 44, 223, 207, 164, 236, 126, 61],
      "accounts": [
        {
          "name": "project",
          "pda": {
            "seeds": [
              { "kind": "const", "value": [112, 114, 111, 106, 101, 99, 116] },
              { "kind": "account", "path": "project.creator", "account": "Project" },
              { "kind": "account", "path": "project.project_id", "account": "Project" }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [118, 97, 117, 108, 116] },
              { "kind": "account", "path": "project" }
            ]
          }
        },
        { "name": "protocol_wallet", "writable": true },
        { "name": "caller", "signer": true },
        { "name": "system_program", "address": "11111111111111111111111111111111" }
      ],
      "args": []
    },
    {
      "name": "finalize",
      "discriminator": [171, 61, 218, 56, 127, 115, 12, 217],
      "accounts": [
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [112, 114, 111, 106, 101, 99, 116] },
              { "kind": "account", "path": "project.creator", "account": "Project" },
              { "kind": "account", "path": "project.project_id", "account": "Project" }
            ]
          }
        },
        { "name": "creator", "signer": true, "relations": ["project"] }
      ],
      "args": []
    },
    {
      "name": "fund",
      "discriminator": [218, 188, 111, 221, 152, 113, 174, 7],
      "accounts": [
        {
          "name": "project",
          "pda": {
            "seeds": [
              { "kind": "const", "value": [112, 114, 111, 106, 101, 99, 116] },
              { "kind": "account", "path": "project.creator", "account": "Project" },
              { "kind": "account", "path": "project.project_id", "account": "Project" }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [118, 97, 117, 108, 116] },
              { "kind": "account", "path": "project" }
            ]
          }
        },
        { "name": "funder", "writable": true, "signer": true },
        { "name": "system_program", "address": "11111111111111111111111111111111" }
      ],
      "args": [{ "name": "amount_lamports", "type": "u64" }]
    },
    {
      "name": "remove_member",
      "discriminator": [171, 57, 231, 150, 167, 128, 18, 55],
      "accounts": [
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [112, 114, 111, 106, 101, 99, 116] },
              { "kind": "account", "path": "project.creator", "account": "Project" },
              { "kind": "account", "path": "project.project_id", "account": "Project" }
            ]
          }
        },
        { "name": "creator", "signer": true, "relations": ["project"] }
      ],
      "args": [{ "name": "member_wallet", "type": "pubkey" }]
    }
  ],
  "accounts": [
    {
      "name": "Project",
      "discriminator": [205, 168, 189, 202, 181, 247, 142, 19]
    }
  ],
  "events": [
    { "name": "FundsDistributed", "discriminator": [246, 28, 47, 10, 202, 53, 3, 232] },
    { "name": "MemberAdded", "discriminator": [198, 220, 228, 196, 92, 235, 240, 79] },
    { "name": "MemberApproved", "discriminator": [174, 128, 113, 88, 4, 208, 86, 234] },
    { "name": "MemberRemoved", "discriminator": [250, 66, 3, 113, 161, 10, 59, 39] },
    { "name": "ProjectClosed", "discriminator": [99, 119, 201, 52, 106, 26, 76, 87] },
    { "name": "ProjectCreated", "discriminator": [192, 10, 163, 29, 185, 31, 67, 168] },
    { "name": "ProjectFinalized", "discriminator": [206, 140, 138, 3, 23, 210, 23, 204] },
    { "name": "ProjectFunded", "discriminator": [125, 81, 242, 91, 14, 66, 74, 95] }
  ],
  "errors": [
    { "code": 6000, "name": "MathOverflow", "msg": "Math overflow occurred" },
    { "code": 6001, "name": "InsufficientFunds", "msg": "Insufficient funds" },
    { "code": 6002, "name": "Unauthorized", "msg": "Unauthorized access" },
    { "code": 6003, "name": "InactiveAccount", "msg": "Account is inactive" },
    { "code": 6004, "name": "InvalidAmount", "msg": "Invalid amount" },
    { "code": 6005, "name": "InvalidParameter", "msg": "Invalid parameter" },
    { "code": 6006, "name": "TooManyMembers", "msg": "Too many members" },
    { "code": 6007, "name": "DuplicateMember", "msg": "Duplicate member wallet" },
    { "code": 6008, "name": "ShareExceeded", "msg": "Total share exceeds 100%" },
    { "code": 6009, "name": "NotAMember", "msg": "Signer is not a project member" },
    { "code": 6010, "name": "AlreadyApproved", "msg": "Member has already approved" },
    { "code": 6011, "name": "NotEnoughMembers", "msg": "Project needs at least two members" },
    { "code": 6012, "name": "NotAllApproved", "msg": "Not all members have approved" },
    { "code": 6013, "name": "SharesNotComplete", "msg": "Total shares must equal exactly 100%" },
    { "code": 6014, "name": "AlreadyFinalized", "msg": "Project is already finalized" },
    { "code": 6015, "name": "NotFinalized", "msg": "Project is not finalized" },
    { "code": 6016, "name": "MemberMismatch", "msg": "Member account list does not match project members" },
    { "code": 6017, "name": "DistributionEmpty", "msg": "Nothing available to distribute" },
    { "code": 6018, "name": "CannotRemoveCreator", "msg": "Cannot remove the project creator" },
    { "code": 6019, "name": "MemberNotFound", "msg": "Member not found" },
    { "code": 6020, "name": "MemberAlreadyApproved", "msg": "Cannot remove a member who already approved" },
    { "code": 6021, "name": "InvalidProtocolWallet", "msg": "protocol_wallet must match the locked BuildPact protocol wallet" },
    { "code": 6022, "name": "VaultNotEmpty", "msg": "A finalized project can only be closed once its vault is fully distributed" }
  ],
  "types": [
    {
      "name": "FundsDistributed",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "project", "type": "pubkey" },
          { "name": "fee_lamports", "type": "u64" },
          { "name": "total_distributed_lamports", "type": "u64" }
        ]
      }
    },
    {
      "name": "Member",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "wallet", "type": "pubkey" },
          { "name": "role", "type": "string" },
          { "name": "share_bps", "type": "u16" },
          { "name": "approved", "type": "bool" }
        ]
      }
    },
    {
      "name": "MemberAdded",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "project", "type": "pubkey" },
          { "name": "wallet", "type": "pubkey" },
          { "name": "share_bps", "type": "u16" }
        ]
      }
    },
    {
      "name": "MemberApproved",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "project", "type": "pubkey" },
          { "name": "wallet", "type": "pubkey" }
        ]
      }
    },
    {
      "name": "MemberRemoved",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "project", "type": "pubkey" },
          { "name": "wallet", "type": "pubkey" }
        ]
      }
    },
    {
      "name": "Project",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "creator", "type": "pubkey" },
          { "name": "project_id", "type": "string" },
          { "name": "title", "type": "string" },
          { "name": "description", "type": "string" },
          { "name": "members", "type": { "vec": { "defined": { "name": "Member" } } } },
          { "name": "status", "type": { "defined": { "name": "ProjectStatus" } } },
          { "name": "protocol_wallet", "type": "pubkey" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "ProjectClosed",
      "type": {
        "kind": "struct",
        "fields": [{ "name": "project", "type": "pubkey" }]
      }
    },
    {
      "name": "ProjectCreated",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "project", "type": "pubkey" },
          { "name": "creator", "type": "pubkey" },
          { "name": "title", "type": "string" }
        ]
      }
    },
    {
      "name": "ProjectFinalized",
      "type": {
        "kind": "struct",
        "fields": [{ "name": "project", "type": "pubkey" }]
      }
    },
    {
      "name": "ProjectFunded",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "project", "type": "pubkey" },
          { "name": "amount_lamports", "type": "u64" }
        ]
      }
    },
    {
      "name": "ProjectStatus",
      "type": {
        "kind": "enum",
        "variants": [{ "name": "Open" }, { "name": "Finalized" }]
      }
    }
  ]
}
Note pour la nouvelle conversation : distribute prend les wallets des membres en remaining_accounts, dans l'ordre exact de project.members, un compte writable non-signer par membre. Le programme vérifie remaining_accounts[i].key() == members[i].wallet et échoue avec MemberMismatch (6016) sinon.