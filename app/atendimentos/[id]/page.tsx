'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda, formatarDataHora } from '@/lib/utils/formatters';
import { STATUS_CONFIG, ITEM_STATUS_CONFIG, PROXIMOS_STATUS } from '@/lib/constants/status';
import type { AtendimentoStatus, ItemStatus } from '@/lib/types';
import { StatusBadge, StatusPipeline } from '@/components/domain';
import Alert from '@/components/ui/Alert';
import LoadingState from '@/components/ui/LoadingState';
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
    return <LoadingState message="Carregando atendimento..." />;
  }

  if (!atendimento) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Atendimento não encontrado</p>
        <Link href="/atendimentos" className="text-blue-600">
          ← Voltar para lista
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[atendimento.status as AtendimentoStatus];
  const proximoStatus = PROXIMOS_STATUS[atendimento.status as AtendimentoStatus];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/atendimentos" 
            className="text-gray-500 hover:text-gray-700"
          >
            ← Voltar
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Atendimento #{atendimento.id}
            </h1>
            <StatusBadge type="atendimento" status={atendimento.status} />
          </div>
        </div>
        
        {/* Ações de Status */}
        <div className="flex gap-2">
          {atendimento.status === 'em_execucao' && (
            <button
              onClick={handleFinalizar}
              disabled={finalizando}
              className="btn bg-green-600 text-white hover:bg-green-700"
            >
              {finalizando ? 'Finalizando...' : '✅ Finalizar Atendimento'}
            </button>
          )}
          {proximoStatus && atendimento.status !== 'em_execucao' && (
            <button
              onClick={() => handleMudarStatus(proximoStatus)}
              disabled={mudandoStatus}
              className="btn btn-primary"
            >
              {mudandoStatus ? 'Processando...' : `Avançar para ${STATUS_CONFIG[proximoStatus].label}`}
            </button>
          )}
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Comissões Geradas (após finalização) */}
      {comissoesGeradas && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-semibold text-green-800 mb-2">✅ Atendimento Finalizado!</h3>
          <p className="text-sm text-green-700 mb-2">Comissões geradas:</p>
          <div className="flex gap-4">
            <div>
              <span className="text-xs text-green-600">Venda:</span>
              <span className="ml-1 font-semibold">{formatarMoeda(comissoesGeradas.venda)}</span>
            </div>
            <div>
              <span className="text-xs text-green-600">Execução:</span>
              <span className="ml-1 font-semibold">{formatarMoeda(comissoesGeradas.execucao)}</span>
            </div>
            <div>
              <span className="text-xs text-green-600">Total:</span>
              <span className="ml-1 font-bold">{formatarMoeda(comissoesGeradas.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Grid de Informações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dados do Cliente */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">👤 Cliente</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Nome</p>
              <p className="font-medium">{atendimento.cliente_nome}</p>
            </div>
            {atendimento.cliente_cpf && (
              <div>
                <p className="text-sm text-gray-500">CPF</p>
                <p className="font-medium">{atendimento.cliente_cpf}</p>
              </div>
            )}
            {atendimento.cliente_telefone && (
              <div>
                <p className="text-sm text-gray-500">Telefone</p>
                <p className="font-medium">{atendimento.cliente_telefone}</p>
              </div>
            )}
            {atendimento.cliente_email && (
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium">{atendimento.cliente_email}</p>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t">
            <Link 
              href={`/clientes/${atendimento.cliente_id}`}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              Ver ficha completa →
            </Link>
          </div>
        </div>

        {/* Dados do Atendimento */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">📋 Atendimento</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className={`font-medium ${statusConfig.cor}`}>
                {statusConfig.label}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Avaliador</p>
              <p className="font-medium">
                {atendimento.avaliador_nome || 'Não definido'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Criado em</p>
              <p className="font-medium">{formatarDataHora(atendimento.created_at)}</p>
            </div>
            {atendimento.liberado_em && (
              <div>
                <p className="text-sm text-gray-500">Liberado para execução</p>
                <p className="font-medium">{formatarDataHora(atendimento.liberado_em)}</p>
                {atendimento.liberado_por_nome && (
                  <p className="text-xs text-gray-500">por {atendimento.liberado_por_nome}</p>
                )}
              </div>
            )}
            {atendimento.finalizado_at && (
              <div>
                <p className="text-sm text-gray-500">Finalizado em</p>
                <p className="font-medium">{formatarDataHora(atendimento.finalizado_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Resumo Financeiro */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">💰 Financeiro</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatarMoeda(atendimento.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Pago</p>
              <p className="text-xl font-semibold text-green-600">
                {formatarMoeda(atendimento.total_pago)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Pendente</p>
              <p className={`text-xl font-semibold ${
                atendimento.total - atendimento.total_pago > 0 
                  ? 'text-red-600' 
                  : 'text-gray-400'
              }`}>
                {formatarMoeda(atendimento.total - atendimento.total_pago)}
              </p>
            </div>
          </div>
          {atendimento.status === 'aguardando_pagamento' && (
            <div className="mt-4 pt-4 border-t">
              <Link 
                href={`/atendimentos/${atendimento.id}/pagamento`}
                className="btn btn-secondary w-full justify-center"
              >
                💳 Registrar Pagamento
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Procedimentos */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">🦷 Procedimentos</h2>
          {(['triagem', 'avaliacao', 'em_execucao'].includes(atendimento.status)) && (
            <Link 
              href={`/avaliacao/${atendimento.id}`}
              className="btn btn-secondary text-sm"
            >
              + Adicionar Procedimento
            </Link>
          )}
        </div>
        
        {atendimento.itens.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Nenhum procedimento adicionado</p>
            {atendimento.status === 'avaliacao' && (
              <p className="text-sm mt-2">
                Adicione procedimentos para continuar o atendimento
              </p>
            )}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Procedimento
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vendedor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Executor
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Valor
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {atendimento.itens.map((item) => {
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {item.procedimento_nome}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.criado_por_nome || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.executor_nome || '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatarMoeda(item.valor)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge type="item" status={item.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-semibold">
                  Total:
                </td>
                <td className="px-4 py-3 text-right font-bold text-lg">
                  {formatarMoeda(atendimento.total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Timeline de Status */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">📍 Pipeline</h2>
        <StatusPipeline currentStatus={atendimento.status as AtendimentoStatus} />
      </div>
    </div>
  );
}
