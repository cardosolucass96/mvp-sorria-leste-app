import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { query, queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { validarUsuarioPorRoles } from './_helpers';
import { resolveAvaliadorPadraoDaUnidade } from '@/lib/helpers/atendimentoDefaults';
import { getClinicDayUtcRange, getClinicTrailingDaysUtcRange } from '@/lib/time';
import type { AtendimentoStatus } from '@/lib/types';
import { validarDentesProcedimento, type DenteProcedimentoPayload } from '@/lib/helpers/dentesProcedimento';
import {
  getEffectiveUserRoles,
  isRestrictedDentistPatientView,
  redactPatientContactFields,
  redactPatientContactFieldsList,
} from '@/lib/auth/patientPrivacy';

interface Atendimento {
  id: number;
  cliente_id: number;
  avaliador_id: number | null;
  status: string;
  created_at: string;
  finalizado_at: string | null;
}

interface AtendimentoComCliente extends Atendimento {
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  avaliador_nome: string | null;
  procedimentos_resumo: string | null;
  executores_resumo: string | null;
  liberado_em: string | null;
}

interface CountResult {
  count: number;
}

type AtendimentoPeriodoFiltro = 'hoje_ou_fluxo' | 'hoje' | '7dias' | '30dias';

const STATUSES_EM_FLUXO: AtendimentoStatus[] = [
  'triagem',
  'avaliacao',
  'aguardando_pagamento',
  'em_execucao',
];

// GET /api/atendimentos - Lista atendimentos da unidade atual
export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const clienteId = searchParams.get('cliente_id');
    const busca = searchParams.get('busca');
    const periodo = searchParams.get('periodo') as AtendimentoPeriodoFiltro | null;
    const hojeRange = getClinicDayUtcRange();
    const ultimos7DiasRange = getClinicTrailingDaysUtcRange(7);
    const ultimos30DiasRange = getClinicTrailingDaysUtcRange(30);
    const restrictedDentistView = isRestrictedDentistPatientView(context.user);

    let sql = `
      SELECT
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        u.nome as avaliador_nome,
        (SELECT GROUP_CONCAT(nome, ', ') FROM (
           SELECT DISTINCT p.nome FROM itens_atendimento ia
           JOIN procedimentos p ON ia.procedimento_id = p.id
           WHERE ia.atendimento_id = a.id)) as procedimentos_resumo,
        (SELECT GROUP_CONCAT(nome, ', ') FROM (
           SELECT DISTINCT u2.nome FROM itens_atendimento ia
           JOIN usuarios u2 ON ia.executor_id = u2.id
           WHERE ia.atendimento_id = a.id)) as executores_resumo
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
    `;

    const conditions: string[] = ['a.unidade_id = ?'];
    const params: (string | number)[] = [context.unidadeId];

    switch (periodo) {
      case 'hoje_ou_fluxo':
        conditions.push(
          `(
            (a.status NOT IN (?, ?) AND a.created_at >= ? AND a.created_at < ?)
            OR
            (a.status = ? AND COALESCE(a.finalizado_at, a.created_at) >= ? AND COALESCE(a.finalizado_at, a.created_at) < ?)
            OR
            a.status IN (${STATUSES_EM_FLUXO.map(() => '?').join(', ')})
          )`
        );
        params.push(
          'finalizado',
          'encerrado',
          hojeRange.start,
          hojeRange.endExclusive,
          'finalizado',
          hojeRange.start,
          hojeRange.endExclusive,
          ...STATUSES_EM_FLUXO,
        );
        break;
      case 'hoje':
        conditions.push(
          `(
            (a.status NOT IN (?, ?) AND a.created_at >= ? AND a.created_at < ?)
            OR
            (a.status = ? AND COALESCE(a.finalizado_at, a.created_at) >= ? AND COALESCE(a.finalizado_at, a.created_at) < ?)
          )`
        );
        params.push(
          'finalizado',
          'encerrado',
          hojeRange.start,
          hojeRange.endExclusive,
          'finalizado',
          hojeRange.start,
          hojeRange.endExclusive,
        );
        break;
      case '7dias':
        conditions.push('a.created_at >= ? AND a.created_at < ?');
        params.push(ultimos7DiasRange.start, ultimos7DiasRange.endExclusive);
        break;
      case '30dias':
        conditions.push('a.created_at >= ? AND a.created_at < ?');
        params.push(ultimos30DiasRange.start, ultimos30DiasRange.endExclusive);
        break;
      default:
        break;
    }

    // Filtro por status
    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }

    // Filtro por cliente
    if (clienteId) {
      conditions.push('a.cliente_id = ?');
      params.push(parseInt(clienteId));
    }

    // Busca por nome do cliente
    if (busca) {
      conditions.push('(c.nome LIKE ? OR c.cpf LIKE ?)');
      params.push(`%${busca}%`, `%${busca}%`);
    }

    if (restrictedDentistView) {
      const roles = getEffectiveUserRoles(context.user);
      const scopedConditions: string[] = [];

      if (roles.includes('avaliador')) {
        scopedConditions.push("(a.status = 'avaliacao' AND (a.avaliador_id IS NULL OR a.avaliador_id = ?))");
        params.push(context.user.sub);
      }

      if (roles.includes('executor') || roles.includes('ortodontista')) {
        scopedConditions.push(`(
          a.status = 'em_execucao'
          AND EXISTS (
            SELECT 1 FROM itens_atendimento ix
            WHERE ix.atendimento_id = a.id
              AND (ix.executor_id IS NULL OR ix.executor_id = ?)
          )
        )`);
        params.push(context.user.sub);
      }

      conditions.push(scopedConditions.length > 0 ? `(${scopedConditions.join(' OR ')})` : '1 = 0');
    }

    sql += ' WHERE ' + conditions.join(' AND ');

    sql += ' ORDER BY a.created_at DESC';

    const atendimentos = await query<AtendimentoComCliente>(sql, params);

    return NextResponse.json(redactPatientContactFieldsList(atendimentos, context.user));
  } catch (error) {
    console.error('Erro ao buscar atendimentos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar atendimentos' },
      { status: 500 }
    );
  }
});

