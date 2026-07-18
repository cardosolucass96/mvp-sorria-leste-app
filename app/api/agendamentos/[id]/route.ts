import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { Agendamento, AgendamentoCompleto } from '@/lib/types';
import { validarUsuarioPorRoles } from '@/app/api/atendimentos/_helpers';
import { isDateTimeLocalValueInPast } from '@/lib/utils/formatters';
import { clinicDateTimeInputToUtcIso } from '@/lib/time';
import { isRestrictedDentistPatientView, redactPatientContactFields } from '@/lib/auth/patientPrivacy';

interface AtualizarAgendamentoBody {
  data_agendada?: string | null;
  executor_id?: number | null;
  observacoes?: string | null;
  status?: 'faltou' | 'cancelado' | 'agendado';
  motivo_cancelamento?: string | null;
}

const ROLES_DENTISTA_AGENDA = ['avaliador', 'executor', 'ortodontista'];

const DETAIL_SQL = `
  SELECT
    a.*,
    c.nome AS cliente_nome, c.telefone AS cliente_telefone,
    COALESCE(p.nome, 'Avaliação') AS procedimento_nome,
    u.nome AS executor_nome,
    CAST((julianday('now') - julianday(a.created_at)) AS INTEGER) AS dias_desde_criacao
  FROM agendamentos a
  JOIN clientes c ON c.id = a.cliente_id
  LEFT JOIN procedimentos p ON p.id = a.procedimento_id
  LEFT JOIN usuarios u ON u.id = a.executor_id
  WHERE a.id = ? AND a.unidade_id = ?
`;

// GET /api/agendamentos/[id] - Detalhe do agendamento
export const GET = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const agendamento = await queryOne<AgendamentoCompleto>(DETAIL_SQL, [parseInt(id as string), context.unidadeId]);

    if (!agendamento) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    if (isRestrictedDentistPatientView(context.user) && agendamento.executor_id !== context.user.sub) {
      return NextResponse.json({ error: 'Acesso não autorizado para este perfil' }, { status: 403 });
    }

    return NextResponse.json(redactPatientContactFields(agendamento, context.user));
  } catch (error) {
    console.error('Erro ao buscar agendamento:', error);
    return NextResponse.json({ error: 'Erro ao buscar agendamento' }, { status: 500 });
  }
});

// PUT /api/agendamentos/[id] - Atualiza agendamento
export const PUT = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    if (isRestrictedDentistPatientView(context.user)) {
      return NextResponse.json(
        { error: 'Seu perfil pode apenas visualizar a própria agenda' },
        { status: 403 }
      );
    }

    const { id } = await context.params!;
    const agendamentoId = parseInt(id as string);
    const body = await request.json() as AtualizarAgendamentoBody;

    const agendamento = await queryOne<Agendamento>(
      'SELECT * FROM agendamentos WHERE id = ? AND unidade_id = ?',
      [agendamentoId, context.unidadeId]
    );

    if (!agendamento) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    // Caso: agendar/reagendar com data
    if (body.data_agendada !== undefined) {
      const dataAgendadaUtc = clinicDateTimeInputToUtcIso(body.data_agendada);
      if (body.data_agendada) {
        if (!dataAgendadaUtc) {
          return NextResponse.json({ error: 'data_agendada inválida' }, { status: 400 });
        }
        if (isDateTimeLocalValueInPast(body.data_agendada)) {
          return NextResponse.json({ error: 'Não é possível agendar para uma data no passado' }, { status: 400 });
        }
      }
      updates.push('data_agendada = ?');
      params.push(dataAgendadaUtc);

      // Sem status explícito, sincroniza o status com a presença de data.
      if (body.status === undefined) {
        updates.push(dataAgendadaUtc ? "status = 'agendado'" : "status = 'pendente'");
      }
    }

    // Caso: atualizar executor
    if (body.executor_id !== undefined) {
      if (body.executor_id !== null) {
        const executorValido = await validarUsuarioPorRoles(Number(body.executor_id), ROLES_DENTISTA_AGENDA, null);
        if (executorValido === 'not_found') {
          return NextResponse.json({ error: 'Executor não encontrado' }, { status: 404 });
        }
        if (executorValido !== 'ok') {
          return NextResponse.json({ error: 'Usuário selecionado não possui role de dentista' }, { status: 400 });
        }
      }
      updates.push('executor_id = ?');
      params.push(body.executor_id || null);
    }

    // Caso: atualizar observacoes
    if (body.observacoes !== undefined) {
      updates.push('observacoes = ?');
      params.push(body.observacoes);
    }

    // Caso: mudança de status
    if (body.status) {
      const statusAtual = agendamento.status;

      if (body.status === 'faltou') {
        if (statusAtual !== 'pendente' && statusAtual !== 'agendado') {
          return NextResponse.json(
            { error: `Não é possível marcar faltou a partir do status "${statusAtual}"` },
            { status: 400 }
          );
        }
        updates.push("status = 'faltou'");
      } else if (body.status === 'cancelado') {
        if (!body.motivo_cancelamento) {
          return NextResponse.json(
            { error: 'motivo_cancelamento é obrigatório para cancelar' },
            { status: 400 }
          );
        }
        updates.push("status = 'cancelado'");
        updates.push('motivo_cancelamento = ?');
        params.push(body.motivo_cancelamento);
      } else if (body.status === 'agendado') {
        // Reagendar após faltou
        if (statusAtual !== 'faltou' && statusAtual !== 'pendente') {
          return NextResponse.json(
            { error: `Não é possível reagendar a partir do status "${statusAtual}"` },
            { status: 400 }
          );
        }
        if (!body.data_agendada) {
          return NextResponse.json(
            { error: 'data_agendada é obrigatória para reagendar' },
            { status: 400 }
          );
        }
        updates.push("status = 'agendado'");
      } else {
        return NextResponse.json(
          { error: `Status "${body.status}" não é permitido via PUT` },
          { status: 400 }
        );
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    params.push(agendamentoId);
    await execute(
      `UPDATE agendamentos SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const atualizado = await queryOne<AgendamentoCompleto>(DETAIL_SQL, [agendamentoId, context.unidadeId]);
    return NextResponse.json(
      atualizado ? redactPatientContactFields(atualizado, context.user) : atualizado
    );
  } catch (error) {
    console.error('Erro ao atualizar agendamento:', error);
    return NextResponse.json({ error: 'Erro ao atualizar agendamento' }, { status: 500 });
  }
});
