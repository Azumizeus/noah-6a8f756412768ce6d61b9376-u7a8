-- Les vues héritaient des GRANT par défaut du schéma public (anon et
-- authenticated recevaient INSERT/UPDATE/DELETE/TRUNCATE). Non exploitable
-- sur une vue d'agrégat non auto-updatable, mais on réduit la surface.
revoke all on public.builder_ratings_summary   from anon, authenticated;
revoke all on public.project_documents_summary from anon, authenticated;

-- Seule la moyenne + le nombre de notes sont lisibles publiquement.
-- NOTE : la vue s'exécute avec les droits de son propriétaire, elle
-- traverse donc volontairement le RLS de builder_ratings — c'est le
-- mécanisme qui permet d'exposer l'agrégat sans exposer qui a noté qui.
grant select on public.builder_ratings_summary to anon, authenticated;

-- project_documents_summary reste totalement fermée au client : même le
-- simple nombre de documents révélerait l'activité privée d'un projet.
-- Elle n'est lisible que par la service_role (Edge Function `vault`).
