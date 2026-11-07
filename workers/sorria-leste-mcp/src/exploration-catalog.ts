import { hasFinancialScope } from './security';
import type { Identity } from './types';

type Dataset = {
  description: string;
  columns: string;
  finance?: string;
  financialOnly?: boolean;
  from: string;
  where?: string;
  relations?: Record<string, string>;
  expressions?: Record<string, string>;
};

// The SQL explorer sees only these projections. No raw table or free-text clinical field is exposed.
export const DATASETS: Record<string, Dataset> = {
  unidades: { description: 'Unidades autorizadas da clínica.', columns: 'id nome ativo', from: 'main.unidades t', where: 't.id IN ($units)' },
  clientes: {
    description: 'Pacientes com atendimento ou agenda nas unidades autorizadas. Contatos são mascarados antes de qualquer SQL.',
    columns: 'id nome origem sexo plano_odontologico cpf telefone email created_at', from: 'main.clientes t',
    where: 'EXISTS (SELECT 1 FROM main.atendimentos a WHERE a.cliente_id=t.id AND a.unidade_id IN ($units)) OR EXISTS (SELECT 1 FROM main.agendamentos ag WHERE ag.cliente_id=t.id AND ag.unidade_id IN ($units))',
    expressions: {
      cpf: "CASE WHEN t.cpf IS NULL THEN NULL ELSE '***.***.***-' || substr(t.cpf,-2) END",
      telefone: "CASE WHEN t.telefone IS NULL THEN NULL ELSE '***' || substr(t.telefone,-4) END",
      email: "CASE WHEN t.email IS NULL THEN NULL WHEN instr(t.email,'@')>0 THEN substr(t.email,1,1) || '***' || substr(t.email,instr(t.email,'@')) ELSE '***' END",
    },
  },
  usuarios: { description: 'Equipe vinculada às unidades; sem senhas ou contatos.', columns: 'id nome role ativo', from: 'main.usuarios t', where: 'EXISTS (SELECT 1 FROM main.usuario_unidades uu WHERE uu.usuario_id=t.id AND uu.unidade_id IN ($units))' },
  usuario_roles: { description: 'Perfis da equipe.', columns: 'usuario_id role', from: 'main.usuario_roles t', where: 'EXISTS (SELECT 1 FROM main.usuario_unidades uu WHERE uu.usuario_id=t.usuario_id AND uu.unidade_id IN ($units))', relations: { usuario_id: 'usuarios.id' } },
  usuario_unidades: { description: 'Vínculos de equipe nas unidades autorizadas.', columns: 'usuario_id unidade_id', from: 'main.usuario_unidades t', where: 't.unidade_id IN ($units)', relations: { usuario_id: 'usuarios.id', unidade_id: 'unidades.id' } },
  categorias: { description: 'Filas de atendimento, incluindo categorias inativas.', columns: 'id nome slug ativo ordem pula_avaliacao', from: 'main.categorias t' },
  categoria_roles: { description: 'Perfis que acessam cada fila.', columns: 'categoria_id role', from: 'main.categoria_roles t', relations: { categoria_id: 'categorias.id' } },
  procedimentos: { description: 'Catálogo de procedimentos e tipo de execução, sem descrição livre.', columns: 'id nome categoria_id ativo por_dente tem_face tem_etapas', finance: 'valor comissao_venda comissao_execucao comissao_acrescimo', from: 'main.procedimentos t', relations: { categoria_id: 'categorias.id' } },
  procedimento_etapas_modelo: { description: 'Sessões previstas no catálogo.', columns: 'id procedimento_id nome ordem', finance: 'valor', from: 'main.procedimento_etapas_modelo t', relations: { procedimento_id: 'procedimentos.id' } },
  atendimentos: {
    description: 'Atendimentos: triagem, avaliacao, aguardando_pagamento, em_execucao, finalizado ou encerrado.',
    columns: 'id cliente_id unidade_id categoria_id avaliador_id status tipo agendamento_id liberado_por_id liberado_em created_at finalizado_at',
    from: 'main.atendimentos t', where: 't.unidade_id IN ($units)',
    relations: { cliente_id: 'clientes.id', unidade_id: 'unidades.id', categoria_id: 'categorias.id', avaliador_id: 'usuarios.id', agendamento_id: 'agendamentos.id' },
  },
  itens_atendimento: {
    description: 'Procedimentos individuais: pendente, pago, executando ou concluido. Não contém prontuário, dentes ou observações clínicas.',
    columns: 'id atendimento_id procedimento_id executor_id criado_por_id quantidade group_id origem_agendamento_id etapa_modelo_id status adicionado_em_execucao created_at concluido_at',
    finance: 'valor valor_original valor_final valor_pago desconto_valor',
    from: 'main.itens_atendimento t JOIN main.atendimentos a ON a.id=t.atendimento_id', where: 'a.unidade_id IN ($units)',
    relations: { atendimento_id: 'atendimentos.id', procedimento_id: 'procedimentos.id', executor_id: 'usuarios.id', origem_agendamento_id: 'agendamentos.id', etapa_modelo_id: 'procedimento_etapas_modelo.id' },
  },
  itens_atendimento_destinos: { description: 'Destino operacional de cada procedimento/sessão.', columns: 'id atendimento_id item_atendimento_id etapa_modelo_id destino_status data_agendada executor_id', from: 'main.itens_atendimento_destinos t JOIN main.atendimentos a ON a.id=t.atendimento_id', where: 'a.unidade_id IN ($units)', relations: { atendimento_id: 'atendimentos.id', item_atendimento_id: 'itens_atendimento.id', etapa_modelo_id: 'procedimento_etapas_modelo.id' } },
  agendamentos: {
    description: 'Agenda: pendente, agendado, realizado, faltou ou cancelado. Tipo avaliacao ou procedimento.',
    columns: 'id cliente_id unidade_id atendimento_origem_id atendimento_sessao_id procedimento_id item_atendimento_origem_id executor_id criado_por_id tipo status data_agendada etapa_modelo_id created_at',
    finance: 'pago valor valor_pago', from: 'main.agendamentos t', where: 't.unidade_id IN ($units)',
    relations: { cliente_id: 'clientes.id', unidade_id: 'unidades.id', atendimento_origem_id: 'atendimentos.id', atendimento_sessao_id: 'atendimentos.id', procedimento_id: 'procedimentos.id', item_atendimento_origem_id: 'itens_atendimento.id', executor_id: 'usuarios.id' },
  },
  followup_tarefas: { description: 'Follow-ups sem texto livre. Cobranças exigem escopo financeiro.', columns: 'id cliente_id unidade_id responsavel_usuario_id criado_por_id tipo status vencimento_em concluida_em excluida_em created_at updated_at', from: 'main.followup_tarefas t', where: "t.unidade_id IN ($units) AND ($finance OR t.tipo != 'cobranca')", relations: { cliente_id: 'clientes.id', unidade_id: 'unidades.id', responsavel_usuario_id: 'usuarios.id' } },
  pagamentos: { description: 'Recebimentos, inclusive cancelados: use cancelado=0 para recebimento válido.', columns: 'id atendimento_id recebido_por_id valor metodo cancelado created_at valor_taxa valor_liquido', financialOnly: true, from: 'main.pagamentos t JOIN main.atendimentos a ON a.id=t.atendimento_id', where: 'a.unidade_id IN ($units)', relations: { atendimento_id: 'atendimentos.id', recebido_por_id: 'usuarios.id' } },
  pagamentos_alocacoes: { description: 'Distribuição dos recebimentos entre itens e agenda.', columns: 'id pagamento_id item_atendimento_id agendamento_id etapa_modelo_id valor_alocado created_at', financialOnly: true, from: 'main.pagamentos_alocacoes t JOIN main.pagamentos p ON p.id=t.pagamento_id JOIN main.atendimentos a ON a.id=p.atendimento_id', where: 'a.unidade_id IN ($units)', relations: { pagamento_id: 'pagamentos.id', item_atendimento_id: 'itens_atendimento.id', agendamento_id: 'agendamentos.id' } },
  comissoes: { description: 'Comissões de avaliação, acréscimo e execução.', columns: 'id atendimento_id item_atendimento_id usuario_id tipo origem percentual valor_base valor_comissao created_at', financialOnly: true, from: 'main.comissoes t JOIN main.atendimentos a ON a.id=t.atendimento_id', where: 'a.unidade_id IN ($units)', relations: { atendimento_id: 'atendimentos.id', item_atendimento_id: 'itens_atendimento.id', usuario_id: 'usuarios.id' } },
};

export function availableDatasets(identity: Identity) {
  return Object.entries(DATASETS).filter(([, dataset]) => !dataset.financialOnly || hasFinancialScope(identity.scope));
}

export function datasetColumns(dataset: Dataset, identity: Identity): string[] {
  return `${dataset.columns} ${hasFinancialScope(identity.scope) ? dataset.finance ?? '' : ''}`.trim().split(/\s+/);
}

export function protectedCatalogSql(identity: Identity, unitIds: number[]): string {
  const units = unitIds.length ? unitIds.join(',') : 'NULL';
  return availableDatasets(identity).map(([name, dataset]) => {
    const columns = datasetColumns(dataset, identity).map(column => `${dataset.expressions?.[column] ?? `t."${column}"`} AS "${column}"`).join(', ');
    const where = dataset.where?.replaceAll('$units', units).replaceAll('$finance', hasFinancialScope(identity.scope) ? '1' : '0');
    return `"${name}" AS (SELECT ${columns} FROM ${dataset.from}${where ? ` WHERE (${where})` : ''})`;
  }).join(',\n');
}
