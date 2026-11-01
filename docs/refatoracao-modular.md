# Modularização incremental

Base: `main` em `a0aa68b1436e8c272d0aea78c203eaca85e55c95`.
Branch: `codex/modular-orcamentos-financeiro`; PR #38.

## Estado atual

Orçamentos, recebimentos, cancelamentos e saldo/crédito têm contratos, regras puras e operações de servidor dentro dos módulos. Rotas mantêm URLs e respostas. A fachada `lib/helpers/pagamentoFlow.ts` atende consumidores legados; telas usam a entrada `modules/financeiro/public.ts`, sem importar servidor.

A extração inicial está separada das correções em commits próprios. `a4ca8ed` extrai saldo sem mudar regras; as correções seguintes adicionam autenticação, perfil admin/atendente, vínculo cliente/unidade, valores válidos, arredondamento monetário e preservação do estado clínico ao pagar com crédito. O saldo continua global por cliente.

A terceira entrega implementa crédito com origem persistente, compartilhado pelo recálculo do item, sessões e agenda vinculada. A habilitação começa desativada. Produção e staging V2 não são destinos dos utilitários desta entrega.

## Crédito rastreável

- `financeiro_creditos` registra cada origem de crédito. Saldo anterior à adesão vira abertura sem atribuir um pagamento por suposição.
- `financeiro_consumos` registra uso, transferência, devolução em dinheiro e reversão por cancelamento. O consumo é FIFO: o crédito mais antigo é usado primeiro. Transferir conserva a origem do pagamento.
- `financeiro_coberturas` liga o uso do crédito ao procedimento e sessão. Recálculo soma coberturas válidas e alocações de pagamentos ativos ainda não devolvidas.
- `financeiro_liberacoes` vincula a devolução à alocação exata do pagamento. Um estorno antigo não pode descontar um recebimento novo nem recriar quitação.
- Comissão de venda acompanha a cobertura: a conversão em crédito remove a comissão da alocação liberada; novo uso de crédito gera a comissão correspondente. Comissão de execução não é alterada por essa operação.
- Regra aprovada: cancelar um pagamento reverte automaticamente seu crédito somente se não houve uso, transferência ou devolução. Qualquer consumo anterior bloqueia, inclusive se outro crédito posterior deixou saldo suficiente. Grupo composto é cancelado como uma única operação.
- Crédito legado sem origem comprovável bloqueia reversão automática. Item cujo valor pago diverge das origens conhecidas exige conciliação antes de usar/devolver crédito ou receber pela nova operação.
- Converter manualmente um pagamento em crédito só permite o valor ainda não destinado; para valores alocados, deve-se devolver o procedimento. Isso impede que o mesmo recebimento quite um item e gere saldo livre ao mesmo tempo.

Os valores do registro novo são inteiros em centavos. As tabelas legadas em reais continuam sendo atualizadas para compatibilidade. Não foi feita atribuição retroativa de origem nem correção automática de histórico.

## Transação, concorrência e repetição

As operações rastreáveis planejam as gravações e executam um único batch D1: saldo, extrato, origem, cobertura, pagamentos/grupo, comissão e resposta da operação são gravados ou revertidos juntos.

Com a migração instalada, recebimentos e cancelamentos usam o escritor atômico também em unidades ainda não habilitadas, sem iniciar o rastreamento de suas contas. As gravações legadas de saldo verificam dentro do próprio batch que a conta não aderiu durante a solicitação; caso tenha aderido, são recusadas antes de alterar qualquer valor. Isso protege clientes compartilhados durante a transição. Unidades sem migração continuam no caminho anterior e não podem compartilhar este banco com uma versão antiga do servidor após ativação.

Uma versão global detecta alteração entre a leitura e o início do batch. Triggers incrementam essa versão inclusive quando os escritores antigos alteram as tabelas financeiras. Uma restrição do banco aborta o batch quando a versão mudou. A resposta é 409 e permite atualizar os dados e tentar novamente. O controle global é conservador: alterações independentes também podem causar conflito. Deve-se medir a frequência desses conflitos antes de expansão; ele não é uma solução de alto volume por cliente.

`Idempotency-Key` identifica a tentativa. Repetir a chave com a mesma entrada retorna a resposta armazenada; mudar os dados mantendo a chave é recusado. A interface conserva a chave após falha de rede enquanto permanece montada e encerra a tentativa após confirmação. Clientes externos devem reutilizar a mesma chave ao repetir uma requisição. Sem chave, uma repetição de crédito manual pode representar uma nova operação; a proteção não é inferida por valor/data.

O recálculo de item rastreado usa uma expressão SQL sobre as origens atuais, sem gravar um total calculado antes de outra transação. As leituras continuam reconhecendo cobertura depois de desligar a adesão por unidade.

