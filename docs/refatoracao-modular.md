# Modularização incremental

Base: `main` em `a0aa68b1436e8c272d0aea78c203eaca85e55c95`.
Branch: `codex/modular-orcamentos-financeiro`.

## Primeira entrega

- Orçamentos: contrato compartilhado entre tela/API, repositório por unidade e montagem pura da resposta.
- Financeiro: cálculos sem dependência de banco; serviços e repositórios para listar, receber e cancelar pagamentos.
- As URLs, respostas, tabelas, identificadores e regras anteriores continuam compatíveis. A fachada `lib/helpers/pagamentoFlow.ts` atende consumidores antigos; telas usam `modules/financeiro/public.ts`.
- Testes de integração executam SQL em SQLite em memória com o schema real. Apenas o transporte D1 e a autenticação são substituídos; estes testes não simulam as garantias de concorrência do D1 remoto.
- `npm run check:modules` impede dependências de servidor/UI nas regras puras e acesso direto a detalhes internos de outro módulo. A importação `server-only` protege os módulos de servidor no build Next.
- Ambiente Cloudflare `refactor` com D1 e R2 próprios e dados fictícios. Não compartilha recursos com produção nem com a V2 em staging. Autentique fica bloqueado antes de qualquer chamada de rede.

Recebimentos, cancelamentos e saldo/crédito do cliente agora têm serviços e repositórios próprios. A retirada completa dos helpers legados e o cálculo persistente de cobertura continuam pendentes.

## Segunda entrega: saldo e crédito

A extração de comportamento está no commit `a4ca8ed`, separada das correções seguintes para facilitar revisão e retorno. As sete rotas de saldo mantêm URLs e respostas; consulta, crédito, uso, transferência e devoluções são serviços do módulo financeiro. Não houve migração de banco.

Correções desta entrega:

- Extrato e operações exigem autenticação e perfil admin/atendente, seguindo o acesso já exigido pela consulta de saldo.
- Uso de crédito verifica cliente, atendimento e unidade do procedimento. Devolução de procedimento verifica cliente e unidade. Crédito com referência a pagamento exige pagamento ativo do mesmo cliente e unidade.
- O saldo continua global por cliente. Transferência e consulta não recebem filtro de unidade.
- Valores inválidos, IDs incorretos, JSON inválido e transferência para o próprio cliente são rejeitados; cálculos monetários usam centavos.
- Quitar com saldo preserva os estados clínicos `executando` e `concluido`.
- A ficha do cliente envia a unidade selecionada ao devolver um procedimento.

A suíte de saldo usa SQLite com o schema real e cobre também falha intermediária: se o extrato não grava, o saldo não muda. Essa propriedade do batch já existia; não equivale a proteção contra duas requisições concorrentes. Saldo e item continuam sendo lidos antes da transação.

### Dependência para corrigir o recálculo

Hoje o uso de crédito atualiza `itens_atendimento.valor_pago`, enquanto `recalcularFinanceiroItem` recompõe esse campo apenas pelas alocações de pagamentos ativos. A devolução de procedimento zera o campo, mas mantém as alocações do pagamento original. Portanto, o recálculo pode apagar crédito utilizado ou reapresentar valor que já foi devolvido.

Não somar movimentos de saldo indiscriminadamente às alocações. Após devolver um procedimento, cancelar o pagamento original e receber um novo pagamento, um ajuste negativo sem vínculo com a origem pode consumir o recebimento novo. A próxima entrega precisa tratar o ciclo completo:

1. Registrar alocações de crédito com origem na movimentação, item e sessão, em migração aditiva versionada.
2. Vincular cada devolução às alocações exatas de pagamento/crédito que ela libera. A cobertura passa a ser a soma das fontes ainda válidas, sem apagar o histórico.
3. Compartilhar esse cálculo entre item, sessões, orçamento, pagamento e cancelamento; preservar a origem ao encaminhar para agenda.
4. Aplicar operações atômicas, idempotência e validação do saldo restante dentro da transação. Não basta validar o saldo antes do batch.
5. Implementar a regra aprovada: cancelar o pagamento original reverte automaticamente o crédito somente se esse crédito ainda não foi usado nem transferido. Havendo uso ou transferência, bloquear. Decidir pela origem rastreada, não apenas pelo saldo total do cliente; histórico sem origem comprovável exige conciliação antes de reversão automática.
6. Reconciliar o legado somente quando houver origem comprovável, habilitar por unidade e manter leitores compatíveis mesmo ao desligar novas gravações.

Critérios de regressão: crédito usado resiste ao recálculo; devolver e recalcular não recria cobertura; devolver e pagar novamente usa somente a nova cobertura; cancelar pagamento não afeta crédito de outra origem; sessão e comissão acompanham a cobertura; duas tentativas simultâneas não duplicam débito ou devolução. Essas garantias ainda não são oferecidas por esta entrega.

