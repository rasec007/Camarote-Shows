# Andamento da refatoração

## Regra de comunicação

Ao concluir cada fase, apresentar um resumo da entrega e listar todas as fases restantes pelo título, com uma breve descrição do que cada uma entrega.

## Regra de versionamento

Ao concluir uma fase, executar as validações, criar um commit e fazer push para o GitHub quando houver autenticação válida e um remote configurado. Se a autenticação estiver ausente ou inválida, concluir a implementação e as validações, informar o bloqueio e orientar a autenticação pelo terminal; depois que a conexão estiver pronta, publicar a fase concluída. Não incluir `.env` nem outros segredos no commit.

Para autenticar o GitHub CLI no terminal, executar `gh auth login -h github.com --git-protocol https --web` e concluir o fluxo no navegador. Validar com `gh auth status`. No primeiro envio, criar o repositório privado `Camarote-Shows` com `gh repo create Camarote-Shows --private --source=. --remote=origin --push` depois de adicionar e commitar as alterações locais. Nas fases seguintes, enviar os commits com `git push origin main`.

## Fases do plano mestre

1. **Setup do monorepo** — Estruturar `server`, `web`, `mobile` e `shared`; configurar PostgreSQL/Docker, migrations, autenticação JWT e convites/reset via WAHA.
2. **Casca web e mobile** — Criar layouts responsivos, menus por perfil, troca de empresa padrão, Socket.io e logout.
3. **Cadastros** — Implementar empresas e bancos, clientes, fornecedores, artistas, contratantes, usuários e plano de contas.
4. **Eventos** — Implementar orçamentos, bloqueios, conflitos de agenda, alertas, calendário e mapa.
5. **Contratos** — Implementar contrato 1:1 por evento, checklist, arquivos, negociação, bloqueio, cancelamento e cobrança.
6. **Banda e cobrança** — Implementar painel calculado por view, recebimentos, baixas de produção/diária e histórico do camarote.
7. **Financeiro completo** — Implementar contas e saldos por views, retenções, parcelas, movimentações, filtros e exportações.
8. **Cheques e RH** — Reconstruir cheques, contracheques/IR e plano de viagem, integrados às permissões e menus.
9. **Dashboard** — Entregar indicadores e resumo financeiro com escopo e cálculos definidos.
10. **Auditoria** — Registrar alterações automaticamente via triggers PostgreSQL e permitir consulta conforme permissões.

## Estado atual

- **Fase 1 — Setup do monorepo:** concluída em 14/10/2026. Inclui workspace pnpm, API Fastify, pacote compartilhado Zod, apps React/Vite web e PWA mobile, PostgreSQL 16, schema inicial completo, autenticação JWT com refresh cookie, Argon2id, convite e redefinição via WAHA, Socket.io com PostgreSQL LISTEN/NOTIFY, MinIO privado com buckets e URLs assinadas e definição de implantação no VPS via EasyPanel.
- **Fase 2 — Casca web e mobile:** concluída em 14/10/2026. Inclui shell responsivo web, shell mobile-first PWA, menus filtrados por perfil, seleção de empresa padrão com verificação de vínculo no backend, logout acessível, autenticação nos dois clientes, Socket.io e invalidação de cache TanStack Query. Telas dos módulos seguem como placeholders das próximas fases.
- **Fase 3 — Cadastros:** concluída em 15/10/2026. Entrega: APIs e telas para empresas/bancos, clientes, fornecedores, artistas, contratantes, usuários com convites WAHA e vínculos de empresa/artista, plano de contas, validação CPF/CNPJ, normalização no backend e bloqueios de exclusão. Migration 003 aplica escopo por empresa.
- **Fase 4 — Eventos:** concluída em 15/10/2026. Entrega: criação/edição de orçamento e bloqueio, checagem de conflito por artista/dia, alerta visual e WhatsApp via WAHA, agenda FullCalendar no web e fluxos mobile-first de proposta/bloqueio. A API impede exclusão de evento com contrato.
- **Fase 5 — Contratos:** concluída em 15/10/2026. Entrega: geração 1:1 por evento, checklist, anexos privados MinIO/S3 com URL assinada, renegociação transacional, parcelas previstas, bloqueio por igualdade numérica exata no PostgreSQL, cancelamento e envio para cobrança com notificação Evolution. Migration 004 associa arquivos privados aos contratos.
- **Fase 6 — Banda e cobrança:** concluída em 15/10/2026. Entrega: API e telas de Banda/Cobrança, filtros de período/estado/status/diária/produção, recebimentos associados à negociação com validação transacional concorrente no PostgreSQL, view `v_banda` com recebido/retido/saldo, baixa de produção/diária e histórico do Camarote com valor. O envio para cobrança grava o valor de Camarote e a data. Migration 005 atualiza a view e instala o limite; migrations 006/007 suportam importação auditável e removem default inválido de recebimento.
- **Fase 7 — Financeiro completo:** concluída em 15/10/2026. Entrega: telas e APIs para contas a receber/pagar, retenções e ajustes de valor final, parcelas com trava de saldo, movimentações avulsas com todos os dados obrigatórios, filtros por período/plano/banco, saldos pelas views, exportação XLSX e impressão/PDF pelo navegador. Migration 008 adiciona anexos financeiros privados, índices e validação transacional no banco. Contas quitadas são exibidas como “Pago”.
- **Fase 8 — Cheques e RH:** concluída em 15/10/2026. Entrega: cheques por empresa/banco com número único, criação/edição/baixa/exclusão, filtros, impressão e XLSX; contracheque e rendimento/IR com upload privado MinIO/S3, filtros por ano/mês/tipo e acesso do funcionário apenas aos próprios documentos; plano de viagem com adiantamentos, despesas, anexos privados, saldo calculado por `v_planos_viagem` e encerramento. Migrations 009 e 010.
- **Fase 9 — Dashboard:** concluída em 15/10/2026. Entrega: primeira tela após login no desktop e mobile, com rótulo Dashboard no menu; resumo mensal por categoria e plano, filtrado por empresa/ano/banco e calculado por `v_dashboard_mensal`; indicadores de eventos do mês, contratos bloqueados, contas a receber/pagar e vencidas. Perfis sem permissão de relatórios veem o painel inicial sem dados financeiros. Migration 011.
- **Fase 10 — Auditoria:** concluída em 15/10/2026. Entrega: trigger PostgreSQL genérico para operações INSERT/UPDATE/DELETE, atribuição do usuário autenticado via contexto assíncrono do request e contexto transacional do driver `pg`, captura de antes/depois sem hash de senha, consulta por empresa/período/tabela/operação e detalhe dos registros com acesso restrito à administração.
- **Fase 11 — Migração de dados:** concluída em 15/10/2026 para os 23 CSVs exportados disponíveis. A carga no PostgreSQL nativo contém 3 empresas legadas, 16 artistas, 5 clientes, 4 contratantes, 3 fornecedores, 3 bancos, 5 eventos, 1 contrato, 11 usuários e 12 auditorias legadas. Os 10 vínculos usuário–artista cujos artistas não constam no export foram identificados e ignorados; 7 vínculos válidos foram importados. Os CSVs financeiros contêm somente linhas sem dados de negócio, portanto as views de saldo estão vazias. Nenhum `unique id` duplicado foi encontrado. A busca por `bubble_id` e o tratamento de auditorias vazias foram corrigidos; nova prévia com rollback passou após a carga.

