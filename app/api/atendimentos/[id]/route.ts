import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query, execute } from '@/lib/db';

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
  cliente_email: string | null;
  avaliador_nome: string | null;
}

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number | null;
  valor: number;
  status: string;
  created_at: string;
  concluido_at: string | null;
  procedimento_nome: string;
  executor_nome: string | null;
}

interface CountResult {
  count: number;
}

interface SumResult {
  total: number | null;
}

// GET /api/atendimentos/[id] - Busca atendimento por ID com detalhes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Busca atendimento com dados do cliente
    const atendimento = queryOne<AtendimentoComCliente>(
      `SELECT 
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        c.email as cliente_email,
        u.nome as avaliador_nome,
        u2.nome as liberado_por_nome
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
      LEFT JOIN usuarios u2 ON a.liberado_por_id = u2.id
      WHERE a.id = ?`,
      [parseInt(id)]
    );
    
    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }
    
    // Busca itens do atendimento
    const itens = query<ItemAtendimento>(
      `SELECT 
        i.*,
        p.nome as procedimento_nome,
        u.nome as executor_nome,
        c.nome as criado_por_nome
      FROM itens_atendimento i
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios u ON i.executor_id = u.id
      LEFT JOIN usuarios c ON i.criado_por_id = c.id
      WHERE i.atendimento_id = ?
      ORDER BY i.created_at ASC`,
      [parseInt(id)]
    );
    
    // Calcula totais
    const totalResult = queryOne<SumResult>(
      'SELECT SUM(valor) as total FROM itens_atendimento WHERE atendimento_id = ?',
      [parseInt(id)]
    );
    
    const totalPagoResult = queryOne<SumResult>(
      'SELECT SUM(valor_pago) as total FROM itens_atendimento WHERE atendimento_id = ?',
      [parseInt(id)]
    );
    
    return NextResponse.json({
      ...atendimento,
      itens,
      total: totalResult?.total || 0,
      total_pago: totalPagoResult?.total || 0,
    });
  } catch (error) {
    console.error('Erro ao buscar atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar atendimento' },
      { status: 500 }
    );
  }
}

// PUT /api/atendimentos/[id] - Atualiza atendimento (muda status)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, avaliador_id } = body;
    
    // Verifica se existe
    const atendimento = queryOne<Atendimento>(
      'SELECT * FROM atendimentos WHERE id = ?',
      [parseInt(id)]
    );
    
    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }
    
    // Se está mudando status, valida as regras de transição
    if (status && status !== atendimento.status) {
      const validacao = validarTransicao(atendimento, status, parseInt(id));
      if (!validacao.valido) {
        return NextResponse.json(
          { error: validacao.mensagem },
          { status: 400 }
        );
      }
    }
    
    // Monta query de update
    const updates: string[] = [];
    const updateParams: (string | number | null)[] = [];
    
    if (status) {
      updates.push('status = ?');
      updateParams.push(status);
      
      // Se liberando para execução, marca quem liberou e quando
      if (status === 'em_execucao' && atendimento.status === 'aguardando_pagamento') {
        // TODO: Pegar usuário logado do contexto de autenticação
        const usuario = queryOne<{ id: number }>('SELECT id FROM usuarios LIMIT 1');
        const liberadoPorId = usuario?.id || 1;
        
        updates.push('liberado_por_id = ?');
        updateParams.push(liberadoPorId);
        updates.push('liberado_em = datetime(\'now\', \'localtime\')');
      }
      
      // Se finalizando, marca a data
      if (status === 'finalizado') {
        updates.push('finalizado_at = CURRENT_TIMESTAMP');
      }
    }
    
    if (avaliador_id !== undefined) {
      updates.push('avaliador_id = ?');
      updateParams.push(avaliador_id || null);
    }
    
    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum campo para atualizar' },
        { status: 400 }
      );
    }
    
    updateParams.push(parseInt(id));
    
    execute(
      `UPDATE atendimentos SET ${updates.join(', ')} WHERE id = ?`,
      updateParams
    );
    
    // Retorna atendimento atualizado
    const atualizado = queryOne<AtendimentoComCliente>(
      `SELECT 
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        u.nome as avaliador_nome,
        u2.nome as liberado_por_nome
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
      LEFT JOIN usuarios u2 ON a.liberado_por_id = u2.id
      WHERE a.id = ?`,
      [parseInt(id)]
    );
    
    return NextResponse.json(atualizado);
  } catch (error) {
    console.error('Erro ao atualizar atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar atendimento' },
      { status: 500 }
    );
  }
}

