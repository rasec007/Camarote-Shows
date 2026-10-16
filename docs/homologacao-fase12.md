# Homologação da Fase 12 — 15/10/2026

## Estado

Em andamento. Nenhum corte ou publicação em produção foi executado.

## Dados de partida

- PostgreSQL 18 nativo no WSL, banco `camarote_db` na porta 5434, com 12 migrations aplicadas.
- Carga de 23 CSVs exportados: 3 empresas legadas, 16 artistas, 5 clientes, 4 contratantes, 3 fornecedores, 3 bancos, 5 eventos, 1 contrato, 11 usuários e 12 auditorias legadas.
- Há também uma empresa local criada no bootstrap. Dez usuários legados estão inativos e sem senha importada; a conta bootstrap está ativa.
- Dos 17 vínculos usuário–artista exportados, 7 referem artistas presentes no CSV e foram importados. Os outros 10 apontam para artistas ausentes no export.
- Os arquivos de negociações, recebimentos, contas, movimentações, cheques, RH e viagens contêm somente linhas sem dados de negócio. As views `contas_saldo`, `movimentacoes_saldo` e `v_dashboard_mensal` retornam zero linhas. Não há saldo legado a comparar neste conjunto.

## Verificações concluídas

| Verificação | Resultado |
|---|---|
| Importação repetida em transação com rollback | Passou após corrigir a busca de `bubble_id` sem diferenciar maiúsculas e o preenchimento padrão das auditorias. |
| Integridade referencial | Nenhum contrato sem evento; nenhum evento sem artista. |
| Empresas padrão | Exatamente uma. |
| Login com administrador bootstrap | HTTP 200. |
| `/auth/me`, cadastros de empresas/artistas, eventos e contratos | HTTP 200. |
| Banda, cobrança, opções/contas/movimentações financeiras, dashboard, cheques, RH, viagens e auditoria | HTTP 200. Listas financeiras vazias conforme os CSVs. |
| Acesso anônimo a cadastros e acesso com token de usuário legado inativo | HTTP 401 nos dois casos. |
| `pnpm build`, `pnpm lint` e `git diff --check` | Passaram. O build web mantém aviso de bundle acima de 500 KB. |

Correção do catálogo de artistas: a migration 012 retirou `artistas.empresa_id`. A API agora retorna os 16 artistas globais no cadastro e os 15 ativos na aba Perfil do usuário; o artista inativo fica fora das opções de vínculo. A prévia de reimportação dos 23 CSVs passou com rollback após a mudança.

Permissão de relatórios: `pode_visualizar_relatorios` pertence ao usuário e é selecionada em Dados básicos. Os vínculos com artistas guardam apenas `acesso_total` por artista. O dashboard libera relatórios ao usuário com essa permissão, independentemente dos artistas vinculados; administradores têm acesso pelo perfil.

## Pendente para concluir a fase

A comparação manual com o Bubble está descrita em [`roteiro-comparacao-bubble-fase12.md`](roteiro-comparacao-bubble-fase12.md). O usuário escolheu executar essa comparação sem compartilhar credenciais.

1. Homologar os fluxos no web e no mobile com usuários ativos dos perfis administrador, financeiro, contrato, agenda, vendedor e produtor. Os usuários legados sem senha precisam de ativação segura; não enviar convites sem validar destinatários.
2. Comparar os fluxos e cálculos lado a lado com o aplicativo Bubble original. É necessário acesso ao ambiente legado para validar os resultados visuais e operacionais.
3. Exercitar criação, edição, bloqueio, cobrança, baixa, exportações e anexos com dados de homologação. Os CSVs atuais não trazem lançamentos financeiros para validar saldos não vazios.
4. Disponibilizar o armazenamento de arquivos. As imagens MinIO fixadas nos Compose falharam ao baixar neste ambiente; uploads e links assinados ainda não foram homologados.
5. Validar a configuração de produção no EasyPanel: segredos, DNS, TLS, migrations, persistência e restauração de backup. Executar o corte somente após estas verificações e aprovação da implantação.
6. Publicar as alterações no GitHub quando a autenticação do CLI estiver válida. A última verificação retornou token inválido.