## Próxima etapa do plano original (§18.5)

- **Etapa 12 — Homologação e corte:** em andamento. Homologar os fluxos lado a lado por perfil, corrigir divergências encontradas e preparar a entrada em produção no VPS/EasyPanel. Evidências e pendências em [`homologacao-fase12.md`](homologacao-fase12.md).
- **Correção durante a homologação:** artistas agora formam um catálogo global independente de empresa (migration 012). O usuário mantém vínculos separados com empresas e artistas; no perfil, aparecem todos os artistas ativos. Eventos continuam vinculados à empresa em que são criados.

## Validação e ambiente de teste — 15/10/2026

- `pnpm build` concluiu para server, shared, web e mobile; `git diff --check` sem erros.
- Migrations 002 a 007 aplicadas no PostgreSQL local do WSL (porta 5434). API em `http://localhost:3333/health` responde `status: ok`.
- Os CSVs existentes em `db/` foram analisados, mapeados e carregados pelo script idempotente `server/src/import-legacy-csv.ts`. A carga incluiu 3 empresas, 16 artistas, 5 clientes, 4 contratantes, 3 fornecedores, 3 bancos, 5 eventos, 1 contrato, 11 usuários e 12 auditorias. Saldos legados não são importados; são recalculados por views. O vínculo de evento ausente no CSV do contrato foi resolvido por correspondência única de artista e data. Usuários sem hash de senha foram importados inativos; vínculos artista ausentes no CSV foram ignorados.
- A revisão visual adotou `exemplo/telas/index.html` como referência para a aplicação: moldura externa grafite, painel branco arredondado, cabeçalho superior com navegação em pílulas, tipografia Plus Jakarta Sans, cartões claros e formulários suaves. A tela de login segue a composição de `exemplo/telas/login.png`, com logo horizontal. Os campos e regras do financeiro conferem com §11.1–11.2, R28–R35 e §14.
- Migration 008 aplicada no PostgreSQL local. Os endpoints `/financeiro/opcoes`, `/financeiro/contas?tipo=receber` e `/financeiro/movimentacoes` responderam HTTP 200 após autenticação. `pnpm build` e `git diff --check` concluíram sem erros; Vite mantém o aviso já conhecido de bundle web acima de 500 KB.
- As rotas de catálogo, eventos e contratos responderam HTTP 200 após o login. A API de Banda e Cobrança respondeu HTTP 200; as listas vieram vazias porque o CSV não contém negociações/recebimentos e o contrato importado não está bloqueado.
- A integração anterior com a Evolution API foi substituída por WAHA; mensagens exigem `WAHA_API_URL`, `WAHA_API_KEY` e `WAHA_SESSION` no ambiente da API.
- Web em `http://localhost:5173/` e PWA mobile em `http://localhost:5174/` estão servindo para inspeção visual. Login foi validado com a conta bootstrap, sem exibir a senha.
- O push das fases ainda está pendente: autenticação GitHub estava inválida na última verificação. Reautenticar no terminal e publicar os commits locais.

## Validação das Fases 8–10 — 15/10/2026

- Migrations 009, 010 e 011 aplicadas ao PostgreSQL local. As views `v_planos_viagem` e `v_dashboard_mensal` e as consultas de cheques, RH, resumo mensal e auditoria foram verificadas no banco.
- Rotas autenticadas `/dashboard/resumo`, `/financeiro/cheques`, `/rh/documentos`, `/viagens` e `/auditoria` responderam HTTP 200 com a conta local de administração.
- `pnpm build` concluiu para server, shared, web e mobile; `git diff --check` sem erros. Permanece o aviso de bundle web acima de 500 KB por causa do ExcelJS e da aplicação.
