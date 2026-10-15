BEGIN;

CREATE OR REPLACE VIEW v_dashboard_mensal AS
SELECT m.empresa_id,m.banco_id,m.plano_contas_id,
       extract(year FROM m.data)::integer AS ano,
       extract(month FROM m.data)::integer AS mes,
       sum(CASE WHEN m.tipo='entrada' THEN m.valor ELSE -m.valor END)::numeric(14,2) AS resultado
FROM movimentacoes m
GROUP BY m.empresa_id,m.banco_id,m.plano_contas_id,extract(year FROM m.data),extract(month FROM m.data);

COMMIT;
