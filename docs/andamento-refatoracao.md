# Andamento da refatoração

## Regra de comunicação

Ao concluir cada fase, apresentar um resumo da entrega e listar todas as fases restantes pelo título, com uma breve descrição do que cada uma entrega.

## Regra de versionamento

Ao concluir uma fase, executar as validações, criar um commit e fazer push para o GitHub quando houver autenticação válida e um remote configurado. Se a autenticação estiver ausente ou inválida, concluir a implementação e as validações, informar o bloqueio e orientar a autenticação pelo terminal; depois que a conexão estiver pronta, publicar a fase concluída. Não incluir `.env` nem outros segredos no commit.

Para autenticar o GitHub CLI no terminal, executar `gh auth login -h github.com --git-protocol https --web` e concluir o fluxo no navegador. Validar com `gh auth status`. No primeiro envio, criar o repositório privado `Camarote-Shows` com `gh repo create Camarote-Shows --private --source=. --remote=origin --push` depois de adicionar e commitar as alterações locais. Nas fases seguintes, enviar os commits com `git push origin main`.

## Fases do plano mestre

1. **Setup do monorepo** — Estruturar `server`, `web`, `mobile` e `shared`; configurar PostgreSQL/Docker, migrations, autenticação JWT e convites/reset via Evolution API.
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

- **Fase 1 — Setup do monorepo:** concluída em 14/10/2026. Inclui workspace pnpm, API Fastify, pacote compartilhado Zod, apps React/Vite web e PWA mobile, PostgreSQL 16, schema inicial completo, autenticação JWT com refresh cookie, Argon2id, convite e redefinição via Evolution API, Socket.io com PostgreSQL LISTEN/NOTIFY, MinIO privado com buckets e URLs assinadas e definição de implantação no VPS via EasyPanel.
- **Fase 2 — Casca web e mobile:** concluída em 14/10/2026. Inclui shell responsivo web, shell mobile-first PWA, menus filtrados por perfil, seleção de empresa padrão com verificação de vínculo no backend, logout acessível, autenticação nos dois clientes, Socket.io e invalidação de cache TanStack Query. Telas dos módulos seguem como placeholders das próximas fases.
- **Fase 3 — Cadastros:** pendente.
- **Fase 4 — Eventos:** pendente.
- **Fase 5 — Contratos:** pendente.
- **Fase 6 — Banda e cobrança:** pendente.
- **Fase 7 — Financeiro completo:** pendente.
- **Fase 8 — Cheques e RH:** pendente.
- **Fase 9 — Dashboard:** pendente.
- **Fase 10 — Auditoria:** pendente; a estrutura de trilha já existe na migration, e a interface/filtros pertencem a esta fase.
