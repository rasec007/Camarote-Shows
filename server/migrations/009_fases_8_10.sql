BEGIN;

ALTER TABLE cheques
  ADD COLUMN IF NOT EXISTS tipo tipo_conta NOT NULL DEFAULT 'pagar',
  ADD COLUMN IF NOT EXISTS agencia text,
  ADD COLUMN IF NOT EXISTS emitente text;
CREATE INDEX IF NOT EXISTS cheques_empresa_vencimento_idx ON cheques(empresa_id,vencimento DESC,id);
CREATE INDEX IF NOT EXISTS cheques_empresa_baixa_idx ON cheques(empresa_id,data_baixa);

ALTER TABLE documentos_rh
  ADD COLUMN IF NOT EXISTS arquivo_id uuid REFERENCES arquivos(id) ON DELETE RESTRICT;
ALTER TABLE planos_viagem
  ADD COLUMN IF NOT EXISTS descricao text NOT NULL DEFAULT 'PLANO DE VIAGEM',
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim date,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE planos_viagem_lancamentos
  ADD COLUMN IF NOT EXISTS data date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS arquivo_id uuid REFERENCES arquivos(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS documentos_rh_empresa_ano_mes_idx ON documentos_rh(empresa_id,ano DESC,mes DESC,tipo);
CREATE INDEX IF NOT EXISTS documentos_rh_funcionario_idx ON documentos_rh(funcionario_id,ano DESC,mes DESC);

CREATE INDEX IF NOT EXISTS planos_viagem_empresa_data_idx ON planos_viagem(empresa_id,data_encerrado DESC,id);
CREATE INDEX IF NOT EXISTS planos_viagem_lancamentos_plano_idx ON planos_viagem_lancamentos(plano_viagem_id,tipo);
CREATE OR REPLACE VIEW v_planos_viagem AS
SELECT p.id,p.empresa_id,p.evento_id,p.responsavel_id,p.status,p.data_encerrado,
       COALESCE(SUM(l.valor) FILTER(WHERE l.tipo='entrada'),0)::numeric(14,2) AS total_adiantado,
       COALESCE(SUM(l.valor) FILTER(WHERE l.tipo='saida'),0)::numeric(14,2) AS total_despesas,
       (COALESCE(SUM(l.valor) FILTER(WHERE l.tipo='entrada'),0)-COALESCE(SUM(l.valor) FILTER(WHERE l.tipo='saida'),0))::numeric(14,2) AS saldo
FROM planos_viagem p LEFT JOIN planos_viagem_lancamentos l ON l.plano_viagem_id=p.id
GROUP BY p.id;

CREATE INDEX IF NOT EXISTS auditoria_criado_tabela_idx ON auditoria(criado_em DESC,tabela,operacao);
CREATE INDEX IF NOT EXISTS auditoria_usuario_idx ON auditoria(user_id,criado_em DESC);
CREATE OR REPLACE FUNCTION auditar_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; old_json jsonb; new_json jsonb;
BEGIN
  actor := NULLIF(current_setting('app.usuario_id',true),'')::uuid;
  IF TG_OP <> 'INSERT' THEN old_json := to_jsonb(OLD) - 'senha_hash'; END IF;
  IF TG_OP <> 'DELETE' THEN new_json := to_jsonb(NEW) - 'senha_hash'; END IF;
  INSERT INTO auditoria(user_id,tabela,operacao,antes,depois) VALUES(actor,TG_TABLE_NAME,TG_OP,old_json,new_json);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS arquivos_auditoria ON arquivos;
CREATE TRIGGER arquivos_auditoria AFTER INSERT OR UPDATE OR DELETE ON arquivos
  FOR EACH ROW EXECUTE FUNCTION auditar_alteracao();

COMMIT;
