ALTER TABLE recebimentos_banda
  ALTER COLUMN valor SET NOT NULL,
  ALTER COLUMN valor DROP DEFAULT,
  ADD CONSTRAINT recebimentos_banda_valor_positivo CHECK (valor > 0);

CREATE OR REPLACE FUNCTION validar_limite_recebimento_banda() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_limite numeric(14,2);
  v_lancado numeric(14,2);
BEGIN
  SELECT n.valor INTO v_limite
  FROM negociacoes n
  WHERE n.id = NEW.negociacao_id AND n.contrato_id = NEW.contrato_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A negociação não pertence ao contrato informado.' USING ERRCODE = '23503';
  END IF;
  SELECT COALESCE(SUM(r.valor), 0) INTO v_lancado
  FROM recebimentos_banda r
  WHERE r.negociacao_id = NEW.negociacao_id AND r.id IS DISTINCT FROM NEW.id;
  IF v_lancado + NEW.valor > v_limite THEN
    RAISE EXCEPTION 'O valor excede o saldo da negociação (disponível: %).', (v_limite - v_lancado)::numeric(14,2)
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER recebimentos_banda_limite
BEFORE INSERT OR UPDATE OF contrato_id, negociacao_id, valor ON recebimentos_banda
FOR EACH ROW EXECUTE FUNCTION validar_limite_recebimento_banda();

CREATE OR REPLACE VIEW v_banda AS
SELECT c.id AS contrato_id, e.cache, e.camarote,
  COALESCE(SUM(r.valor), 0)::numeric AS recebido,
  COALESCE(SUM(r.valor) FILTER (WHERE r.tipo IN ('iss','ir','outras_retencoes')), 0)::numeric AS retido,
  (e.cache - COALESCE(SUM(r.valor), 0))::numeric AS saldo
FROM contratos c
JOIN eventos e ON e.id = c.evento_id
LEFT JOIN recebimentos_banda r ON r.contrato_id = c.id
GROUP BY c.id, e.cache, e.camarote;

CREATE INDEX historicos_cobranca_contrato_data_idx ON historicos_cobranca(contrato_id, data_hora DESC);
