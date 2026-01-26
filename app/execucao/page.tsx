'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface Procedimento {
  id: number;
  atendimento_id: number;
  procedimento_nome: string;
  cliente_nome: string;
  executor_id: number | null;
  status: string;
  created_at: string;
  concluido_at: string | null;
}

interface FilaData {
  meusProcedimentos: Procedimento[];
  disponiveis: Procedimento[];
}

export default function ExecucaoPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [fila, setFila] = useState<FilaData>({ meusProcedimentos: [], disponiveis: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      carregarProcedimentos();
    }
  }, [user?.id]);

  async function carregarProcedimentos() {
    try {
      const response = await fetch(`/api/execucao?executor_id=${user?.id}`);
      const data = await response.json();
      setFila(data);
    } catch (error) {
      console.error('Erro ao carregar procedimentos:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const badges: Record<string, string> = {
      pago: 'bg-green-100 text-green-800',
      executando: 'bg-blue-100 text-blue-800',
      concluido: 'bg-gray-100 text-gray-800',
    };
    
    const labels: Record<string, string> = {
      pago: 'Aguardando',
      executando: 'Em Execução',
      concluido: 'Concluído',
    };

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded ${badges[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  }

  function ProcedimentoCard({ procedimento }: { procedimento: Procedimento }) {
    return (
      <div
        className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer border-l-4 border-blue-500"
        onClick={() => router.push(`/execucao/${procedimento.id}`)}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{procedimento.procedimento_nome}</h3>
            <p className="text-sm text-gray-600">{procedimento.cliente_nome}</p>
            <p className="text-xs text-gray-400">Atendimento #{procedimento.atendimento_id}</p>
          </div>
          {getStatusBadge(procedimento.status)}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalProcedimentos = fila.meusProcedimentos.length + fila.disponiveis.length;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Fila de Execução</h1>
        <div className="text-sm text-gray-600">
          {totalProcedimentos} procedimento{totalProcedimentos !== 1 ? 's' : ''}
        </div>
      </div>

      {totalProcedimentos === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <p className="text-gray-600">Nenhum procedimento na fila.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Meus Procedimentos */}
          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                👤 Meus Procedimentos
              </span>
              <span className="text-gray-500 text-sm font-normal">
                ({fila.meusProcedimentos.length})
              </span>
            </h2>
            
            {fila.meusProcedimentos.length === 0 ? (
              <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
                Nenhum procedimento atribuído a você ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {fila.meusProcedimentos.map((proc) => (
                  <ProcedimentoCard key={proc.id} procedimento={proc} />
                ))}
              </div>
            )}
          </section>

          {/* Disponíveis para Pegar */}
          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">
                📋 Disponíveis para Pegar
              </span>
              <span className="text-gray-500 text-sm font-normal">
                ({fila.disponiveis.length})
              </span>
            </h2>
            
            {fila.disponiveis.length === 0 ? (
              <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
                Nenhum procedimento disponível no momento.
              </div>
            ) : (
              <div className="space-y-3">
                {fila.disponiveis.map((proc) => (
                  <ProcedimentoCard key={proc.id} procedimento={proc} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