## Atendimentos encerrados e limites de agenda

Na operação habilitada, valores pendentes podem ser recebidos em atendimento finalizado/encerrado sem mudar status clínico, data de criação ou encerramento. A API informa essa possibilidade e a tela habilita somente a cobrança; não libera novamente destinos clínicos.

A seleção de destinos preserva os itens com histórico financeiro rastreado. A divisão antiga de procedimentos em sessões para execução é bloqueada **antes de alterar destinos ou pagamentos**, pois esse caminho move alocações e exclui o item comercial original. Não tratar esse bloqueio como migração completa da execução: o fluxo precisa ser separado antes de liberar produção. A exclusão manual também preserva itens com histórico financeiro.

Ainda faltam a migração completa de seleção/execução de sessões, chegada sem reabrir atendimento histórico, idempotência da criação de agenda e reconciliação dos lançamentos antigos. Fluxos financeiros auxiliares e fechamento de caixa precisam ser exercitados no piloto antes de expansão.

## Migração aditiva e ativação

`lib/migrations/financeiro/0001_creditos_rastreaveis.sql` cria tabelas, índices e triggers sem remover tabelas ou dados existentes. Não ativa unidades. Pode ser reaplicada com segurança; o utilitário registra nome e SHA-256 em `financeiro_migracoes` e rejeita alteração de migração já aplicada.

O saldo é global: ativar uma unidade permite iniciar a adesão de clientes, e uma conta que já recebeu lançamentos rastreados continua no escritor novo em todas as unidades. Consulta/transferência/devolução global também podem iniciar adesão quando há unidade habilitada. Portanto, o piloto deve considerar os clientes compartilhados entre unidades; a flag não cria carteiras separadas.

Somente no ambiente `refactor`, com dados fictícios:

```sh
npm run migrate:refactor
npm run creditos:refactor -- verify
npm run creditos:refactor -- enable 1
# Interrompe novas adesões pela unidade; contas já rastreadas seguem compatíveis.
npm run creditos:refactor -- disable 1
```

Desligar a adesão não permite retornar ao escritor antigo para contas já rastreadas. Depois de registrar crédito novo, não publicar a revisão anterior ao suporte a essas tabelas, nem apagar a migração. Um retorno deve manter leitores/escritores compatíveis. As ferramentas fornecidas fixam o destino em `sorria-leste-db-refactor`; não aplicam migração em produção.

## Validação e publicação

Usar Node 22 (`.nvmrc`) e `npm ci`. O Jest fixa `America/Fortaleza` antes dos projetos, inclusive em CI UTC, devido a fixtures legadas com datas sem offset.

```sh
npm run typecheck
npm run check:modules
npm run lint:modules
npm run test:modules
npm run test:baseline
npm run build:refactor
npm run deploy:refactor
```

Os testes de integração executam SQL com o schema real e a migração em SQLite. O adaptador executa o batch sem intercalar awaits entre as instruções, mas não substitui a validação de concorrência no D1 remoto. Testes incluem origem independente, grupo composto, devolução seguida de novo recebimento, crédito usado/transferido, falha intermediária, repetição, concorrência, sessões, agenda e atendimento encerrado. Há teste de interface para repetição após falha de rede.

`test:baseline` permite somente falhas anteriores identificadas, rejeita erros novos de carregamento, mais testes ignorados e redução do total. A base original tinha 77 falhas. As 72 ainda presentes não são consideradas corrigidas porque o comparador passa.

O ambiente `refactor` tem D1/R2 próprios, dados fictícios, chave JWT exclusiva e integrações externas bloqueadas antes de chamadas de rede. `.dev.vars.refactor` é local e ignorado pelo Git. Produção e staging V2 não compartilham esses recursos.

O deploy exige revisão commitada, build da mesma revisão e migrações financeiras registradas com o hash esperado. `schema_revision` representa o schema base mais as migrações versionadas. A rota autenticada `/api/system/release` informa ambiente, commit, hash e versão do Worker. CI valida o PR e não publica automaticamente.

## Ordem restante

1. Completar a migração do caminho de agenda/execução que hoje divide itens, mantendo as verificações financeiras no D1 remoto.
2. Conciliar histórico somente quando origem e valores forem comprováveis; manter relatório dos casos ambíguos.
3. Exercitar a operação completa de uma unidade piloto, incluindo clientes compartilhados, sessões, caixa, relatórios e comissões. Expandir apenas depois de dois fechamentos consecutivos conciliados, sem divergência inexplicada.
4. Extrair UI por responsabilidade; seguir com atendimento/agenda, clientes/prontuário, caixa/relatórios e integrações.
5. Evoluir o modelo comercial independente da visita em ciclo próprio. A V2 em staging permanece separada.
