BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS cheques_empresa_numero_unico
  ON cheques(empresa_id,numero) WHERE numero IS NOT NULL AND btrim(numero)<>'';
COMMIT;
