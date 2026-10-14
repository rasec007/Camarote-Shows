BEGIN;

CREATE TYPE contexto_arquivo AS ENUM ('evento','contrato','financeiro','rh','geral');

CREATE TABLE arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  enviado_por uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  destinatario_usuario_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  contexto contexto_arquivo NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('contratos','financeiro','rh','arquivos')),
  object_key text NOT NULL UNIQUE,
  nome_original text NOT NULL,
  content_type text NOT NULL,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((contexto='rh' AND bucket='rh' AND destinatario_usuario_id IS NOT NULL)
      OR (contexto='contrato' AND bucket='contratos')
      OR (contexto='financeiro' AND bucket='financeiro')
      OR (contexto IN ('evento','geral') AND bucket='arquivos'))
);

CREATE INDEX arquivos_empresa_contexto_idx ON arquivos(empresa_id,contexto,created_at DESC);
CREATE INDEX arquivos_destinatario_rh_idx ON arquivos(destinatario_usuario_id) WHERE contexto='rh';

CREATE TRIGGER arquivos_auditoria AFTER INSERT OR UPDATE OR DELETE ON arquivos
  FOR EACH ROW EXECUTE FUNCTION auditar_alteracao();

COMMIT;
