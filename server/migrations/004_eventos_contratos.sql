BEGIN;

-- Arquivos ficam privados no object storage; a associação no banco guarda apenas a referência segura.
CREATE TABLE contrato_arquivos (
  contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  arquivo_id uuid NOT NULL REFERENCES arquivos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('contrato','tr','empenho')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contrato_id,tipo),
  UNIQUE (arquivo_id)
);
CREATE INDEX contrato_arquivos_arquivo_idx ON contrato_arquivos(arquivo_id);

COMMIT;
