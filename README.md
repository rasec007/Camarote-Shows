# Camarote Shows

Monorepo do ERP de agenciamento de shows. A especificação funcional fica em [`docs/camarote-shows-especificacao-refatoracao.md`](docs/camarote-shows-especificacao-refatoracao.md); o estado e a regra de relatório por fase estão em [`docs/andamento-refatoracao.md`](docs/andamento-refatoracao.md).

## Estrutura

- `server`: API Fastify, autenticação, PostgreSQL e Socket.io.
- `shared`: schemas Zod e tipos compartilhados.
- `web`: aplicação React/Vite para desktop e telas responsivas.
- `mobile`: aplicação React/Vite mobile-first com PWA.
- `server/migrations`: migrations SQL do PostgreSQL.
- `minio`: política de acesso restrito e criação automática dos buckets privados.

## Desenvolvimento local

Use Node.js 22+ e pnpm 10+. Copie `.env.example` para `.env`, configure segredos JWT aleatórios com pelo menos 32 caracteres e preencha as credenciais da Evolution API. O padrão de desenvolvimento do Compose é exclusivo para uso local.

```sh
pnpm install
docker compose up -d postgres minio minio-init
docker compose exec -T postgres psql -U camarote -d camarote_shows < server/migrations/001_initial_schema.sql
docker compose exec -T postgres psql -U camarote -d camarote_shows < server/migrations/002_arquivos.sql
pnpm --filter @camarote/server bootstrap:admin
pnpm dev
```

Antes do bootstrap, configure `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME` e `BOOTSTRAP_COMPANY_NAME` no `.env`. O comando só cria a empresa e o primeiro superadministrador quando ainda não há usuários.

A API inicia em `http://localhost:3333`, o web em `http://localhost:5173` e o mobile em `http://localhost:5174`. O banco publica a porta `5433` por padrão para não conflitar com instalações locais do PostgreSQL.

Configure `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` e `POSTGRES_PORT` no `.env` para mudar os valores locais. Em produção, use segredos próprios e credenciais restritas.

O MinIO local fica em `http://localhost:9000` e o console administrativo em `http://localhost:9001`. O Compose cria os buckets privados `contratos`, `financeiro`, `rh` e `arquivos` e um usuário de aplicação com acesso limitado a eles. A API grava somente metadados no PostgreSQL e entrega URLs assinadas com validade de cinco minutos; os documentos não ficam públicos.

## VPS com EasyPanel

Para publicar API, web e mobile como três aplicações App independentes, siga [`docs/deploy-easypanel-apps.md`](docs/deploy-easypanel-apps.md). Cada aplicação usa o Build Path `/` e o Dockerfile da sua pasta.

O arquivo [`docker-compose.easypanel.yml`](docker-compose.easypanel.yml) prepara os serviços PostgreSQL 16, MinIO, API, web e PWA mobile com volumes persistentes para banco e arquivos. O domínio principal é `https://appcamaroteshows.com.br`, o PWA mobile usa `https://mobile.appcamaroteshows.com.br` e os links privados de arquivos usam `https://arquivos.appcamaroteshows.com.br`. No EasyPanel, conecte o repositório Git, use esse arquivo Compose e configure os segredos de produção como variáveis do projeto: `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_ACCESS_KEY` e `S3_SECRET_KEY`. Gere valores fortes e exclusivos para o VPS. Configure os registros DNS desses três domínios para o VPS e publique `web` e `mobile` em seus respectivos domínios.

No primeiro deploy de um banco vazio, configure também `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (mínimo de 12 caracteres), `BOOTSTRAP_ADMIN_NAME` e `BOOTSTRAP_COMPANY_NAME`. O serviço temporário `bootstrap-admin` cria o primeiro superadministrador após as migrations. Em um banco que já tenha usuários, ele termina sem alterar dados. Depois de confirmar o login, remova as quatro variáveis de bootstrap do ambiente do EasyPanel e faça novo deploy. Use apenas caracteres seguros em URL (`A-Z`, `a-z`, `0-9`, `_` e `-`) na senha do PostgreSQL, pois o Compose a insere em `DATABASE_URL`. O banco criado no VPS começa sem os dados CSV do ambiente local; esses arquivos não são publicados pelo Git.

No painel do EasyPanel, encaminhe o serviço `minio` pela porta interna `9000` em `arquivos.appcamaroteshows.com.br`. Não publique a porta `9001` do console administrativo na internet aberta; restrinja-a pela autenticação/rede do painel ou VPN. O tráfego da aplicação e os links assinados usam o endpoint S3 público, enquanto a API usa `http://minio:9000` pela rede interna. Mantenha backups externos dos volumes do PostgreSQL e do MinIO: volumes no mesmo VPS protegem contra reinício de contêiner, mas não contra perda do servidor.

## Sessão e notificações

O login retorna um access token de 15 minutos e grava um refresh token rotativo em cookie `HttpOnly`. Todas as mensagens externas para usuários devem ser enviadas pelo WhatsApp via `EvolutionApiService`, incluindo convites de novos usuários, redefinições de senha e avisos operacionais. O e-mail identifica a conta; o destinatário das mensagens é o celular/WhatsApp cadastrado. Convites e redefinições usam links de uso único. Números brasileiros com DDD recebem o DDI 55 automaticamente; números de outros países devem incluir `+` e DDI. O usuário precisa estar ativo em cada requisição autenticada. Socket.io autentica pelo access token e distribui notificações PostgreSQL apenas às empresas vinculadas ao usuário.

A Fase 2 entrega o shell web/mobile, seleção de empresa padrão vinculada ao usuário, menus filtrados por perfil, logout sempre acessível no PWA e invalidação de cache via Socket.io. As telas dos módulos continuam como espaços reservados até suas fases de implementação.

## Publicação por fase

Depois de validar cada fase, faça commit e push para o GitHub se o CLI estiver autenticado e o remote configurado. Para autenticar pelo terminal, use `gh auth login -h github.com --git-protocol https --web` e confirme com `gh auth status`. Na primeira publicação, crie o repositório privado com `gh repo create Camarote-Shows --private --source=. --remote=origin --push`; primeiro adicione e commite as alterações locais. Nas fases seguintes, use `git push origin main`. O arquivo `.env` não deve ser adicionado ao Git.

## Decisões registradas

A especificação deixa perguntas de autorização em aberto. Até a matriz final ser definida, a API aplica a matriz indicada no prompt mestre e exige vínculo explícito com artista; ausência de vínculo não concede acesso implícito. Ao concluir cada fase, o relatório lista o que foi entregue e descreve as fases restantes; acompanhe [`docs/andamento-refatoracao.md`](docs/andamento-refatoracao.md).
