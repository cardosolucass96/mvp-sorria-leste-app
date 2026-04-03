'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import Link from 'next/link';
import { CreditCard, Clock, Banknote } from 'lucide-react';
import { PageHeader, Alert, StatCard, Table, LoadingState, Button } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import { formatarMoeda, formatarData } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

interface Atendimento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  status: string;
  created_at: string;
}

interface AtendimentoComTotais extends Atendimento {
  total: number;
  total_pago: number;
}

export default function PagamentosPage() {
  usePageTitle('Pagamentos');
  const unitFetch = useUnitFetch();
  const [atendimentos, setAtendimentos] = useState<AtendimentoComTotais[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const carregarDados = useCallback(async () => {
    try {
      // Carrega atendimentos
      const resAtend = await unitFetch('/api/atendimentos');
      const atendData = await resAtend.json();
      
      // Filtra apenas aguardando_pagamento
      const aguardando = atendData.filter(
        (a: Atendimento) => a.status === 'aguardando_pagamento'
      );
      
      // Para cada atendimento, busca os detalhes com totais
      const atendimentosComTotais: AtendimentoComTotais[] = await Promise.all(
        aguardando.map(async (a: Atendimento) => {
          const resDetalhe = await unitFetch(`/api/atendimentos/${a.id}`);
          const detalhe = await resDetalhe.json();
          return {
            ...a,
            total: detalhe.total || 0,
            total_pago: detalhe.total_pago || 0,
          };
        })
      );
      
      setAtendimentos(atendimentosComTotais);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setError('Erro ao carregar dados de pagamentos');
    } finally {
      setLoading(false);
    }
  }, [unitFetch]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  if (loading) return <LoadingState />;

  const atendColumns: TableColumn<AtendimentoComTotais>[] = [
    { key: 'cliente_nome', label: 'Cliente' },
    { key: 'id', label: 'Atendimento', render: (a) => `#${a.id} - ${formatarData(a.created_at)}` },
    { key: 'total', label: 'Total', align: 'right', render: (a) => formatarMoeda(a.total) },
    { key: 'total_pago', label: 'Pago', align: 'right', render: (a) => <span className="text-success-600">{formatarMoeda(a.total_pago)}</span> },
    { key: 'pendente', label: 'Pendente', align: 'right', render: (a) => <span className="font-bold text-error-600">{formatarMoeda(a.total - a.total_pago)}</span> },
    { key: 'acoes', label: 'Ações', align: 'right', render: (a) => <Link href={`/atendimentos/${a.id}/pagamento`}><Button size="sm">💳 Receber</Button></Link> },
  ];

  return (
    <div className="space-y-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader title="Pagamentos" icon={<CreditCard className="w-7 h-7" />} description="Gerencie pagamentos pendentes" />

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard icon={<Clock className="w-6 h-6" />} label="Aguardando Pagamento" value={String(atendimentos.length)} color="border-warning-500" />
        <StatCard icon={<Banknote className="w-6 h-6" />} label="Total a Receber" value={formatarMoeda(atendimentos.reduce((acc, a) => acc + (a.total - a.total_pago), 0))} color="border-success-500" />
      </div>

      {/* Conteúdo */}
      <Table
        columns={atendColumns}
        data={atendimentos}
        keyExtractor={(a) => a.id}
        emptyMessage="🎉 Nenhum atendimento aguardando pagamento!"
        caption="Atendimentos aguardando pagamento"
      />
    </div>
  );
}
