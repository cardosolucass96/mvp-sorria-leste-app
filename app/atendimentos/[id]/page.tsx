'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda, formatarDataHora } from '@/lib/utils/formatters';
import { STATUS_CONFIG, ITEM_STATUS_CONFIG, PROXIMOS_STATUS } from '@/lib/constants/status';
import type { AtendimentoStatus, ItemStatus } from '@/lib/types';
import { StatusBadge, StatusPipeline } from '@/components/domain';
import { ClipboardList } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Button, Card, Table, EmptyState } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import usePageTitle from '@/lib/utils/usePageTitle';

interface ItemAtendimento {
  id: number;
  procedimento_nome: string;
  executor_nome: string | null;
  criado_por_nome: string | null;
  valor: number;
  status: string;
}

interface Atendimento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  avaliador_id: number | null;
  avaliador_nome: string | null;
  liberado_por_nome: string | null;
  status: string;
  created_at: string;
  liberado_em: string | null;
  finalizado_at: string | null;
  itens: ItemAtendimento[];
  total: number;
  total_pago: number;
}

export default function AtendimentoDetalhePage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  usePageTitle('Detalhes do Atendimento');
  const { id } = use(params);
  const router = useRouter();
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mudandoStatus, setMudandoStatus] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [comissoesGeradas, setComissoesGeradas] = useState<{
    venda: number;
    execucao: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    carregarAtendimento();
  }, [id]);

  const carregarAtendimento = async () => {
    try {
      const res = await fetch(`/api/atendimentos/${id}`);
      if (!res.ok) {
        throw new Error('Atendimento não encontrado');
      }
      const data = await res.json();
      setAtendimento(data);
    } catch (error) {
      setError('Erro ao carregar atendimento');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleMudarStatus = async (novoStatus: string) => {
    if (!atendimento) return;
    
    setMudandoStatus(true);
    setError('');
    
    try {
      const res = await fetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao mudar status');
      }
      
      await carregarAtendimento();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao mudar status');
    } finally {
      setMudandoStatus(false);
    }
  };

  const handleFinalizar = async () => {
    if (!atendimento) return;
    
    setFinalizando(true);
    setError('');
    
    try {
      const res = await fetch(`/api/atendimentos/${id}/finalizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao finalizar atendimento');
      }
      
      // Salvar comissões geradas para exibir
      setComissoesGeradas(data.comissoes);
      await carregarAtendimento();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar');
    } finally {
      setFinalizando(false);
    }
  };

  if (loading) {
    return <LoadingState text="Carregando atendimento..." />;
  }

  if (!atendimento) {
    return (
      <EmptyState
        icon={<ClipboardList className="w-7 h-7" />}
        title="Atendimento não encontrado"
        actionLabel="Voltar para lista"
        onAction={() => router.push('/atendimentos')}
      />
    );
  }

  const statusConfig = STATUS_CONFIG[atendimento.status as AtendimentoStatus];
  const proximoStatus = PROXIMOS_STATUS[atendimento.status as AtendimentoStatus];

  const itensColumns: TableColumn<ItemAtendimento>[] = [
    { key: 'procedimento_nome', label: 'Procedimento' },
    { key: 'criado_por_nome', label: 'Vendedor', render: (item) => item.criado_por_nome || '-' },
    { key: 'executor_nome', label: 'Executor', render: (item) => item.executor_nome || '-' },
    { key: 'valor', label: 'Valor', align: 'right' as const, render: (item) => formatarMoeda(item.valor) },
    { key: 'status', label: 'Status', align: 'center' as const, render: (item) => <StatusBadge type="item" status={item.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Atendimento #${atendimento.id}`}
        icon={<ClipboardList className="w-7 h-7" />}
        breadcrumb={[
          { label: 'Atendimentos', href: '/atendimentos' },
          { label: `#${atendimento.id}` },
        ]}
        actions={
          <div className="flex gap-2 flex-wrap">
            {atendimento.status === 'em_execucao' && (
              <Button
                onClick={handleFinalizar}
                disabled={finalizando}
                variant="primary"
              >
                {finalizando ? 'Finalizando...' : 'Finalizar Atendimento'}
              </Button>
            )}
            {proximoStatus && atendimento.status !== 'em_execucao' && (
              <Button
                onClick={() => handleMudarStatus(proximoStatus)}
                disabled={mudandoStatus}
              >
                {mudandoStatus ? 'Processando...' : `Avançar para ${STATUS_CONFIG[proximoStatus].label}`}
              </Button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-2 -mt-4 mb-2">
        <StatusBadge type="atendimento" status={atendimento.status} />
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Comissões Geradas (após finalização) */}
      {comissoesGeradas && (
        <div className="p-4 bg-success-50 border border-success-200 rounded-lg">
          <h3 className="font-semibold text-success-800 mb-2">Atendimento Finalizado!</h3>
          <p className="text-sm text-success-700 mb-2">Comissões geradas:</p>
          <div className="flex gap-4">
            <div>
              <span className="text-xs text-success-600">Venda:</span>
              <span className="ml-1 font-semibold">{formatarMoeda(comissoesGeradas.venda)}</span>
            </div>
            <div>
              <span className="text-xs text-success-600">Execução:</span>
              <span className="ml-1 font-semibold">{formatarMoeda(comissoesGeradas.execucao)}</span>
            </div>
            <div>
              <span className="text-xs text-success-600">Total:</span>
              <span className="ml-1 font-bold">{formatarMoeda(comissoesGeradas.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Grid de Informações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dados do Cliente */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Cliente</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Nome</p>
              <p className="font-medium">{atendimento.cliente_nome}</p>
            </div>
            {atendimento.cliente_cpf && (
              <div>
                <p className="text-sm text-muted">CPF</p>
                <p className="font-medium">{atendimento.cliente_cpf}</p>
              </div>
            )}
            {atendimento.cliente_telefone && (
              <div>
                <p className="text-sm text-muted">Telefone</p>
                <p className="font-medium">{atendimento.cliente_telefone}</p>
              </div>
            )}
            {atendimento.cliente_email && (
              <div>
                <p className="text-sm text-muted">Email</p>
                <p className="font-medium">{atendimento.cliente_email}</p>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t">
            <Link 
              href={`/clientes/${atendimento.cliente_id}`}
              className="text-info-600 hover:text-info-800 text-sm"
            >
              Ver ficha completa →
            </Link>
          </div>
        </Card>

        {/* Dados do Atendimento */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Atendimento</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Status</p>
              <p className={`font-medium ${statusConfig.cor}`}>
                {statusConfig.label}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Avaliador</p>
              <p className="font-medium">
                {atendimento.avaliador_nome || 'Não definido'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Criado em</p>
              <p className="font-medium">{formatarDataHora(atendimento.created_at)}</p>
            </div>
            {atendimento.liberado_em && (
              <div>
                <p className="text-sm text-muted">Liberado para execução</p>
                <p className="font-medium">{formatarDataHora(atendimento.liberado_em)}</p>
                {atendimento.liberado_por_nome && (
                  <p className="text-xs text-muted">por {atendimento.liberado_por_nome}</p>
                )}
              </div>
            )}
            {atendimento.finalizado_at && (
              <div>
                <p className="text-sm text-muted">Finalizado em</p>
                <p className="font-medium">{formatarDataHora(atendimento.finalizado_at)}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Resumo Financeiro */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Financeiro</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Total</p>
              <p className="text-2xl font-bold text-foreground">
                {formatarMoeda(atendimento.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Pago</p>
              <p className="text-xl font-semibold text-success-600">
                {formatarMoeda(atendimento.total_pago)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Pendente</p>
              <p className={`text-xl font-semibold ${
                atendimento.total - atendimento.total_pago > 0 
                  ? 'text-error-600' 
                  : 'text-neutral-400'
              }`}>
                {formatarMoeda(atendimento.total - atendimento.total_pago)}
              </p>
            </div>
          </div>
          {atendimento.status === 'aguardando_pagamento' && (
            <div className="mt-4 pt-4 border-t">
              <Link href={`/atendimentos/${atendimento.id}/pagamento`}>
                <Button variant="secondary" className="w-full justify-center">
                  💳 Registrar Pagamento
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Procedimentos */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Procedimentos</h2>
          {(['triagem', 'avaliacao', 'em_execucao'].includes(atendimento.status)) && (
            <Link href={`/avaliacao/${atendimento.id}`}>
              <Button variant="secondary" size="sm">+ Adicionar Procedimento</Button>
            </Link>
          )}
        </div>
        
        <Table
          columns={itensColumns}
          data={atendimento.itens}
          keyExtractor={(item) => item.id}
          emptyMessage="Nenhum procedimento adicionado"
          caption="Procedimentos do atendimento"
        />

        {atendimento.itens.length > 0 && (
          <div className="mt-4 pt-4 border-t flex justify-end">
            <div className="text-right">
              <span className="text-sm text-muted mr-3">Total:</span>
              <span className="text-lg font-bold">{formatarMoeda(atendimento.total)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Timeline de Status */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">📍 Pipeline</h2>
        <StatusPipeline currentStatus={atendimento.status as AtendimentoStatus} />
      </Card>
    </div>
  );
}
