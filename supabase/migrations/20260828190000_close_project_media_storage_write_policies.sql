-- Ferme l'écriture publique sur le bucket "project-media" (storage.objects).
-- N'importe qui pouvait écraser <pda>/logo.png ou <pda>/banner.<ext> de
-- n'importe quel projet via un upload direct au bucket avec la clé anon
-- (le chemin est déterministe). La policy UPDATE sur project_media (la
-- table) a déjà été fermée par 20260828180000 ; ceci ferme le pendant
-- storage, qui laissait quand même l'image remplaçable même sans pouvoir
-- changer l'URL enregistrée en base.
--
-- Conséquence au moment où cette migration a été appliquée :
-- uploadMediaFile / uploadProjectMedia (src/lib/media.ts) ne pouvaient plus
-- écrire directement au bucket, y compris pour un founder légitime — la
-- fonctionnalité "changer logo/bannière" était cassée côté UI (erreur
-- "uploadFailed" gérée, pas un crash). Choix délibéré : fermer une faille
-- de défacement public plutôt que de laisser une fonctionnalité tourner sur
-- un chemin non authentifié.
--
-- Depuis, l'Edge Function `project-write` expose l'action
-- "media-upload-url" : elle vérifie une signature ed25519 fraîche puis
-- l'autorisation founder (lecture de project.creator on-chain, ou
-- redérivation du PDA si le compte n'est pas encore visible du RPC), et
-- émet une URL d'upload signée valable pour CE chemin uniquement. Une URL
-- signée est honorée indépendamment des policies ci-dessous — c'est tout
-- son intérêt — donc l'upload légitime refonctionne sans rouvrir quoi que
-- ce soit ici.
--
-- La lecture publique reste ouverte (les images doivent s'afficher pour
-- tout le monde, y compris déconnecté).
--
-- Appliqué directement via Supabase MCP le 28/08 ; ce fichier ne fait que
-- versionner ce qui existe déjà en base (cf. leçon RESUME_PROJET.md §9 :
-- ne jamais déduire l'état de la base des fichiers seuls, mais l'inverse
-- — laisser un changement réel sans trace versionnée — est tout aussi
-- dangereux si le projet Supabase devait être recréé).
drop policy if exists "project_media_storage_public_insert" on storage.objects;
drop policy if exists "project_media_storage_public_update" on storage.objects;

-- Nettoyage au passage : policy SELECT dupliquée (même effet que
-- project_media_storage_public_read), aucune perte fonctionnelle.
drop policy if exists "Allow public read access vqig4w_0" on storage.objects;
