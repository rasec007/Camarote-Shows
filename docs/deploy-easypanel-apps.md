# Deploy no EasyPanel com três aplicações

Use três serviços **App** separados no mesmo projeto do EasyPanel. Todos usam o repositório `https://github.com/rasec007/Camarote-Shows.git`, branch `main`, **Build Path** `/` e builder **Dockerfile**. O caminho do Dockerfile muda por aplicação; `docker-compose.easypanel.yml` não é um Dockerfile.

Os valores abaixo são exemplos de nomes e URLs. Configure credenciais novas diretamente no ambiente da aplicação, sem publicá-las no Git ou em logs. O EasyPanel passa variáveis de ambiente como argumentos ao build; mantenha no painel somente as variáveis necessárias a cada serviço.

## 1. API

- Serviço sugerido: `camarote-api`.
- Dockerfile: `server/Dockerfile`.
- Domínio sugerido: `api.appcamaroteshows.c2net.com.br`, HTTPS, porta interna `3333`.
- Variáveis de execução:

```dotenv
NODE_ENV=production
SERVER_HOST=0.0.0.0
SERVER_PORT=3333
DATABASE_URL=postgresql://USUARIO:SENHA_CODIFICADA@HOST_INTERNO:5432/NOME_DO_BANCO
JWT_ACCESS_SECRET=SEGREDO_ALEATORIO_COM_32_OU_MAIS_CARACTERES
JWT_REFRESH_SECRET=OUTRO_SEGREDO_ALEATORIO_COM_32_OU_MAIS_CARACTERES
WEB_ORIGIN=https://appcamaroteshows.c2net.com.br
MOBILE_ORIGIN=https://mobile.appcamaroteshows.c2net.com.br
COOKIE_SECURE=true
S3_ENDPOINT=https://ENDPOINT_S3_ACESSIVEL_PELA_API
S3_PUBLIC_ENDPOINT=https://ENDPOINT_S3_ACESSIVEL_PELO_NAVEGADOR
S3_ACCESS_KEY=CHAVE_DE_APLICACAO
S3_SECRET_KEY=SEGREDO_DA_APLICACAO
S3_REGION=us-east-1
BOOTSTRAP_ADMIN_EMAIL=EMAIL_INICIAL
BOOTSTRAP_ADMIN_PASSWORD=SENHA_INICIAL_COM_12_OU_MAIS_CARACTERES
BOOTSTRAP_ADMIN_NAME=NOME_DO_ADMINISTRADOR
BOOTSTRAP_COMPANY_NAME=NOME_DA_EMPRESA_INICIAL
```

A senha em `DATABASE_URL` precisa ser codificada para URL quando tiver caracteres reservados, como `@` (`%40`). `localhost` dentro da aplicação indica o próprio contêiner, não o PostgreSQL do VPS. Se usar um banco já populado, as quatro variáveis `BOOTSTRAP_*` são opcionais; o bootstrap não modifica usuários existentes. Após o primeiro login, remova as quatro variáveis e faça novo deploy. `PG_POOL_MAX` é opcional; `DB_POOL_MAX` não é usado.

O comando inicial do contêiner aplica as migrations, executa o bootstrap seguro e inicia a API. Verifique `https://api.appcamaroteshows.c2net.com.br/health` antes de publicar os frontends. A resposta esperada é `{"status":"ok"}`. Configure `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE` somente se for testar convites e redefinições por WhatsApp.

Se o MinIO for um serviço externo a este projeto, crie os buckets privados `contratos`, `financeiro`, `rh` e `arquivos` e dê acesso à chave da aplicação. A API armazena os arquivos nesse serviço; os frontends usam as URLs assinadas geradas pela API.

## 2. Web

- Serviço sugerido: `camarote-web`.
- Dockerfile: `web/Dockerfile`.
- Domínio: `appcamaroteshows.c2net.com.br`, HTTPS, porta interna `80`.
- Única variável necessária para o build: `VITE_API_URL=https://api.appcamaroteshows.c2net.com.br` (substitua pelo domínio real da API).
- Não configure credenciais do banco, JWT, MinIO ou Evolution nesta aplicação.

## 3. Mobile

- Serviço sugerido: `camarote-mobile`.
- Dockerfile: `mobile/Dockerfile`.
- Domínio: `mobile.appcamaroteshows.c2net.com.br`, HTTPS, porta interna `80`.
- Única variável necessária para o build: `VITE_API_URL=https://api.appcamaroteshows.c2net.com.br` (o mesmo domínio usado no web).
- Não configure credenciais do banco, JWT, MinIO ou Evolution nesta aplicação.

## Ordem de validação

1. API: build, migrations, bootstrap, `/health` e login inicial.
2. Web: página inicial, login, cadastro e atualização após recarregar.
3. Mobile: instalação PWA, login, navegação e atualização em tempo real.
4. Arquivos: upload e download assinado em cada módulo que os utiliza.

Os arquivos CSV locais não estão no Git e não são importados pelo deploy. Transfira-os ou restaure um backup no banco do VPS separadamente se desejar homologar os dados legados.
