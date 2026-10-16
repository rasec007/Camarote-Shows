-- Artistas pertencem ao catálogo global; empresas continuam ligadas a usuários e eventos.
ALTER TABLE artistas DROP COLUMN empresa_id;
CREATE INDEX artistas_status_nome_idx ON artistas(status, nome);
