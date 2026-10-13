-- ═══════════════════════════════════════════════════════════════════
-- Fermeture des dernières policies d'écriture publiques.
--
-- Ces quatre tables acceptaient des INSERT (et pour project_media, des
-- UPDATE) de n'importe qui, sans authentification. Concrètement :
--   • pact_events     : inscrire un faux « X a financé 40 SOL » ;
--   • project_updates : poster au nom d'un membre du pact ;
--   • role_interests  : candidater sous le wallet d'un autre ;
--   • project_media   : réécrire logo / bannière / présentation de
--                       N'IMPORTE quel projet — défacement en une requête.
--
-- Postgres ne peut pas trancher : il n'a aucun moyen de savoir qui contrôle
-- une clé Solana. L'écriture passe donc désormais par l'Edge Function
-- `project-write`, qui exige une signature ed25519 (update/apply/media) ou
-- une preuve on-chain (event) avant d'écrire en service_role.
--
-- Les policies SELECT sont CONSERVÉES : la lecture publique est le
-- fonctionnement voulu, et c'est aussi ce qui fait marcher le Realtime
-- (un abonnement postgres_changes est évalué avec les droits SELECT de
-- l'abonné).
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists "pact_events_public_insert" on public.pact_events;
drop policy if exists "project_updates_public_insert" on public.project_updates;
drop policy if exists "role_interests_public_insert" on public.role_interests;
drop policy if exists "project_media_public_insert" on public.project_media;
drop policy if exists "project_media_public_update" on public.project_media;

-- ── Anti-rejeu du journal d'activité ───────────────────────────────
-- La vérification on-chain prouve qu'une transaction a bien eu lieu, mais
-- rien n'empêcherait de la présenter cinquante fois pour gonfler le fil.
-- La contrainte UNIQUE rend le rejeu inoffensif : la seconde insertion
-- échoue en 23505, que l'Edge Function traite comme un succès idempotent.
--
-- Dédoublonnage préalable, sinon la contrainte ne peut pas être créée sur
-- les lignes existantes. On garde la plus ancienne ligne de chaque tx_sig —
-- c'est celle qui correspond au moment réel de l'événement.
delete from public.pact_events a
using public.pact_events b
where a.tx_sig = b.tx_sig
  and a.id > b.id;

create unique index if not exists pact_events_tx_sig_key
  on public.pact_events (tx_sig);
