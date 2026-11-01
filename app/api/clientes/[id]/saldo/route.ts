import { NextRequest, NextResponse } from 'next/server';
import { consultarSaldo } from '@/modules/financeiro/server';
import {
  ensureCanManagePatientRegistration,
  getAuthenticatedRequestUser,
} from '@/lib/auth/patientPrivacy';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/clientes/[id]/saldo - Saldo atual + últimas movimentações
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401 });
    }
    const unauthorized = ensureCanManagePatientRegistration(user);
    if (unauthorized) return unauthorized;

    const { id } = await params;

    const result = await consultarSaldo(id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao buscar saldo do cliente:', error);
    return NextResponse.json({ error: 'Erro ao buscar saldo do cliente' }, { status: 500 });
  }
}
