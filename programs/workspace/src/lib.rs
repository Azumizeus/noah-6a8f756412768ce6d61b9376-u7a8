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

// ---------------------------------------------------------------------------
// Upgrade 27/08 — extension des bornes de texte.
//
// Rappel Borsh : une String est sérialisée en [4 octets de longueur][octets].
// Les champs ne sont donc PAS à offsets fixes, et augmenter une borne ne
// modifie que le `space` alloué à l'init. Les comptes Project déjà créés
// restent parfaitement désérialisables par cette version du programme : le
// changement est additif, aucune migration de données n'est nécessaire.
//
// Toutes ces constantes comptent des OCTETS UTF-8, pas des caractères.
// Un « é » vaut 2 octets, un emoji jusqu'à 4.
//
// PLAFOND RÉEL : une transaction Solana est limitée à 1232 octets TOUT
// COMPRIS — signatures, en-tête, liste des comptes, données d'instruction.
// Sur create_project, une fois retirés la signature, les comptes et les
// autres arguments (project_id, title, creator_role, protocol_wallet), il
// reste de l'ordre de 900 octets utilisables pour la description, et moins
// encore sur les instructions qui manipulent un Vec<Member> rempli.
//
// Toute borne au-delà de ~800 octets est donc de la place payée en rent mais
// physiquement INATTEIGNABLE : ni create_project ni update_description ne
// peuvent transporter la donnée. C'est la contrainte qui commande ici, pas
// le coût du rent.
// ---------------------------------------------------------------------------

/// 80 caractères latins. Ancienne valeur : 40 — trop serrée pour un titre
/// bilingue (« Plateforme de partage de revenus pour co-fondateurs » = 51).
pub const MAX_TITLE_LEN: usize = 80;

/// 800 OCTETS UTF-8. Anciennes valeurs : 500, puis 280.
///
/// CONTRAINTES MESURÉES (tests/load-and-migration.ts) : le BorshCoder v1 du
/// client plafonne create_project à desc ≤ 818 et update_description à
/// desc ≤ 996 (buffer pré-alloué ~1008 octets par instruction), et la tx est
/// limitée à 1232 octets, ce qui borne create_project à desc ≤ ~981. 800 =
/// dernier chiffre rond sous ces trois plafonds, avec ~180 octets de marge.
///
/// Le compteur côté UI doit compter des OCTETS
/// (`new TextEncoder().encode(s).length`) et non `s.length`, sinon il annonce
/// une capacité qui n'existe pas et l'utilisateur se prend un
/// InvalidParameter au moment de signer.
pub const MAX_DESC_LEN: usize = 800;

/// 32 octets. Ancienne valeur : 24 — « Responsable Marketing Digital » (29)
/// était refusé. Attention : multiplié par MAX_MEMBERS dans Project::LEN.
pub const MAX_ROLE_LEN: usize = 32;

