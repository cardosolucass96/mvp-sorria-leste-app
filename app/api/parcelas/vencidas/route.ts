import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface ParcelaVencida {
  id: number;
  atendimento_id: number;
  numero: number;
  valor: number;
  data_vencimento: string;
  pago: number;
  cliente_nome: string;
}

// GET /api/parcelas/vencidas - Lista parcelas vencidas
export async function GET() {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    const parcelas = query<ParcelaVencida>(
      `SELECT 
        p.*,
        c.nome as cliente_nome
      FROM parcelas p
      INNER JOIN atendimentos a ON p.atendimento_id = a.id
      INNER JOIN clientes c ON a.cliente_id = c.id
      WHERE p.pago = 0 AND p.data_vencimento < ?
      ORDER BY p.data_vencimento ASC`,
      [hoje]
    );
    
    return NextResponse.json(parcelas);
  } catch (error) {
    console.error('Erro ao buscar parcelas vencidas:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar parcelas vencidas' },
      { status: 500 }
    );
  }
}
