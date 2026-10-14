BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE perfil AS ENUM ('super_administrador','administrador','financeiro','contrato','agenda','vendedor','produtor');
CREATE TYPE status_ativo AS ENUM ('ativo','inativo');
CREATE TYPE status_evento AS ENUM ('reservado','confirmado','contratado','cancelado');
CREATE TYPE tipo_agendamento AS ENUM ('bloqueado','show_particular','label','show','campanha_publica','compromisso','ensaio_fotos','ensaio_dvd','gravacao_clipe','gravacao_dvd','participacao_especial','presenca_vip','programa_tv_radio','reuniao','corporativo','outros');
CREATE TYPE movimentacao AS ENUM ('entrada','saida');
CREATE TYPE tipo_conta AS ENUM ('receber','pagar');
CREATE TYPE forma_pagamento AS ENUM ('dinheiro','credito','debito','pix','transferencia','boleto');
CREATE TYPE categoria_financeira AS ENUM ('atividades_investimento','custos_operacionais','atividades_financiamento','despesas_operacionais_outras_receitas','receitas_operacionais');
CREATE TYPE status_cobranca AS ENUM ('em_andamento','inadimplente','judicializado');
CREATE TYPE receita_deducao AS ENUM ('dinheiro','transferencia','iss','ir','outras_retencoes','encontro_de_contas');
CREATE TYPE tipo_doc_rh AS ENUM ('contra_cheque','rendimento');

CREATE TABLE empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, cnpj text, email text, fone text,
  endereco jsonb, numero text, complemento text, responsavel text, padrao boolean NOT NULL DEFAULT false,
  status status_ativo NOT NULL DEFAULT 'ativo', bubble_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX empresas_cnpj_unico ON empresas(cnpj) WHERE cnpj IS NOT NULL;

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
  senha_hash text, nome text NOT NULL, apelido text, fone text, foto_url text,
  perfil perfil NOT NULL, status status_ativo NOT NULL DEFAULT 'ativo',
  pode_visualizar_relatorios boolean NOT NULL DEFAULT false,
  empresa_padrao_id uuid REFERENCES empresas(id) ON DELETE RESTRICT,
  email_verificado_em timestamptz, ultimo_login_em timestamptz,
  bubble_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE usuario_empresas (
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  PRIMARY KEY (usuario_id, empresa_id)
);
ALTER TABLE usuarios ADD CONSTRAINT usuarios_empresa_padrao_vinculada_fk
  FOREIGN KEY (id,empresa_padrao_id) REFERENCES usuario_empresas(usuario_id,empresa_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE artistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, email text, celular text, responsavel text,
  comissao_camarote numeric(5,2), imposto numeric(5,2), status status_ativo NOT NULL DEFAULT 'ativo', bubble_id text UNIQUE
);
CREATE TABLE usuario_artistas (
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  artista_id uuid NOT NULL REFERENCES artistas(id) ON DELETE RESTRICT,
  acesso_total boolean NOT NULL DEFAULT false,
  PRIMARY KEY (usuario_id, artista_id)
);

