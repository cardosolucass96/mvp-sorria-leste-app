'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Tabs from '@/components/ui/Tabs';
import Table, { TableColumn } from '@/components/ui/Table';
import LoadingState from '@/components/ui/LoadingState';
import Button from '@/components/ui/Button';
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

interface Parcela {
  id: number;
  atendimento_id: number;
  numero: number;
  valor: number;
  data_vencimento: string;
  pago: number;
  cliente_nome: string;
}

export default function PagamentosPage() {
  usePageTitle('Pagamentos');
  const [atendimentos, setAtendimentos] = useState<AtendimentoComTotais[]>([]);
  const [parcelasVencidas, setParcelasVencidas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'aguardando' | 'parcelas'>('aguardando');

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      // Carrega atendimentos
      const resAtend = await fetch('/api/atendimentos');
      const atendData = await resAtend.json();
      
      // Filtra apenas aguardando_pagamento
      const aguardando = atendData.filter(
        (a: Atendimento) => a.status === 'aguardando_pagamento'
      );
      
      // Para cada atendimento, busca os detalhes com totais
      const atendimentosComTotais: AtendimentoComTotais[] = await Promise.all(
        aguardando.map(async (a: Atendimento) => {
          const resDetalhe = await fetch(`/api/atendimentos/${a.id}`);
          const detalhe = await resDetalhe.json();
          return {
            ...a,
            total: detalhe.total || 0,
            total_pago: detalhe.total_pago || 0,
          };
        })
      );
      
      setAtendimentos(atendimentosComTotais);
      
      // Carrega parcelas vencidas
      const resParcelas = await fetch('/api/parcelas/vencidas');
      if (resParcelas.ok) {
        const parcData = await resParcelas.json();
        setParcelasVencidas(parcData);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState />;

  const atendColumns: TableColumn<AtendimentoComTotais>[] = [
    { key: 'cliente_nome', header: 'Cliente' },
    { key: 'id', header: 'Atendimento', render: (a) => `#${a.id} - ${formatarData(a.created_at)}` },
    { key: 'total', header: 'Total', align: 'right', render: (a) => formatarMoeda(a.total) },
    { key: 'total_pago', header: 'Pago', align: 'right', render: (a) => <span className="text-green-600">{formatarMoeda(a.total_pago)}</span> },
    { key: 'pendente', header: 'Pendente', align: 'right', render: (a) => <span className="font-bold text-red-600">{formatarMoeda(a.total - a.total_pago)}</span> },
    { key: 'acoes', header: 'Ações', align: 'right', render: (a) => <Link href={`/atendimentos/${a.id}/pagamento`} className="btn btn-primary btn-sm">💳 Receber</Link> },
  ];

  const parcelaColumns: TableColumn<Parcela>[] = [
    { key: 'cliente_nome', header: 'Cliente' },
    { key: 'atendimento_id', header: 'Atendimento', render: (p) => `#${p.atendimento_id}` },
    { key: 'numero', header: 'Parcela', render: (p) => `${p.numero}ª Parcela` },
    { key: 'data_vencimento', header: 'Vencimento', render: (p) => <span className="text-red-600 font-medium">{formatarData(p.data_vencimento)} ⚠️</span> },
    { key: 'valor', header: 'Valor', align: 'right', render: (p) => <span className="font-bold text-red-600">{formatarMoeda(p.valor)}</span> },
    { key: 'acoes', header: 'Ações', align: 'right', render: (p) => <Link href={`/atendimentos/${p.atendimento_id}/pagamento`} className="btn btn-primary btn-sm">💳 Receber</Link> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Pagamentos" icon="💰" description="Gerencie pagamentos e parcelas pendentes" />

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon="⏳" label="Aguardando Pagamento" value={String(atendimentos.length)} color="border-yellow-500" />
        <StatCard icon="⚠️" label="Parcelas Vencidas" value={String(parcelasVencidas.length)} color="border-red-500" />
        <StatCard icon="💵" label="Total a Receber" value={formatarMoeda(atendimentos.reduce((acc, a) => acc + (a.total - a.total_pago), 0))} color="border-green-500" />
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'aguardando', label: `Aguardando Pagamento (${atendimentos.length})` },
          { key: 'parcelas', label: `Parcelas Vencidas (${parcelasVencidas.length})` },
        ]}
        activeTab={filtro}
        onChange={(key) => setFiltro(key as 'aguardando' | 'parcelas')}
      />

      {/* Conteúdo */}
      {filtro === 'aguardando' && (
        <Table
          columns={atendColumns}
          data={atendimentos}
          keyExtractor={(a) => a.id}
          emptyMessage="🎉 Nenhum atendimento aguardando pagamento!"
          caption="Atendimentos aguardando pagamento"
        />
      )}

      {filtro === 'parcelas' && (
        <Table
          columns={parcelaColumns}
          data={parcelasVencidas}
          keyExtractor={(p) => p.id}
          emptyMessage="🎉 Nenhuma parcela vencida!"
          caption="Parcelas vencidas"
        />
      )}
    </div>
  );
}
