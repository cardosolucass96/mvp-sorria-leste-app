'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface Procedimento {
  id: number;
  item_id: number;
  atendimento_id: number;
  procedimento_nome: string;
  cliente_nome: string;
  dentes: string | null;
  quantidade: number;
  status: string;
  tipo: 'avaliacao' | 'execucao';
  created_at: string;
  concluido_at: string | null;
}

export default function MeusProcedimentosPage() {
  const { user } = useAuth();
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'avaliacao' | 'execucao'>('todos');

  const carregarProcedimentos = useCallback(async () => {
    if (!user) return;
    
    try {
      const res = await fetch(`/api/meus-procedimentos?usuario_id=${user.id}`);
      const data = await res.json();
      setProcedimentos(data);
    } catch (error) {
      console.error('Erro ao carregar procedimentos:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    carregarProcedimentos();
  }, [carregarProcedimentos]);

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatarDentes = (dentes: string | null) => {
    if (!dentes) return null;
    try {
      const arr = JSON.parse(dentes);
      return arr.join(', ');
    } catch {
      return dentes;
    }
  };

  const procedimentosFiltrados = procedimentos.filter((p) => {
    if (filtro === 'todos') return true;
    return p.tipo === filtro;
  });

  const totalAvaliados = procedimentos.filter(p => p.tipo === 'avaliacao').length;
  const totalExecutados = procedimentos.filter(p => p.tipo === 'execucao').length;

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">📋 Meus Procedimentos</h1>
        <p className="text-gray-600">
          Histórico de procedimentos que você avaliou ou executou
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-blue-50 border border-blue-200">
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-700">{procedimentos.length}</p>
            <p className="text-sm text-blue-600">Total de Procedimentos</p>
          </div>
        </div>
        
        {user?.role === 'avaliador' || user?.role === 'admin' ? (
          <div className="card bg-purple-50 border border-purple-200">
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-700">{totalAvaliados}</p>
              <p className="text-sm text-purple-600">Avaliações Realizadas</p>
            </div>
          </div>
        ) : null}
        
        {user?.role === 'executor' || user?.role === 'admin' ? (
          <div className="card bg-green-50 border border-green-200">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-700">{totalExecutados}</p>
              <p className="text-sm text-green-600">Procedimentos Executados</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        <button
          onClick={() => setFiltro('todos')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filtro === 'todos'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Todos ({procedimentos.length})
        </button>
        {(user?.role === 'avaliador' || user?.role === 'admin') && (
          <button
            onClick={() => setFiltro('avaliacao')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtro === 'avaliacao'
                ? 'bg-purple-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🔍 Avaliações ({totalAvaliados})
          </button>
        )}
        {(user?.role === 'executor' || user?.role === 'admin') && (
          <button
            onClick={() => setFiltro('execucao')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtro === 'execucao'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🦷 Execuções ({totalExecutados})
          </button>
        )}
      </div>

      {/* Lista de procedimentos */}
      {procedimentosFiltrados.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 text-lg">📭 Nenhum procedimento encontrado</p>
          <p className="text-gray-400 text-sm mt-2">
            Os procedimentos que você avaliar ou executar aparecerão aqui
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Procedimento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Paciente
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Tipo
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Dentes
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Data
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {procedimentosFiltrados.map((proc) => (
                <tr key={`${proc.tipo}-${proc.item_id}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{proc.procedimento_nome}</div>
                    <div className="text-xs text-gray-500">Atendimento #{proc.atendimento_id}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    {proc.cliente_nome}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {proc.tipo === 'avaliacao' ? (
                      <span className="badge bg-purple-100 text-purple-700">🔍 Avaliação</span>
                    ) : (
                      <span className="badge bg-green-100 text-green-700">🦷 Execução</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center text-sm">
                    {proc.dentes ? (
                      <span className="text-orange-600 font-medium">
                        {formatarDentes(proc.dentes)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {proc.status === 'concluido' ? (
                      <span className="badge badge-success">✓ Concluído</span>
                    ) : proc.status === 'em_andamento' ? (
                      <span className="badge badge-warning">⏳ Em Andamento</span>
                    ) : (
                      <span className="badge badge-secondary">{proc.status}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-500">
                    {proc.concluido_at ? formatarData(proc.concluido_at) : formatarData(proc.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