// NE PAS augmenter MAX_PROJECT_ID_LEN : il sert de seed PDA, et une seed
// Solana est plafonnée à 32 octets. Un dépassement plante à l'exécution,
// pas à la compilation.
//
// NE PAS augmenter MAX_MEMBERS sans test de charge : chaque membre ajoute
// un CPI transfer dans distribute (déjà 9 transferts à 8 membres), ce qui
// rapproche des limites de calcul d'une transaction.
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
        // Conservé pour compatibilité IDL avec le frontend déployé. La valeur
        // est désormais imposée par la constante PROTOCOL_WALLET ci-dessus ;
        // cet argument n'a plus d'effet fonctionnel. Le retirer changerait la
        // signature de l'instruction, donc l'IDL, donc obligerait à
        // resynchroniser frontend + Edge Functions dans la même seconde que le
        // déploiement du programme — fenêtre pendant laquelle toute création de
        // pact échouerait. Sera retiré lors d'un futur changement de signature
        // groupé et assumé.
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

    // -----------------------------------------------------------------------
    // Upgrade 27/08 — nouvelle instruction.
    //
    // Les pacts créés AVANT cet upgrade ont un `space` figé, calculé avec les
    // anciennes bornes (description 280, titre 40, rôle 24). Sans cette
    // instruction ils resteraient plafonnés à vie.
    //
    // Note : cette instruction est elle aussi soumise au plafond de 1232
    // octets par transaction. Elle est légère (3 comptes, un seul argument),
    // donc 1000 octets de description passent sans difficulté — c'est
    // create_project, avec ses arguments multiples, qui est le cas le plus
    // serré.
    //
    // `update_description` a donc deux rôles :
    //   1. permettre au créateur de corriger / étendre la description ;
    //   2. servir de MIGRATION — la contrainte `realloc` porte toujours le
    //      compte à la taille maximale actuelle (8 + Project::LEN), ce qui
    //      débloque aussi les titres longs et les rôles de 32 octets sur les
    //      anciens pacts.
    //
    // Le realloc cible systématiquement Project::LEN, jamais une taille
    // calculée sur le contenu : un compte rétréci casserait la prochaine
    // écriture longue. Le rent différentiel est à la charge du créateur, et
    // lui est restitué à close_project.
    //
    // Restreint au statut Open : autoriser la modification après finalize
    // reviendrait à altérer le texte que les autres membres ont approuvé.
    // Aucun nouveau code d'erreur — voir la note sur ErrorCode en bas de
    // fichier.
    // -----------------------------------------------------------------------
    pub fn update_description(
        ctx: Context<UpdateDescription>,
        description: String,
    ) -> Result<()> {
        require!(description.len() <= MAX_DESC_LEN, ErrorCode::InvalidParameter);

        let project = &mut ctx.accounts.project;
        require!(project.status == ProjectStatus::Open, ErrorCode::AlreadyFinalized);

        let new_len = description.len() as u32;
        project.description = description;

        emit!(DescriptionUpdated {
            project: project.key(),
            creator: project.creator,
            new_len,
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

/// Contexte de update_description.
///
/// `realloc` porte le compte à la taille maximale courante. Sur un pact créé
/// avant l'upgrade du 27/08, cela agrandit le compte ; sur un pact récent
/// c'est un no-op. `realloc::zero = false` : on ne remet pas à zéro l'espace
/// ajouté, la resérialisation Borsh de sortie réécrit de toute façon toute la
/// zone utile et les octets de queue ne sont jamais lus.
///
/// `creator` doit être `mut` : il paie le rent différentiel via
/// `realloc::payer`.
#[derive(Accounts)]
pub struct UpdateDescription<'info> {
    #[account(
        mut,
        seeds = [b"project", project.creator.as_ref(), project.project_id.as_bytes()],
        bump = project.bump,
        has_one = creator @ ErrorCode::Unauthorized,
        realloc = 8 + Project::LEN,
        realloc::payer = creator,
        realloc::zero = false,
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

/// Upgrade 27/08 — `new_len` est une longueur en OCTETS UTF-8, pas en
/// caractères. Un indexeur qui voudrait afficher un compteur doit en tenir
/// compte.
#[event]
pub struct DescriptionUpdated {
    pub project: Pubkey,
    pub creator: Pubkey,
    pub new_len: u32,
}

// ---------------------------------------------------------------------------
// RÈGLE D'OR — ne jamais insérer de variante au milieu de cet enum.
//
// Anchor numérote séquentiellement à partir de 6000, dans l'ordre de
// déclaration. Insérer une variante décale TOUS les codes suivants : le
// frontend, les Edge Functions, les tests et la doc qui affichent « erreur
// 6021 » se mettent à désigner autre chose, silencieusement. Toute nouvelle
// variante s'ajoute EN FIN d'enum, à partir de 6023.
//
// InactiveAccount (6003) n'est référencé nulle part dans le programme. Il est
// volontairement CONSERVÉ : le supprimer décalerait 19 codes. Code mort
// inoffensif.
//
// L'upgrade du 27/08 (update_description) n'ajoute AUCUN code : il réutilise
// InvalidParameter pour la longueur, Unauthorized via has_one, et
// AlreadyFinalized pour le verrou de statut.
// ---------------------------------------------------------------------------
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
