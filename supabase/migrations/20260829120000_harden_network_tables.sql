-- ═══════════════════════════════════════════════════════════════════
-- Réseau Builders — DURCISSEMENT (les tables existent déjà).
--
-- Constat avant migration, lu directement dans le catalogue Postgres :
--   network_posts           RLS on, 1 policy SELECT public, aucune écriture
--   network_post_reactions  idem
--   network_post_comments   idem
--
-- Autrement dit la partie difficile — RLS activé, aucune policy INSERT
-- ouverte — est DÉJÀ en place. Cette migration ne crée donc aucune table
-- et n'ouvre aucun droit. Elle ferme trois trous restants :
--
--   1. l'unicité de (post_id, wallet) sur les réactions ;
--   2. les clés étrangères vers network_posts ;
--   3. les index de lecture du feed.
--
-- Tout est écrit en IF NOT EXISTS / DO $$ conditionnel : rejouer ce
-- fichier ne casse rien, et il s'applique aussi sur une base où une
-- partie serait déjà présente.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Unicité des réactions ───────────────────────────────────────
-- Sans cette contrainte, deux clics rapides sur 🤝 insèrent DEUX lignes
-- pour le même wallet : le compteur affiche 2 encouragements venant
-- d'une seule personne, et le bouton « déjà réagi » devient incohérent.
-- L'Edge Function tente déjà de l'éviter, mais elle lit puis écrit en
-- deux temps — seule la base peut trancher une vraie course.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'network_post_reactions_post_wallet_key'
  ) then
    -- Purge préalable des doublons éventuels : la contrainte échouerait
    -- sinon, et toute la migration serait annulée.
    delete from public.network_post_reactions a
    using public.network_post_reactions b
    where a.ctid > b.ctid
      and a.post_id = b.post_id
      and a.wallet  = b.wallet;

    alter table public.network_post_reactions
      add constraint network_post_reactions_post_wallet_key
      unique (post_id, wallet);
  end if;
end $$;

-- ── 2. Clés étrangères ─────────────────────────────────────────────
-- ON DELETE CASCADE : supprimer un post doit emporter ses réactions et
-- ses commentaires. Sans FK, ils survivent en orphelins — invisibles
-- dans l'UI, mais comptés par fetchPostCounts() sur un id qui n'existe
-- plus, et jamais nettoyés.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'network_post_reactions_post_id_fkey'
  ) then
    delete from public.network_post_reactions r
    where not exists (select 1 from public.network_posts p where p.id = r.post_id);

    alter table public.network_post_reactions
      add constraint network_post_reactions_post_id_fkey
      foreign key (post_id) references public.network_posts (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'network_post_comments_post_id_fkey'
  ) then
    delete from public.network_post_comments c
    where not exists (select 1 from public.network_posts p where p.id = c.post_id);

    alter table public.network_post_comments
      add constraint network_post_comments_post_id_fkey
      foreign key (post_id) references public.network_posts (id) on delete cascade;
  end if;
end $$;

-- ── 3. Index de lecture ────────────────────────────────────────────
-- Le feed trie par created_at desc et pagine avec `lt(created_at)`.
-- Sans index, chaque page devient un seq scan + tri complet de la table :
-- imperceptible sur 50 posts, visible sur 5 000.
create index if not exists network_posts_created_at_idx
  on public.network_posts (created_at desc);

-- fetchPostsByWallet() — onglet « Mes posts » du profil.
create index if not exists network_posts_author_created_idx
  on public.network_posts (author_wallet, created_at desc);

-- fetchPostCounts() interroge ces deux tables par lot de post_id.
create index if not exists network_post_reactions_post_id_idx
  on public.network_post_reactions (post_id);

create index if not exists network_post_comments_post_created_idx
  on public.network_post_comments (post_id, created_at);

-- fetchMyReactions() filtre sur le wallet connecté avant le lot d'ids.
create index if not exists network_post_reactions_wallet_idx
  on public.network_post_reactions (wallet);

-- ── 4. Bucket des images de post ───────────────────────────────────
-- Public en LECTURE seulement : getPublicUrl() doit fonctionner sans
-- jeton pour afficher l'image dans le feed.
--
-- ⚠️ Aucune policy d'écriture n'est créée, et c'est délibéré. L'upload
-- passe par une URL signée délivrée par l'Edge Function (service role),
-- qui ne consulte pas les policies. Ajouter ici une policy INSERT pour
-- `public` rouvrirait exactement le trou que l'URL signée sert à fermer :
-- n'importe qui pourrait déposer des fichiers dans le bucket.
insert into storage.buckets (id, name, public)
values ('network-media', 'network-media', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'network_media_public_read'
  ) then
    create policy network_media_public_read
      on storage.objects for select
      to public
      using (bucket_id = 'network-media');
  end if;
end $$;
