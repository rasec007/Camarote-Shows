BEGIN;

ALTER TABLE contas ADD COLUMN IF NOT EXISTS arquivo_id uuid REFERENCES arquivos(id) ON DELETE SET NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS arquivo_id uuid REFERENCES arquivos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS contas_empresa_tipo_vencimento_idx ON contas(empresa_id,tipo,vencimento);
CREATE INDEX IF NOT EXISTS movimentacoes_empresa_data_idx ON movimentacoes(empresa_id,data DESC,id DESC);

CREATE OR REPLACE FUNCTION validar_movimentacao_financeira() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conta_row contas%ROWTYPE; total_movimentos numeric(14,2); limite numeric(14,2);
BEGIN
  IF NEW.conta_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO conta_row FROM contas WHERE id=NEW.conta_id FOR UPDATE;
  IF NOT FOUND OR conta_row.empresa_id<>NEW.empresa_id THEN
    RAISE EXCEPTION 'A conta não pertence à empresa da movimentação.' USING ERRCODE='23514';
  END IF;
  IF (conta_row.tipo='receber' AND NEW.tipo<>'entrada') OR (conta_row.tipo='pagar' AND NEW.tipo<>'saida') THEN
    RAISE EXCEPTION 'O tipo da movimentação deve ser igual ao tipo da conta.' USING ERRCODE='23514';
  END IF;
  limite := conta_row.valor-(conta_row.cofins+conta_row.csll+conta_row.inss+conta_row.irpj+conta_row.iss+conta_row.pis+conta_row.outros)-conta_row.desconto+conta_row.juros+conta_row.multa;
  SELECT COALESCE(SUM(valor),0) INTO total_movimentos FROM movimentacoes WHERE conta_id=NEW.conta_id AND (TG_OP='INSERT' OR id<>NEW.id);
  IF total_movimentos+NEW.valor>limite THEN
    RAISE EXCEPTION 'O valor informado superou o saldo da conta.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS movimentacoes_validar_conta ON movimentacoes;
CREATE TRIGGER movimentacoes_validar_conta BEFORE INSERT OR UPDATE ON movimentacoes
FOR EACH ROW EXECUTE FUNCTION validar_movimentacao_financeira();

COMMIT;