## Validação reproduzível

Usar Node 22 (`.nvmrc`) e `npm ci`.

O Jest fixa `America/Fortaleza` antes de iniciar os testes, pois fixtures legadas usam datas locais sem offset. A mesma base deve ser comparada nesse fuso, inclusive em runners cujo sistema operacional usa UTC. Isso não altera o tratamento de datas em produção.

```sh
npm run typecheck
npm run check:modules
npm run lint:modules
npm run test:modules
npm run test:baseline
npm run build:refactor
```

A base anterior possui 77 testes falhando, registrados individualmente em `test-baselines/pre-modularizacao.json`. O comparador roda a suíte inteira, permite apenas falhas já registradas, rejeita novos erros de carregamento, aumento de testes ignorados e redução inesperada do total. O comando não torna a suíte inteira verde: as falhas anteriores permanecem visíveis e exigem triagem.

Oito verificações frágeis de texto/posição de SQL foram substituídas por cenários reais de persistência, validação, ordenação e isolamento. Isso resolve cinco falhas anteriores sem alterar as regras do produto. Testes do módulo são executados separadamente e devem passar integralmente.

## Publicação de validação

`wrangler.toml` contém um ambiente nomeado `refactor`. Para desenvolvimento local, usar `.dev.vars.refactor` com uma chave JWT exclusiva de teste, evitando o fallback para `.dev.vars` de produção. O ambiente remoto possui sua própria chave JWT; credenciais de produção não devem ser copiadas.

O banco de validação foi inicializado com `lib/schema.sql` e dados exclusivamente fictícios. A inicialização não é uma migração de produção e não deve ser usada como tal. Não há novas tabelas ou migrações de produção nesta entrega.

Depois de commitar a revisão e construir novamente:

```sh
npm run build:refactor
npm run deploy:refactor
```

O script publica exclusivamente `refactor`, rejeita alterações não commitadas e verifica se a revisão e o schema correspondem ao build. A rota autenticada de administrador `/api/system/release` informa revisão, identificação do Worker e hash do schema base. O hash não substitui um histórico de migrações aplicadas.

O fluxo de CI valida PRs contra `main`, mas não publica automaticamente. Produção e staging V2 não são destinos destes comandos.

## Próximas entregas e critérios

1. Implementar o cálculo persistente de cobertura e o ciclo de reversão descritos acima. A extração do saldo/crédito está concluída.
2. Introduzir operações financeiras indivisíveis, idempotência e validação concorrente de saldo restante. Validar cliente, item, atendimento e unidade em todas as entradas. Exercitar o D1 remoto, inclusive falhas intermediárias e requisições simultâneas.
3. Permitir recebimento em atendimentos finalizados/encerrados sem mudar datas ou estado clínico. Preservar itens ao destinar para agenda, impedir duplicação e separar itens do dia dos futuros. Cada correção terá testes de regressão e entrega separada.
4. Recuperar histórico somente quando origem e valores forem comprováveis. Pendências de origem ambígua ficam em relatório; não deduplicar apenas por nome/procedimento.
5. Extrair UI por responsabilidade; depois migrar atendimentos/agenda, clientes/prontuário, caixa/relatórios e integrações.
6. Antes de ativar comportamento novo em produção, implementar configuração por unidade no servidor, migrações aditivas versionadas e revisão compatível para retorno. Não reintroduzir gravações financeiras antigas depois que novos lançamentos dependerem das novas garantias.

A ativação começa por uma unidade piloto e só se expande após dois fechamentos consecutivos conciliados, sem divergência financeira inexplicada. Os comandos desta entrega não iniciam essa ativação. O modelo comercial independente de atendimento e a V2 permanecem em um ciclo posterior.

## Defeitos conhecidos ainda pendentes

- Orçamento pode continuar aberto após encerramento, mas o recebimento ainda é recusado nesse status.
- Repetição de seleção de destinos pode duplicar agenda; itens removidos podem desaparecer da consulta após falta/cancelamento.
- Pagamentos ainda usam gravações sequenciais e não possuem idempotência nem validação concorrente do valor restante.
- Uso de saldo pode não sobreviver a uma recalculação; devolução de procedimento ainda deixa as alocações anteriores ativas. A validação de pertencimento de saldo já foi corrigida, mas esses dois problemas de cobertura permanecem.
- Reabertura do atendimento histórico na chegada continua no fluxo antigo; uma visita independente depende do próximo modelo.
- A ordenação SQL de instantes legados pode distinguir representações equivalentes com e sem fração de segundo. Corrigir a normalização em entrega própria, com testes em todos os relatórios consumidores.

Esses comportamentos não devem ser interpretados como corrigidos porque a arquitetura foi extraída. As correções de autorização e pertencimento foram publicadas apenas no ambiente refactor. Não houve migração de dados reais nem ativação em produção.
