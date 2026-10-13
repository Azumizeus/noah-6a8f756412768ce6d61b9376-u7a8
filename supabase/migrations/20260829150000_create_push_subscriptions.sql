-- supabase/migrations/20260829150000_create_push_subscriptions.sql
-- BuildPact — table des abonnements Web Push (voir supabase/functions/push).
--
-- RLS fermée volontairement : aucune policy publique de lecture/écriture.
-- Toutes les opérations passent par l'Edge Function `push`, qui écrit avec
-- la service_role key après avoir vérifié une signature wallet ed25519 —
-- même schéma que quest_claims / builder_profiles. Un accès direct client
-- exposerait les clés d'abonnement push (p256dh/auth) d'autres wallets.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  notify_approvals boolean not null default true,
  notify_funding boolean not null default true,
  notify_quests boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_wallet_idx on push_subscriptions (wallet);

alter table push_subscriptions enable row level security;
-- Aucune policy créée : RLS activé = tout accès direct (anon/authenticated)
-- refusé par défaut. Seule la service_role (Edge Function) peut lire/écrire.