CREATE TABLE contratantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, cpf_cnpj text, email text, celular text,
  responsavel text, observacoes text, status status_ativo NOT NULL DEFAULT 'ativo', bubble_id text UNIQUE
);
CREATE TABLE clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, cpf_cnpj text, email text, celular text,
  responsavel text, observacoes text, endereco jsonb, numero text, complemento text,
  status status_ativo NOT NULL DEFAULT 'ativo', bubble_id text UNIQUE
);
CREATE TABLE fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, cpf_cnpj text, email text, celular text,
  responsavel text, observacoes text, endereco jsonb, numero text, complemento text,
  status status_ativo NOT NULL DEFAULT 'ativo', bubble_id text UNIQUE
);
CREATE UNIQUE INDEX contratantes_cpf_cnpj_unico ON contratantes(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL AND btrim(cpf_cnpj) <> '';
CREATE UNIQUE INDEX clientes_cpf_cnpj_unico ON clientes(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL AND btrim(cpf_cnpj) <> '';
CREATE UNIQUE INDEX fornecedores_cpf_cnpj_unico ON fornecedores(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL AND btrim(cpf_cnpj) <> '';

CREATE TABLE bancos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome text NOT NULL, codigo text, agencia text, conta text, bubble_id text UNIQUE
);
CREATE TABLE planos_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL,
  categoria categoria_financeira NOT NULL, tipo movimentacao NOT NULL, bubble_id text UNIQUE
);

CREATE TABLE eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  artista_id uuid NOT NULL REFERENCES artistas(id) ON DELETE RESTRICT,
  contratante_id uuid REFERENCES contratantes(id) ON DELETE RESTRICT,
  cliente_id uuid REFERENCES clientes(id) ON DELETE RESTRICT,
  nome text, tipo_agendamento tipo_agendamento NOT NULL, inicio timestamptz NOT NULL,
  endereco jsonb, local text, cidade text, estado text,
  cache numeric(14,2) NOT NULL DEFAULT 0, camarote numeric(14,2) NOT NULL DEFAULT 0,
  diaria numeric(14,2) NOT NULL DEFAULT 0, imposto numeric(14,2) NOT NULL DEFAULT 0,
  producao_local numeric(14,2) NOT NULL DEFAULT 0, comissao_pct numeric(5,2),
  hospedagem text, nota_fiscal text, publico_privado text, show_colocado text, informacoes text,
  bloqueado boolean NOT NULL DEFAULT false, situacao_contrato boolean NOT NULL DEFAULT false,
  status status_evento NOT NULL DEFAULT 'reservado', created_by uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  bubble_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eventos_empresa_inicio_idx ON eventos(empresa_id, inicio);
CREATE INDEX eventos_artista_inicio_idx ON eventos(artista_id, inicio);
CREATE UNIQUE INDEX agenda_bloqueio_unico ON eventos(artista_id, ((inicio AT TIME ZONE 'America/Fortaleza')::date)) WHERE tipo_agendamento = 'bloqueado';

CREATE TABLE contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evento_id uuid NOT NULL UNIQUE REFERENCES eventos(id) ON DELETE RESTRICT,
  artista_id uuid NOT NULL REFERENCES artistas(id) ON DELETE RESTRICT,
  contratante_id uuid REFERENCES contratantes(id) ON DELETE RESTRICT,
  data date, data_cobranca date, cidade text, estado text, uf char(2),
  status status_evento NOT NULL DEFAULT 'confirmado', bloqueado boolean NOT NULL DEFAULT false,
  aprovado boolean NOT NULL DEFAULT false, assinado_banda boolean NOT NULL DEFAULT false,
  analise_juridica boolean NOT NULL DEFAULT false, devolvido_assinado boolean NOT NULL DEFAULT false,
  enviado_cobranca boolean NOT NULL DEFAULT false, producao_paga boolean NOT NULL DEFAULT false,
  diaria_paga boolean NOT NULL DEFAULT false, documentacao text NOT NULL DEFAULT 'PENDENTE',
  status_processo text, situacao_pagamento text, fonte_recurso text, nota_fiscal text, observacao text,
  arquivo_tr_path text, arquivo_contrato_path text, arquivo_empenho_path text, bubble_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  status status_cobranca, status_diaria boolean NOT NULL DEFAULT false, status_producao boolean NOT NULL DEFAULT false,
  vencimento date, bubble_id text UNIQUE
);
CREATE TABLE negociacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  vencimento date, descricao text, valor numeric(14,2) NOT NULL CHECK (valor >= 0), bubble_id text UNIQUE
);
CREATE TABLE recebimentos_banda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  negociacao_id uuid NOT NULL REFERENCES negociacoes(id) ON DELETE RESTRICT,
  data date NOT NULL, descricao text, tipo receita_deducao NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor >= 0), bubble_id text UNIQUE
);
CREATE TABLE historicos_cobranca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  origem text NOT NULL CHECK (origem IN ('banda','camarote')), data_hora timestamptz NOT NULL DEFAULT now(),
  descricao text, status text, valor numeric(14,2), bubble_id text UNIQUE
);

