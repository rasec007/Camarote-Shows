# Roteiro de comparação com o Bubble — Fase 12

Use uma conta sua no Bubble antigo. Faça as consultas abaixo sem enviar e-mail, senha ou dados pessoais no chat. No sistema novo, acesse `http://localhost:5173/` (web) ou `http://localhost:5174/` (mobile), enquanto os servidores locais estiverem em execução.

Registre para cada item: empresa selecionada, filtros usados, resultado no Bubble, resultado no sistema novo e, se houver diferença, uma captura de tela com dados sensíveis ocultos. Compare sempre a mesma empresa e os mesmos filtros. A conta administradora local já permite consultar os módulos no sistema novo; as contas legadas importadas estão inativas e não têm senha.

| Passo | Onde olhar | O que registrar e comparar |
|---|---|---|
| 1 | Empresas | Nomes e quantidade das empresas legadas. O banco novo contém 3 empresas importadas e 1 empresa local de bootstrap. |
| 2 | Artistas, clientes, contratantes, fornecedores e bancos | Quantidade e alguns registros identificados pelo nome. A carga nova contém, respectivamente, 16, 5, 4, 3 e 3 registros. |
| 3 | Agenda e eventos | Para cada uma das 3 empresas legadas, filtre o mesmo período e compare artista, data, local, status e valores dos 5 eventos importados. No sistema novo, a lista mostra apenas os eventos da empresa selecionada. |
| 4 | Contratos | Localize o contrato importado pelo artista e pela data; compare evento, contratante, valores, status e checklist. |
| 5 | Banda, cobrança e financeiro | Verifique se há negociações, recebimentos, contas, movimentações ou cheques no Bubble. Os CSVs entregues para a carga tinham somente linhas vazias nesses conjuntos, então essas listas e os saldos estão vazios no banco novo. Se o Bubble tiver registros, anote a tela, a empresa e o período: haverá dados faltantes para exportar antes de validar cálculos. |
| 6 | Dashboard | Com a mesma empresa e mês, compare os indicadores de eventos e contratos. Indicadores financeiros dependem de uma exportação com lançamentos reais. |
| 7 | Usuários e permissões | Anote quais dos perfis administrador, financeiro, contrato, agenda, vendedor e produtor existem no Bubble e quais módulos cada um consegue abrir. Não compartilhe credenciais. A ativação e os testes desses perfis no sistema novo ficam pendentes até termos contas de homologação. |
| 8 | Web e mobile | Repita a consulta de eventos e do contrato nos dois clientes novos. Anote campos ausentes, erros e diferenças de navegação em relação ao Bubble. |

Não crie, edite, bloqueie, dê baixa ou envie cobrança em dados reais durante esta comparação. Esses fluxos precisam de registros próprios de homologação. Também não execute o corte para produção com base apenas nas consultas acima: anexos/MinIO, testes de escrita por perfil e infraestrutura de produção continuam pendentes.

Para relatar um problema, envie apenas: número do passo, empresa e filtros, resultado esperado, resultado obtido e captura de tela sem informações sensíveis. Nunca envie senhas.
