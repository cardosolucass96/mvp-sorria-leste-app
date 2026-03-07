'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader, StatCard, Badge, EmptyState, LoadingState, Tabs } from '@/components/ui';
import { StatusBadge } from '@/components/domain';
import { formatarData } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';
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
  usePageTitle('Meus Procedimentos');
  const { user, hasRole } = useAuth();
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('todos');

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

  const tabs = [
    { key: 'todos', label: 'Todos', count: procedimentos.length },
    ...(hasRole(['avaliador', 'admin']) ? [{ key: 'avaliacao', label: '🔍 Avaliações', count: totalAvaliados }] : []),
    ...(hasRole(['executor', 'admin']) ? [{ key: 'execucao', label: '🦷 Execuções', count: totalExecutados }] : []),
  ];

  if (loading) {
    return <LoadingState mode="spinner" text="Carregando..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="📋 Meus Procedimentos"
        description="Histórico de procedimentos que você avaliou ou executou"
      />

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon="📋"
          label="Total de Procedimentos"
          value={procedimentos.length}
          color="border-blue-400"
        />
        
        {hasRole(['avaliador', 'admin']) && (
          <StatCard
            icon="🔍"
            label="Avaliações Realizadas"
            value={totalAvaliados}
            color="border-purple-400"
          />
        )}
        
        {hasRole(['executor', 'admin']) && (
          <StatCard
            icon="🦷"
            label="Procedimentos Executados"
            value={totalExecutados}
            color="border-green-400"
          />
        )}
      </div>

      {/* Filtros */}
      <Tabs tabs={tabs} activeTab={filtro} onTabChange={setFiltro} variant="pills" />

      {/* Lista de procedimentos */}
      {procedimentosFiltrados.length === 0 ? (
        <EmptyState
          icon="📭"
          title="Nenhum procedimento encontrado"
          description="Os procedimentos que você avaliar ou executar aparecerão aqui"
        />
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
                      <Badge color="purple">🔍 Avaliação</Badge>
                    ) : (
                      <Badge color="green">🦷 Execução</Badge>
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
                    <StatusBadge type="item" status={proc.status} showIcon />
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-500">
                    {formatarData(proc.concluido_at || proc.created_at)}
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
