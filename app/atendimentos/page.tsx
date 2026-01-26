'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Atendimento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  avaliador_nome: string | null;
  status: string;
  created_at: string;
}

type StatusType = 'triagem' | 'avaliacao' | 'aguardando_pagamento' | 'em_execucao' | 'finalizado';

const STATUS_CONFIG: Record<StatusType, { label: string; cor: string; bgCor: string }> = {
  triagem: { label: 'Triagem', cor: 'text-gray-700', bgCor: 'bg-gray-100' },
  avaliacao: { label: 'Avaliação', cor: 'text-blue-700', bgCor: 'bg-blue-100' },
  aguardando_pagamento: { label: 'Aguardando Pagamento', cor: 'text-yellow-700', bgCor: 'bg-yellow-100' },
  em_execucao: { label: 'Em Execução', cor: 'text-purple-700', bgCor: 'bg-purple-100' },
  finalizado: { label: 'Finalizado', cor: 'text-green-700', bgCor: 'bg-green-100' },
};

const STATUS_ORDER: StatusType[] = ['triagem', 'avaliacao', 'aguardando_pagamento', 'em_execucao', 'finalizado'];

export default function AtendimentosPage() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'lista'>('kanban');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');

  const carregarAtendimentos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (busca) params.append('busca', busca);
      if (filtroStatus) params.append('status', filtroStatus);
      
      const res = await fetch(`/api/atendimentos?${params}`);
      const data = await res.json();
      setAtendimentos(data);
    } catch (error) {
      console.error('Erro ao carregar atendimentos:', error);
    } finally {
      setLoading(false);
    }
  }, [busca, filtroStatus]);

  useEffect(() => {
    carregarAtendimentos();
  }, [carregarAtendimentos]);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    carregarAtendimentos();
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

  const atendimentosPorStatus = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = atendimentos.filter((a) => a.status === status);
    return acc;
  }, {} as Record<StatusType, Atendimento[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📋 Atendimentos</h1>
          <p className="text-gray-600">Pipeline de atendimentos</p>
        </div>
        <div className="flex gap-2">
          {/* Toggle de Visualização */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-2 text-sm ${
                viewMode === 'kanban' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Kanban
            </button>
            <button
              onClick={() => setViewMode('lista')}
              className={`px-3 py-2 text-sm ${
                viewMode === 'lista' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Lista
            </button>
          </div>
          <Link href="/atendimentos/novo" className="btn btn-primary">
            + Novo Atendimento
          </Link>
        </div>
      </div>

      {/* Busca e Filtros */}
      <div className="card">
        <form onSubmit={handleBuscar} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar cliente
            </label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome ou CPF do cliente..."
              className="input"
            />
          </div>
          
          {viewMode === 'lista' && (
            <div className="min-w-[180px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="input"
              >
                <option value="">Todos</option>
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_CONFIG[status].label}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <button type="submit" className="btn btn-secondary">
            Buscar
          </button>
        </form>
      </div>

      {/* Visualização Kanban */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_ORDER.map((status) => (
            <div 
              key={status} 
              className="flex-shrink-0 w-72 bg-gray-100 rounded-lg"
            >
              {/* Header da Coluna */}
              <div className={`p-3 rounded-t-lg ${STATUS_CONFIG[status].bgCor}`}>
                <div className="flex justify-between items-center">
                  <h3 className={`font-semibold ${STATUS_CONFIG[status].cor}`}>
                    {STATUS_CONFIG[status].label}
                  </h3>
                  <span className={`text-sm px-2 py-0.5 rounded-full ${STATUS_CONFIG[status].bgCor} ${STATUS_CONFIG[status].cor}`}>
                    {atendimentosPorStatus[status].length}
                  </span>
                </div>
              </div>
              
              {/* Cards */}
              <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                {atendimentosPorStatus[status].length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">
                    Nenhum atendimento
                  </div>
                ) : (
                  atendimentosPorStatus[status].map((atendimento) => (
                    <Link
                      key={atendimento.id}
                      href={`/atendimentos/${atendimento.id}`}
                      className="block bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow border border-gray-200"
                    >
                      <div className="font-medium text-gray-900 mb-1">
                        {atendimento.cliente_nome}
                      </div>
                      {atendimento.cliente_telefone && (
                        <div className="text-sm text-gray-500 mb-2">
                          📞 {atendimento.cliente_telefone}
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs text-gray-400">
                        <span>#{atendimento.id}</span>
                        <span>{formatarData(atendimento.created_at).split(' ')[0]}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Visualização Lista */}
      {viewMode === 'lista' && (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Avaliador
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Criado em
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {atendimentos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Nenhum atendimento encontrado
                  </td>
                </tr>
              ) : (
                atendimentos.map((atendimento) => {
                  const statusConfig = STATUS_CONFIG[atendimento.status as StatusType];
                  return (
                    <tr key={atendimento.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-500">
                        #{atendimento.id}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">
                          {atendimento.cliente_nome}
                        </div>
                        <div className="text-sm text-gray-500">
                          {atendimento.cliente_telefone}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {atendimento.avaliador_nome || '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusConfig.bgCor} ${statusConfig.cor}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatarData(atendimento.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/atendimentos/${atendimento.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Ver detalhes
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Resumo */}
      <div className="text-sm text-gray-500">
        Total: {atendimentos.length} atendimento(s)
      </div>
    </div>
  );
}