// POST /api/atendimentos - Cria novo atendimento na unidade atual
export const POST = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const body = await request.json();
    const {
      cliente_id,
      avaliador_id,
      tipo_orto,
      executor_id,
      procedimento_id,
      valor,
      criado_por_id,
      categoria_id,
      categoria_slug,
      dentes,
      procedimentos: procedimentosInformados,
    } = body;
    const avaliadorIdInformado = Number.isInteger(avaliador_id) && Number(avaliador_id) > 0
      ? Number(avaliador_id)
      : null;

    // O formato novo aceita vários procedimentos. O formato legado com os
    // campos singulares continua válido para não quebrar integrações antigas.
    const procedimentosBrutos = Array.isArray(procedimentosInformados)
      ? procedimentosInformados
      : procedimento_id
        ? [{ procedimento_id, executor_id, valor, dentes }]
        : [];
    const procedimentosSolicitados: Array<{
      procedimento_id: number;
      executor_id: number | null;
      valor: number | null;
      dentes: unknown;
    }> = [];

    for (const procedimentoBruto of procedimentosBrutos) {
      const procedimentoId = Number(procedimentoBruto?.procedimento_id);
      if (!Number.isInteger(procedimentoId) || procedimentoId <= 0) {
        return NextResponse.json({ error: 'Procedimento inválido' }, { status: 400 });
      }

      const executorBruto = procedimentoBruto?.executor_id;
      const executorId = executorBruto === undefined || executorBruto === null || executorBruto === ''
        ? null
        : Number(executorBruto);
      if (executorId !== null && (!Number.isInteger(executorId) || executorId <= 0)) {
        return NextResponse.json({ error: 'Executor inválido' }, { status: 400 });
      }

      const valorBruto = procedimentoBruto?.valor;
      const valorInformado = valorBruto === undefined || valorBruto === null || valorBruto === ''
        ? null
        : Number(valorBruto);
      if (valorInformado !== null && (!Number.isFinite(valorInformado) || valorInformado < 0)) {
        return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
      }

      procedimentosSolicitados.push({
        procedimento_id: procedimentoId,
        executor_id: executorId,
        valor: valorInformado,
        dentes: procedimentoBruto?.dentes,
      });
    }
    
    // Validações
    if (!cliente_id) {
      return NextResponse.json(
        { error: 'Cliente é obrigatório' },
        { status: 400 }
      );
    }
    
    // Verifica se cliente existe
    const cliente = await queryOne<{ id: number }>(
      'SELECT id FROM clientes WHERE id = ?',
      [cliente_id]
    );
    
    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }
    
    // Verifica se cliente já tem atendimento em aberto na mesma unidade
    const atendimentoAberto = await queryOne<CountResult>(
      `SELECT COUNT(*) as count FROM atendimentos
       WHERE cliente_id = ? AND status NOT IN ('finalizado', 'encerrado') AND unidade_id = ?`,
      [cliente_id, context.unidadeId]
    );
    
    if (atendimentoAberto && atendimentoAberto.count > 0) {
      return NextResponse.json(
        { error: 'Cliente já possui atendimento em aberto' },
        { status: 400 }
      );
    }

    // Resolve categoria: por id explícito, por slug, ou por flag legada tipo_orto
    interface CategoriaRow { id: number; slug: string; pula_avaliacao: number }
    let categoriaResolvida: CategoriaRow | null = null;
    if (categoria_id) {
      categoriaResolvida = await queryOne<CategoriaRow>(
        'SELECT id, slug, pula_avaliacao FROM categorias WHERE id = ? AND ativo = 1',
        [categoria_id]
      );
      if (!categoriaResolvida) {
        return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 });
      }
    } else if (categoria_slug) {
      categoriaResolvida = await queryOne<CategoriaRow>(
        'SELECT id, slug, pula_avaliacao FROM categorias WHERE slug = ? AND ativo = 1',
        [categoria_slug]
      );
      if (!categoriaResolvida) {
        return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 });
      }
    } else if (tipo_orto) {
      categoriaResolvida = await queryOne<CategoriaRow>(
        "SELECT id, slug, pula_avaliacao FROM categorias WHERE slug = 'orto'"
      );
    }
    const categoriaIdFinal = categoriaResolvida?.id ?? null;
    const pulaAvaliacao = categoriaResolvida?.pula_avaliacao === 1 || !!tipo_orto;

    // Verifica avaliador se fornecido (fluxo normal)
    if (avaliadorIdInformado && !tipo_orto) {
      const avaliadorValido = await validarUsuarioPorRoles(avaliadorIdInformado, ['avaliador'], null, { allowAdmin: true });

      if (avaliadorValido === 'not_found') {
        return NextResponse.json(
          { error: 'Avaliador não encontrado' },
          { status: 404 }
        );
      }

      if (avaliadorValido !== 'ok') {
        return NextResponse.json(
          { error: 'Usuário selecionado não é avaliador' },
          { status: 400 }
        );
      }
    }

    const avaliadorIdFinal = !pulaAvaliacao && !tipo_orto
      ? (avaliadorIdInformado ?? await resolveAvaliadorPadraoDaUnidade(context.unidadeId, context.user.sub))
      : null;
    
    // === FLUXO CATEGORIA COM pula_avaliacao (antes: apenas orto) ===
    if (pulaAvaliacao) {
      if (procedimentosSolicitados.length === 0) {
        return NextResponse.json(
          {
            error: tipo_orto
              ? 'Procedimento é obrigatório para atendimento orto'
              : 'Ao menos um procedimento é obrigatório para este atendimento',
          },
          { status: 400 }
        );
      }

      // A forma antiga usava o executor como criador quando não recebia
      // criado_por_id. Mantemos esse fallback para integrações existentes;
      // o novo formulário envia explicitamente o usuário autenticado.
      const criadoPorId = criado_por_id || executor_id || context.user.sub;
      if (!criadoPorId) {
        return NextResponse.json(
          { error: 'Não foi possível identificar o criador do atendimento' },
          { status: 400 }
        );
      }

      const procedimentosParaCriar: Array<{
        procedimento_id: number;
        executor_id: number | null;
        valor: number;
        por_dente: number;
        dentes: DenteProcedimentoPayload[];
      }> = [];

      // Valida todos os procedimentos antes de criar o atendimento, evitando
      // que uma seleção inválida deixe itens parcialmente gravados.
      for (const solicitado of procedimentosSolicitados) {
        if (solicitado.executor_id) {
          const executorValido = await validarUsuarioPorRoles(
            solicitado.executor_id,
            ['executor', 'ortodontista'],
            categoriaIdFinal,
          );

          if (executorValido === 'not_found') {
            return NextResponse.json({ error: 'Executor não encontrado' }, { status: 404 });
          }

          if (executorValido !== 'ok') {
            return NextResponse.json({ error: 'Usuário selecionado não é executor' }, { status: 400 });
          }
        }

        const procedimentoBase = await queryOne<{
          id: number;
          valor: number;
          nome: string;
        }>(
          'SELECT id, valor, nome FROM procedimentos WHERE id = ? AND ativo = 1',
          [solicitado.procedimento_id],
        );
        if (!procedimentoBase) {
          return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
        }

        // Mantém a consulta separada para compatibilidade com integrações e
        // bancos legados que ainda não expõem essas colunas no mesmo SELECT.
        const configuracaoDentes = await queryOne<{ por_dente: number; tem_face: number }>(
          'SELECT por_dente, tem_face FROM procedimentos WHERE id = ?',
          [solicitado.procedimento_id],
        );
        const procedimento = {
          ...procedimentoBase,
          por_dente: configuracaoDentes?.por_dente ?? 0,
          tem_face: configuracaoDentes?.tem_face ?? 0,
        };

        const valorFinal = solicitado.valor !== null ? solicitado.valor : Number(procedimento.valor);
        const validacaoDentes = procedimento.por_dente
          ? validarDentesProcedimento(solicitado.dentes, { exigirFaces: Boolean(procedimento.tem_face) })
          : null;
        if (validacaoDentes && !validacaoDentes.ok) {
          const mensagem = tipo_orto && !Array.isArray(procedimentosInformados)
            ? validacaoDentes.error
            : `${procedimento.nome}: ${validacaoDentes.error}`;
          return NextResponse.json({ error: mensagem }, { status: 400 });
        }

        procedimentosParaCriar.push({
          procedimento_id: procedimento.id,
          executor_id: solicitado.executor_id,
          valor: valorFinal,
          por_dente: procedimento.por_dente,
          dentes: validacaoDentes?.ok ? validacaoDentes.dentes : [],
        });
      }

      // Cria atendimento já em aguardando_pagamento
      // NOTE: mantém `tipo='orto'` quando categoria for orto para compat com código legado que ainda lê tipo.
      const tipoLegado = categoriaResolvida?.slug === 'orto' ? 'orto' : 'normal';
      const result = await execute(
        `INSERT INTO atendimentos (cliente_id, avaliador_id, status, observacoes, unidade_id, categoria_id, tipo)
         VALUES (?, NULL, 'aguardando_pagamento', ?, ?, ?, ?)`,
        [cliente_id, 'Atendimento Orto', context.unidadeId, categoriaIdFinal, tipoLegado]
      );

      const atendimentoId = result.lastInsertRowid;

      for (const procedimento of procedimentosParaCriar) {
        // Cria um item por dente para manter o vínculo explícito em todo o fluxo.
        if (procedimento.por_dente) {
          const groupId = randomUUID();
          for (const dente of procedimento.dentes) {
            await execute(
              `INSERT INTO itens_atendimento (
                atendimento_id, procedimento_id, executor_id, criado_por_id,
                valor, valor_original, valor_final, desconto_valor, quantidade, status,
                dentes, group_id, dente_unico
              )
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 'pendente', ?, ?, ?)`,
              [
                atendimentoId,
                procedimento.procedimento_id,
                procedimento.executor_id,
                criadoPorId,
                procedimento.valor,
                procedimento.valor,
                procedimento.valor,
                JSON.stringify([dente]),
                groupId,
                dente.dente,
              ],
            );
          }
        } else {
          await execute(
            `INSERT INTO itens_atendimento (
              atendimento_id, procedimento_id, executor_id, criado_por_id,
              valor, valor_original, valor_final, desconto_valor, quantidade, status,
              dentes
            )
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 'pendente', NULL)`,
            [
              atendimentoId,
              procedimento.procedimento_id,
              procedimento.executor_id,
              criadoPorId,
              procedimento.valor,
              procedimento.valor,
              procedimento.valor,
            ]
          );
        }
      }
      
      // Busca atendimento criado
      const novoAtendimento = await queryOne<AtendimentoComCliente>(
        `SELECT 
          a.*,
          c.nome as cliente_nome,
          c.cpf as cliente_cpf,
          c.telefone as cliente_telefone,
          NULL as avaliador_nome
        FROM atendimentos a
        INNER JOIN clientes c ON a.cliente_id = c.id
        WHERE a.id = ?`,
        [atendimentoId]
      );
      
      return NextResponse.json(
        novoAtendimento ? redactPatientContactFields(novoAtendimento, context.user) : novoAtendimento,
        { status: 201 }
      );
    }
    
    // === FLUXO NORMAL ===
    // Cria atendimento com status inicial 'triagem'
    const result = await execute(
      `INSERT INTO atendimentos (cliente_id, avaliador_id, status, unidade_id, categoria_id)
       VALUES (?, ?, 'triagem', ?, ?)`,
      [cliente_id, avaliadorIdFinal, context.unidadeId, categoriaIdFinal]
    );
    
    // Busca atendimento criado com dados do cliente
    const novoAtendimento = await queryOne<AtendimentoComCliente>(
      `SELECT 
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        u.nome as avaliador_nome
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
      WHERE a.id = ?`,
      [result.lastInsertRowid]
    );
    
    return NextResponse.json(
      novoAtendimento ? redactPatientContactFields(novoAtendimento, context.user) : novoAtendimento,
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao criar atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao criar atendimento' },
      { status: 500 }
    );
  }
});