CREATE TABLE contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  tipo tipo_conta NOT NULL, fornecedor_id uuid REFERENCES fornecedores(id) ON DELETE RESTRICT,
  evento_id uuid REFERENCES eventos(id) ON DELETE RESTRICT,
  plano_contas_id uuid NOT NULL REFERENCES planos_contas(id) ON DELETE RESTRICT,
  descricao text NOT NULL, observacao text, emissao date, vencimento date NOT NULL, valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  cofins numeric(14,2) NOT NULL DEFAULT 0, csll numeric(14,2) NOT NULL DEFAULT 0, inss numeric(14,2) NOT NULL DEFAULT 0,
  irpj numeric(14,2) NOT NULL DEFAULT 0, iss numeric(14,2) NOT NULL DEFAULT 0, pis numeric(14,2) NOT NULL DEFAULT 0,
  outros numeric(14,2) NOT NULL DEFAULT 0, desconto numeric(14,2) NOT NULL DEFAULT 0,
  juros numeric(14,2) NOT NULL DEFAULT 0, multa numeric(14,2) NOT NULL DEFAULT 0,
  arquivo_path text, bubble_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  conta_id uuid REFERENCES contas(id) ON DELETE RESTRICT,
  tipo movimentacao NOT NULL, data date NOT NULL, valor numeric(14,2) NOT NULL CHECK (valor > 0),
  forma_pagamento forma_pagamento NOT NULL, banco_id uuid NOT NULL REFERENCES bancos(id) ON DELETE RESTRICT,
  plano_contas_id uuid NOT NULL REFERENCES planos_contas(id) ON DELETE RESTRICT,
  categoria categoria_financeira NOT NULL, descricao text, arquivo_path text,
  bubble_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimentacoes_empresa_banco_data_idx ON movimentacoes(empresa_id,banco_id,data,id);

CREATE VIEW contas_saldo AS
SELECT c.*,
  c.valor - (c.cofins+c.csll+c.inss+c.irpj+c.iss+c.pis+c.outros) - c.desconto + c.juros + c.multa AS valor_final,
  COALESCE(SUM(m.valor),0)::numeric(14,2) AS valor_pago,
  c.valor - (c.cofins+c.csll+c.inss+c.irpj+c.iss+c.pis+c.outros) - c.desconto + c.juros + c.multa - COALESCE(SUM(m.valor),0) AS saldo,
  CASE WHEN c.valor - (c.cofins+c.csll+c.inss+c.irpj+c.iss+c.pis+c.outros) - c.desconto + c.juros + c.multa - COALESCE(SUM(m.valor),0) <= 0 THEN 'Pago'
       WHEN c.vencimento < CURRENT_DATE THEN 'Vencido' ELSE 'Pendente' END AS status_exibicao
FROM contas c LEFT JOIN movimentacoes m ON m.conta_id=c.id GROUP BY c.id;

CREATE VIEW movimentacoes_saldo AS
SELECT m.*, SUM(CASE WHEN m.tipo='entrada' THEN m.valor ELSE -m.valor END)
  OVER (PARTITION BY m.empresa_id,m.banco_id ORDER BY m.data,m.id) AS saldo_acumulado
FROM movimentacoes m;

CREATE VIEW v_banda AS
SELECT c.id AS contrato_id, e.cache, e.camarote,
  COALESCE(SUM(r.valor) FILTER (WHERE r.tipo IN ('dinheiro','transferencia','encontro_de_contas')),0) AS recebido,
  COALESCE(SUM(r.valor) FILTER (WHERE r.tipo IN ('iss','ir','outras_retencoes')),0) AS retido,
  e.cache - COALESCE(SUM(r.valor),0) AS saldo
FROM contratos c JOIN eventos e ON e.id=c.evento_id
LEFT JOIN recebimentos_banda r ON r.contrato_id=c.id GROUP BY c.id,e.cache,e.camarote;

