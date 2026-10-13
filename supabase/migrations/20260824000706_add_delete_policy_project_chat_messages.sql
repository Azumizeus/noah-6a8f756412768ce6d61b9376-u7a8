-- ⚠️ Policy PERMISSIVE : `using (true)` autorise n'importe quel visiteur
-- anonyme à supprimer n'importe quel message de chat, y compris ceux des
-- autres. Conservée telle quelle ici parce que cette migration ne fait que
-- refléter l'état réel de la base — la corriger doit se faire dans une
-- migration ultérieure, pas en réécrivant l'historique.
create policy project_chat_public_delete
  on project_chat_messages
  for delete
  using (true);
