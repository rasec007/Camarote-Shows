BEGIN;

-- Os cadastros operacionais são segregados pela empresa ativa do usuário.
ALTER TABLE artistas ADD COLUMN empresa_id uuid REFERENCES empresas(id) ON DELETE RESTRICT;
ALTER TABLE contratantes ADD COLUMN empresa_id uuid REFERENCES empresas(id) ON DELETE RESTRICT;
ALTER TABLE clientes ADD COLUMN empresa_id uuid REFERENCES empresas(id) ON DELETE RESTRICT;
ALTER TABLE fornecedores ADD COLUMN empresa_id uuid REFERENCES empresas(id) ON DELETE RESTRICT;
ALTER TABLE planos_contas ADD COLUMN empresa_id uuid REFERENCES empresas(id) ON DELETE RESTRICT;

UPDATE artistas SET empresa_id=(SELECT id FROM empresas WHERE padrao=true LIMIT 1) WHERE empresa_id IS NULL;
UPDATE contratantes SET empresa_id=(SELECT id FROM empresas WHERE padrao=true LIMIT 1) WHERE empresa_id IS NULL;
UPDATE clientes SET empresa_id=(SELECT id FROM empresas WHERE padrao=true LIMIT 1) WHERE empresa_id IS NULL;
UPDATE fornecedores SET empresa_id=(SELECT id FROM empresas WHERE padrao=true LIMIT 1) WHERE empresa_id IS NULL;
UPDATE planos_contas SET empresa_id=(SELECT id FROM empresas WHERE padrao=true LIMIT 1) WHERE empresa_id IS NULL;

ALTER TABLE artistas ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE contratantes ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE clientes ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE fornecedores ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE planos_contas ALTER COLUMN empresa_id SET NOT NULL;

CREATE INDEX artistas_empresa_nome_idx ON artistas(empresa_id,nome);
CREATE INDEX contratantes_empresa_nome_idx ON contratantes(empresa_id,nome);
CREATE INDEX clientes_empresa_nome_idx ON clientes(empresa_id,nome);
CREATE INDEX fornecedores_empresa_nome_idx ON fornecedores(empresa_id,nome);
CREATE INDEX planos_contas_empresa_nome_idx ON planos_contas(empresa_id,nome);

COMMIT;