CREATE TABLE cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  banco_id uuid REFERENCES bancos(id) ON DELETE RESTRICT, beneficiario text, numero text, conta text,
  emissao date, vencimento date, data_baixa date, valor numeric(14,2) NOT NULL CHECK (valor >= 0), observacao text, bubble_id text UNIQUE
);
CREATE TABLE documentos_rh (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  funcionario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT, ano integer NOT NULL, mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  tipo tipo_doc_rh NOT NULL, arquivo_path text NOT NULL, bubble_id text UNIQUE
);
CREATE TABLE planos_viagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  evento_id uuid REFERENCES eventos(id) ON DELETE RESTRICT, responsavel_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  status status_ativo NOT NULL DEFAULT 'ativo', valor numeric(14,2) NOT NULL DEFAULT 0,
  data_encerrado date, bubble_id text UNIQUE
);
CREATE TABLE planos_viagem_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plano_viagem_id uuid NOT NULL REFERENCES planos_viagem(id) ON DELETE RESTRICT,
  tipo movimentacao NOT NULL, descricao text NOT NULL, valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  arquivo_path text, bubble_id text UNIQUE
);
CREATE TABLE auditoria (
  id bigserial PRIMARY KEY, user_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  tabela text NOT NULL, operacao text NOT NULL, antes jsonb, depois jsonb, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tokens_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, finalidade text NOT NULL CHECK (finalidade IN ('convite','redefinicao')),
  expira_em timestamptz NOT NULL, usado_em timestamptz, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tokens_acesso_usuario_idx ON tokens_acesso(usuario_id,finalidade,expira_em);
CREATE TABLE tokens_refresh (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expira_em timestamptz NOT NULL, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tokens_refresh_usuario_idx ON tokens_refresh(usuario_id,expira_em);

CREATE UNIQUE INDEX empresas_unico_padrao_idx ON empresas(padrao) WHERE padrao=true;
CREATE OR REPLACE FUNCTION definir_empresa_padrao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(4201001);
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM empresas WHERE padrao=true) THEN NEW.padrao := true; END IF;
  IF NEW.padrao THEN UPDATE empresas SET padrao=false WHERE id IS DISTINCT FROM NEW.id AND padrao=true; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER empresas_definir_padrao BEFORE INSERT OR UPDATE OF padrao ON empresas FOR EACH ROW EXECUTE FUNCTION definir_empresa_padrao();

CREATE OR REPLACE FUNCTION normalizar_textos_maiusculos() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dados jsonb; coluna record; valor text;
BEGIN
  dados := to_jsonb(NEW);
  FOR coluna IN SELECT column_name FROM information_schema.columns
    WHERE table_schema=TG_TABLE_SCHEMA AND table_name=TG_TABLE_NAME AND data_type IN ('text','character varying','character')
  LOOP
    valor := dados->>coluna.column_name;
    IF valor IS NOT NULL THEN
      IF coluna.column_name='email' THEN dados := jsonb_set(dados,ARRAY[coluna.column_name],to_jsonb(lower(btrim(valor))));
      ELSIF coluna.column_name NOT IN ('senha_hash','token_hash','arquivo_path','arquivo_tr_path','arquivo_contrato_path','arquivo_empenho_path','foto_url') THEN
        dados := jsonb_set(dados,ARRAY[coluna.column_name],to_jsonb(upper(btrim(valor))));
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_populate_record(NEW,dados);
END $$;

CREATE OR REPLACE FUNCTION auditar_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; old_json jsonb; new_json jsonb;
BEGIN
  actor := NULLIF(current_setting('app.usuario_id',true),'')::uuid;
  IF TG_OP <> 'INSERT' THEN old_json := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_json := to_jsonb(NEW); END IF;
  INSERT INTO auditoria(user_id,tabela,operacao,antes,depois) VALUES(actor,TG_TABLE_NAME,TG_OP,old_json,new_json);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION notificar_alteracao_empresa() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entidade jsonb; empresa uuid; evento uuid; contrato uuid;
BEGIN
  entidade := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME IN ('eventos','movimentacoes') THEN
    empresa := (entidade->>'empresa_id')::uuid;
  ELSIF TG_TABLE_NAME='contratos' THEN
    SELECT e.empresa_id INTO empresa FROM eventos e WHERE e.id=(entidade->>'evento_id')::uuid;
  ELSIF TG_TABLE_NAME='recebimentos_banda' THEN
    SELECT e.empresa_id INTO empresa FROM contratos c JOIN eventos e ON e.id=c.evento_id WHERE c.id=(entidade->>'contrato_id')::uuid;
  ELSIF TG_TABLE_NAME='cobrancas' THEN
    SELECT e.empresa_id INTO empresa FROM contratos c JOIN eventos e ON e.id=c.evento_id WHERE c.id=(entidade->>'contrato_id')::uuid;
  END IF;
  IF empresa IS NOT NULL THEN
    PERFORM pg_notify('camarote_realtime',json_build_object('table',TG_TABLE_NAME,'operation',TG_OP,'empresa_id',empresa,'id',entidade->>'id')::text);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION bloquear_contrato(p_contrato uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_soma numeric; v_cache numeric; v_evento uuid;
BEGIN
  SELECT c.evento_id,e.cache INTO v_evento,v_cache FROM contratos c JOIN eventos e ON e.id=c.evento_id WHERE c.id=p_contrato FOR UPDATE OF c,e;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  SELECT COALESCE(SUM(valor),0) INTO v_soma FROM negociacoes WHERE contrato_id=p_contrato;
  IF v_soma <> v_cache THEN RAISE EXCEPTION 'A soma das negociações (R$ %) deve ser igual ao cachê do evento (R$ %)',v_soma,v_cache USING ERRCODE='check_violation'; END IF;
  UPDATE contratos SET bloqueado=true,updated_at=now() WHERE id=p_contrato;
  UPDATE eventos SET bloqueado=true,situacao_contrato=true,updated_at=now() WHERE id=v_evento;
END $$;

CREATE OR REPLACE FUNCTION validar_evento_agenda() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM eventos e WHERE e.artista_id=NEW.artista_id AND e.id IS DISTINCT FROM NEW.id
      AND (e.inicio AT TIME ZONE 'America/Fortaleza')::date=(NEW.inicio AT TIME ZONE 'America/Fortaleza')::date
      AND ((NEW.tipo_agendamento='bloqueado') OR e.tipo_agendamento='bloqueado')) THEN
    RAISE EXCEPTION 'Já existe um evento ou bloqueio para este artista nesta data' USING ERRCODE='exclusion_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER eventos_validar_agenda BEFORE INSERT OR UPDATE OF artista_id,inicio,tipo_agendamento ON eventos FOR EACH ROW EXECUTE FUNCTION validar_evento_agenda();

CREATE OR REPLACE FUNCTION validar_recebimento_banda() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_valor numeric; v_recebido numeric;
BEGIN
  SELECT valor INTO v_valor FROM negociacoes WHERE id=NEW.negociacao_id AND contrato_id=NEW.contrato_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negociação não pertence ao contrato informado'; END IF;
  SELECT COALESCE(SUM(valor),0) INTO v_recebido FROM recebimentos_banda WHERE negociacao_id=NEW.negociacao_id AND id IS DISTINCT FROM NEW.id;
  IF v_recebido + NEW.valor > v_valor THEN RAISE EXCEPTION 'Recebimento ultrapassa o saldo da negociação'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recebimentos_banda_validar BEFORE INSERT OR UPDATE ON recebimentos_banda FOR EACH ROW EXECUTE FUNCTION validar_recebimento_banda();

DO $$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['empresas','usuarios','artistas','contratantes','clientes','fornecedores','bancos','planos_contas','eventos','contratos','cobrancas','negociacoes','recebimentos_banda','historicos_cobranca','contas','movimentacoes','cheques','documentos_rh','planos_viagem','planos_viagem_lancamentos'] LOOP
    EXECUTE format('CREATE TRIGGER %I_normalizar_textos BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION normalizar_textos_maiusculos()',tabela,tabela);
    EXECUTE format('CREATE TRIGGER %I_auditoria AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION auditar_alteracao()',tabela,tabela);
  END LOOP;
  FOREACH tabela IN ARRAY ARRAY['eventos','contratos','recebimentos_banda','cobrancas','movimentacoes'] LOOP
    EXECUTE format('CREATE TRIGGER %I_realtime AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION notificar_alteracao_empresa()',tabela,tabela);
  END LOOP;
END $$;

COMMIT;
