-- ═══════════════════════════════════════════════════════════════════
-- BuildPact — table `quest_claims` (Journal de quêtes V2)
--
-- ⚠️ Cette table EXISTE DÉJÀ en base : elle a été appliquée directement
-- via le dashboard Supabase, sans passer par une migration commitée.
-- Ce fichier ne la crée donc pas vraiment — il la CODIFIE, pour qu'un
-- environnement reparti de zéro (ou une restauration) la retrouve à
-- l'identique au lieu de dépendre d'un geste manuel non tracé.
--
-- D'où le `if not exists` partout : rejouer ce fichier sur la base
-- actuelle ne doit rien casser ni rien réécrire.
--
-- Une ligne = une réclamation. La clé primaire composite
-- (wallet, week_start, quest_key) EST le garde-fou anti-doublon :
-- l'Edge Function `quest-write` s'appuie sur le code d'erreur Postgres
-- 23505 pour distinguer « déjà réclamé » (réponse 200 alreadyClaimed)
-- d'un véritable échec d'insertion (500). Supprimer ou assouplir cette
-- clé rendrait l'XP réclamable en boucle.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.quest_claims (
  wallet      text not null check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  week_start  date not null,
  -- 'bonus' n'est pas une quête réclamable par le client : c'est la ligne
  -- posée par le serveur quand les 3 quêtes de base sont acquises.
  quest_key   text not null check (quest_key = any (array['fund','approve','finalize','bonus'])),
  xp_awarded  integer not null check (xp_awarded > 0),
  claimed_at  timestamptz not null default now(),
  primary key (wallet, week_start, quest_key)
);

alter table public.quest_claims enable row level security;

-- Lecture publique : le journal, la série et l'historique sont calculés
-- côté client à partir de ces lignes, et un classement n'a d'intérêt que
-- s'il est visible de tous. Aucune donnée sensible ici — seulement un
-- wallet public, une semaine et un montant d'XP.
drop policy if exists quest_claims_public_read on public.quest_claims;
create policy quest_claims_public_read
  on public.quest_claims for select
  using (true);

-- Aucune policy d'INSERT/UPDATE/DELETE, volontairement. L'écriture passe
-- exclusivement par l'Edge Function `quest-write` en service_role (qui
-- bypass RLS) après vérification de la signature ed25519 ET recalcul de
-- la complétion réelle depuis pact_events. Ouvrir l'insert au navigateur
-- permettrait à n'importe qui de s'auto-créditer l'XP.

-- L'historique et la série filtrent toujours par wallet puis trient par
-- semaine décroissante ; la clé primaire couvre le préfixe (wallet), cet
-- index sert les tris sur de gros volumes.
create index if not exists quest_claims_wallet_week_idx
  on public.quest_claims (wallet, week_start desc);
