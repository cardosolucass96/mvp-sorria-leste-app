'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { PageHeader, Card, LoadingState, EmptyState, Alert } from '@/components/ui';
import { StatusBadge } from '@/components/domain';
import usePageTitle from '@/lib/utils/usePageTitle';

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
  usePageTitle('Fila de Execução');
  const { user } = useAuth();
  const router = useRouter();
  const [fila, setFila] = useState<FilaData>({ meusProcedimentos: [], disponiveis: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setError('Erro ao carregar procedimentos');
    } finally {
      setLoading(false);
    }
  }

  function ProcedimentoCard({ procedimento }: { procedimento: Procedimento }) {
    return (
      <Card
        variant="outlined"
        borderColor="border-info-500"
        onClick={() => router.push(`/execucao/${procedimento.id}`)}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">{procedimento.procedimento_nome}</h3>
            <p className="text-sm text-neutral-600">{procedimento.cliente_nome}</p>
            <p className="text-xs text-neutral-400">Atendimento #{procedimento.atendimento_id}</p>
          </div>
          <StatusBadge type="item" status={procedimento.status} />
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <LoadingState mode="skeleton" lines={5} />
      </div>
    );
  }

  const totalProcedimentos = fila.meusProcedimentos.length + fila.disponiveis.length;

  return (
    <div className="p-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader
        title="Fila de Execução"
        description={`${totalProcedimentos} procedimento${totalProcedimentos !== 1 ? 's' : ''}`}
      />

      {totalProcedimentos === 0 ? (
        <EmptyState
          icon="🦷"
          title="Nenhum procedimento na fila"
          description="Quando houver procedimentos pagos, eles aparecerão aqui."
        />
      ) : (
        <div className="space-y-8 mt-6">
          {/* Meus Procedimentos */}
          <section>
            <h2 className="text-lg font-bold text-neutral-800 mb-4 flex items-center gap-2">
              <span className="bg-info-100 text-info-800 px-3 py-1 rounded-full text-sm">
                👤 Meus Procedimentos
              </span>
              <span className="text-muted text-sm font-normal">
                ({fila.meusProcedimentos.length})
              </span>
            </h2>
            
            {fila.meusProcedimentos.length === 0 ? (
              <div className="bg-surface-secondary p-4 rounded-lg text-center text-muted">
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
            <h2 className="text-lg font-bold text-neutral-800 mb-4 flex items-center gap-2">
              <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">
                📋 Disponíveis para Pegar
              </span>
              <span className="text-muted text-sm font-normal">
                ({fila.disponiveis.length})
              </span>
            </h2>
            
            {fila.disponiveis.length === 0 ? (
              <div className="bg-surface-secondary p-4 rounded-lg text-center text-muted">
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
