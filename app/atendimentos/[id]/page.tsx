'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

type StatusType = 'triagem' | 'avaliacao' | 'aguardando_pagamento' | 'em_execucao' | 'finalizado';

const STATUS_CONFIG: Record<StatusType, { label: string; cor: string; bgCor: string }> = {
  triagem: { label: 'Triagem', cor: 'text-gray-700', bgCor: 'bg-gray-100' },
  avaliacao: { label: 'Avaliação', cor: 'text-blue-700', bgCor: 'bg-blue-100' },
  aguardando_pagamento: { label: 'Aguardando Pagamento', cor: 'text-yellow-700', bgCor: 'bg-yellow-100' },
  em_execucao: { label: 'Em Execução', cor: 'text-purple-700', bgCor: 'bg-purple-100' },
  finalizado: { label: 'Finalizado', cor: 'text-green-700', bgCor: 'bg-green-100' },
};

const ITEM_STATUS: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Pendente', cor: 'text-gray-600' },
  pago: { label: 'Pago', cor: 'text-yellow-600' },
  executando: { label: 'Executando', cor: 'text-blue-600' },
  concluido: { label: 'Concluído', cor: 'text-green-600' },
};

// Próximos status possíveis
const PROXIMOS_STATUS: Record<StatusType, StatusType | null> = {
  triagem: 'avaliacao',
  avaliacao: 'aguardando_pagamento',
  aguardando_pagamento: 'em_execucao',
  em_execucao: 'finalizado',
  finalizado: null,
};

export default function AtendimentoDetalhePage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
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

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
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

  const statusConfig = STATUS_CONFIG[atendimento.status as StatusType];
  const proximoStatus = PROXIMOS_STATUS[atendimento.status as StatusType];

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
            <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bgCor} ${statusConfig.cor}`}>
              {statusConfig.label}
            </span>
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

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

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
              <p className="font-medium">{formatarData(atendimento.created_at)}</p>
            </div>
            {atendimento.liberado_em && (
              <div>
                <p className="text-sm text-gray-500">Liberado para execução</p>
                <p className="font-medium">{formatarData(atendimento.liberado_em)}</p>
                {atendimento.liberado_por_nome && (
                  <p className="text-xs text-gray-500">por {atendimento.liberado_por_nome}</p>
                )}
              </div>
            )}
            {atendimento.finalizado_at && (
              <div>
                <p className="text-sm text-gray-500">Finalizado em</p>
                <p className="font-medium">{formatarData(atendimento.finalizado_at)}</p>
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
                const itemConfig = ITEM_STATUS[item.status] || ITEM_STATUS.pendente;
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
                      <span className={`text-sm font-medium ${itemConfig.cor}`}>
                        {itemConfig.label}
                      </span>
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
        <div className="flex items-center justify-between">
          {Object.entries(STATUS_CONFIG).map(([status, config], index) => {
            const isAtual = atendimento.status === status;
            const isPast = Object.keys(STATUS_CONFIG).indexOf(atendimento.status) > index;
            
            return (
              <div key={status} className="flex-1 flex items-center">
                <div className={`
                  flex flex-col items-center
                  ${isAtual ? 'text-blue-600' : isPast ? 'text-green-600' : 'text-gray-400'}
                `}>
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${isAtual ? 'bg-blue-600 text-white' : isPast ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}
                  `}>
                    {isPast ? '✓' : index + 1}
                  </div>
                  <span className="text-xs mt-1 text-center max-w-[80px]">
                    {config.label}
                  </span>
                </div>
                {index < Object.keys(STATUS_CONFIG).length - 1 && (
                  <div className={`flex-1 h-1 mx-2 ${isPast ? 'bg-green-600' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