// Função para validar transições de status
function validarTransicao(
  atendimento: Atendimento,
  novoStatus: string,
  atendimentoId: number
): { valido: boolean; mensagem: string } {
  const statusAtual = atendimento.status;
  
  // Transições permitidas
  const transicoesPermitidas: Record<string, string[]> = {
    triagem: ['avaliacao'],
    avaliacao: ['aguardando_pagamento'],
    aguardando_pagamento: ['em_execucao'],
    em_execucao: ['aguardando_pagamento', 'finalizado'],
    finalizado: [],
  };
  
  // Verifica se a transição é permitida
  if (!transicoesPermitidas[statusAtual]?.includes(novoStatus)) {
    return {
      valido: false,
      mensagem: `Não é possível mudar de "${statusAtual}" para "${novoStatus}"`,
    };
  }
  
  // Validações específicas por transição
  
  // Avaliação → Aguardando Pagamento: precisa ter pelo menos 1 procedimento
  if (statusAtual === 'avaliacao' && novoStatus === 'aguardando_pagamento') {
    const itens = queryOne<CountResult>(
      'SELECT COUNT(*) as count FROM itens_atendimento WHERE atendimento_id = ?',
      [atendimentoId]
    );
    
    if (!itens || itens.count === 0) {
      return {
        valido: false,
        mensagem: 'É necessário adicionar pelo menos um procedimento',
      };
    }
  }
  
  // Aguardando Pagamento → Em Execução: precisa ter pelo menos 1 procedimento pago
  if (statusAtual === 'aguardando_pagamento' && novoStatus === 'em_execucao') {
    const itensPagos = queryOne<CountResult>(
      `SELECT COUNT(*) as count FROM itens_atendimento 
       WHERE atendimento_id = ? AND status = 'pago'`,
      [atendimentoId]
    );
    
    if (!itensPagos || itensPagos.count === 0) {
      return {
        valido: false,
        mensagem: 'É necessário ter pelo menos um procedimento totalmente pago para liberar',
      };
    }
  }
  
  // Em Execução → Finalizado: todos procedimentos concluídos e tudo pago
  if (statusAtual === 'em_execucao' && novoStatus === 'finalizado') {
    const pendentes = queryOne<CountResult>(
      `SELECT COUNT(*) as count FROM itens_atendimento 
       WHERE atendimento_id = ? AND status != 'concluido'`,
      [atendimentoId]
    );
    
    if (pendentes && pendentes.count > 0) {
      return {
        valido: false,
        mensagem: 'Existem procedimentos não concluídos',
      };
    }
    
    const total = queryOne<SumResult>(
      'SELECT SUM(valor) as total FROM itens_atendimento WHERE atendimento_id = ?',
      [atendimentoId]
    );
    
    const pago = queryOne<SumResult>(
      'SELECT SUM(valor) as total FROM pagamentos WHERE atendimento_id = ?',
      [atendimentoId]
    );
    
    const valorTotal = total?.total || 0;
    const valorPago = pago?.total || 0;
    
    if (valorPago < valorTotal) {
      return {
        valido: false,
        mensagem: `Pagamento incompleto. Total: R$ ${valorTotal.toFixed(2)}, Pago: R$ ${valorPago.toFixed(2)}`,
      };
    }
  }
  
  return { valido: true, mensagem: '' };
}
