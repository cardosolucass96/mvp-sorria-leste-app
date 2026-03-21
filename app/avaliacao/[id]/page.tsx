'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import SeletorDentes from '@/components/SeletorDentes';
import { formatarMoeda } from '@/lib/utils/formatters';
import { Alert, LoadingState, PageHeader, Card, Button, Select, Input, EmptyState } from '@/components/ui';
import usePageTitle from '@/lib/utils/usePageTitle';

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  por_dente: number;
}

interface Usuario {
  id: number;
  nome: string;
  role: string;
}

interface ItemAtendimento {
  id: number;
  procedimento_id: number;
  procedimento_nome: string;
  executor_id: number | null;
  executor_nome: string | null;
  criado_por_id: number | null;
  criado_por_nome: string | null;
  valor: number;
  status: string;
}

interface Atendimento {
  id: number;
  cliente_nome: string;
  status: string;
  avaliador_nome: string | null;
  itens: ItemAtendimento[];
  total: number;
}

export default function AvaliacaoDetalhePage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  usePageTitle('Detalhes da Avaliação');
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form para novo procedimento
  const [procedimentoId, setProcedimentoId] = useState('');
  const [executorId, setExecutorId] = useState('');
  const [valorCustom, setValorCustom] = useState('');
  const [dentesSelecionados, setDentesSelecionados] = useState<string[]>([]);
  const [adicionando, setAdicionando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);

  useEffect(() => {
    carregarDados();
  }, [id]);

  const carregarDados = async () => {
    try {
      // Carrega atendimento
      const resAtend = await fetch(`/api/atendimentos/${id}`);
      if (!resAtend.ok) throw new Error('Atendimento não encontrado');
      const atendData = await resAtend.json();
      setAtendimento(atendData);
      
      // Carrega procedimentos
      const resProc = await fetch('/api/procedimentos');
      const procData = await resProc.json();
      setProcedimentos(procData);
      
      // Carrega executores
      const resUsers = await fetch('/api/usuarios');
      const usersData = await resUsers.json();
      setExecutores(
        usersData.filter((u: Usuario) => u.role === 'executor' || u.role === 'admin')
      );
    } catch (err) {
      setError('Erro ao carregar dados');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdicionarProcedimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!procedimentoId) return;
    
    const proc = procedimentos.find(p => p.id === parseInt(procedimentoId));
    
    // Validar se precisa de dentes selecionados
    if (proc?.por_dente && dentesSelecionados.length === 0) {
      setError('Selecione pelo menos um dente para este procedimento');
      return;
    }
    
    setAdicionando(true);
    setError('');
    
    try {
      // Calcular valor baseado em quantidade de dentes (se aplicável)
      const quantidade = proc?.por_dente ? dentesSelecionados.length : 1;
      const valorBase = valorCustom ? parseFloat(valorCustom) : proc?.valor || 0;
      const valorTotal = valorBase * quantidade;
      
      const res = await fetch(`/api/atendimentos/${id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: parseInt(procedimentoId),
          executor_id: executorId ? parseInt(executorId) : null,
          criado_por_id: user?.id,
          valor: valorTotal,
          dentes: proc?.por_dente ? JSON.stringify(dentesSelecionados) : null,
          quantidade: quantidade,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao adicionar');
      }
      
      // Limpa form e recarrega
      setProcedimentoId('');
      setExecutorId('');
      setValorCustom('');
      setDentesSelecionados([]);
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar');
    } finally {
      setAdicionando(false);
    }
  };

  const handleRemoverItem = async (itemId: number) => {
    if (!confirm('Deseja remover este procedimento?')) return;
    
    try {
      const res = await fetch(
        `/api/atendimentos/${id}/itens?item_id=${itemId}&usuario_id=${user?.id}`,
        { method: 'DELETE' }
      );
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao remover');
      }
      
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover');
    }
  };

  const handleAtualizarExecutor = async (itemId: number, novoExecutorId: string) => {
    try {
      await fetch(`/api/atendimentos/${id}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executor_id: novoExecutorId ? parseInt(novoExecutorId) : null,
        }),
      });
      
      await carregarDados();
    } catch (err) {
      console.error('Erro ao atualizar executor:', err);
    }
  };

  const handleFinalizarAvaliacao = async () => {
    if (!atendimento || atendimento.itens.length === 0) {
      setError('Adicione pelo menos um procedimento');
      return;
    }
    
    setFinalizando(true);
    setError('');
    
    try {
      const res = await fetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aguardando_pagamento' }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao finalizar');
      }
      
      router.push('/avaliacao');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar');
    } finally {
      setFinalizando(false);
    }
  };

  const procedimentoSelecionado = procedimentos.find(
    p => p.id === parseInt(procedimentoId)
  );

  // Calcular valor total com base em dentes selecionados
  const calcularValorTotal = () => {
    if (!procedimentoSelecionado) return 0;
    const valorBase = valorCustom ? parseFloat(valorCustom) : procedimentoSelecionado.valor;
    const quantidade = procedimentoSelecionado.por_dente ? dentesSelecionados.length : 1;
    return valorBase * quantidade;
  };

  if (loading) {
    return <LoadingState text="Carregando avaliação..." />;
  }

  if (!atendimento) {
    return (
      <EmptyState
        icon="🔍"
        title="Atendimento não encontrado"
        actionLabel="Voltar para fila"
        onAction={() => router.push('/avaliacao')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Avaliação - ${atendimento.cliente_nome}`}
        icon="🔍"
        description={`Atendimento #${atendimento.id}`}
        breadcrumb={[
          { label: 'Avaliações', href: '/avaliacao' },
          { label: atendimento.cliente_nome },
        ]}
        actions={
          <Button
            onClick={handleFinalizarAvaliacao}
            disabled={finalizando || atendimento.itens.length === 0}
            loading={finalizando}
          >
            ✓ Finalizar Avaliação
          </Button>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      {/* Aviso de privacidade */}
      <Card className="bg-yellow-50 border border-yellow-200">
        <p className="text-sm text-yellow-800">
          <strong>⚠️ Modo Avaliação:</strong> Você está vendo apenas o nome do paciente.
          Os dados pessoais (CPF, telefone, email) estão ocultos por privacidade.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Adicionar Procedimento */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">➕ Adicionar Procedimento</h2>
          
          <form onSubmit={handleAdicionarProcedimento} className="space-y-4">
            <div>
              <Select
                label="Procedimento *"
                name="procedimento"
                value={procedimentoId}
                onChange={(value) => {
                  setProcedimentoId(value);
                  setValorCustom('');
                  setDentesSelecionados([]);
                }}
                options={procedimentos.map((proc) => ({
                  value: String(proc.id),
                  label: `${proc.nome} - ${formatarMoeda(proc.valor)}${proc.por_dente ? ' (por dente)' : ''}`,
                }))}
                placeholder="Selecione..."
                required
              />
            </div>
            
            {/* Seletor de Dentes (se aplicável) */}
            {procedimentoSelecionado?.por_dente === 1 && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Dentes *
                </label>
                <SeletorDentes
                  dentesSelecionados={dentesSelecionados}
                  onChange={setDentesSelecionados}
                  disabled={adicionando}
                />
                {dentesSelecionados.length > 0 && (
                  <p className="text-sm text-info-600 mt-2">
                    Valor: {formatarMoeda(procedimentoSelecionado.valor)} × {dentesSelecionados.length} dentes = <strong>{formatarMoeda(calcularValorTotal())}</strong>
                  </p>
                )}
              </div>
            )}
            
            <div>
              <Select
                label="Executor"
                name="executor"
                value={executorId}
                onChange={(value) => setExecutorId(value)}
                options={executores.map((exec) => ({ value: String(exec.id), label: exec.nome }))}
                placeholder="Definir depois"
              />
            </div>
            
            <div>
              <Input
                label="Valor (R$)"
                name="valor"
                type="number"
                value={valorCustom}
                onChange={(value) => setValorCustom(value)}
                placeholder={procedimentoSelecionado 
                  ? `Padrão: ${procedimentoSelecionado.valor}` 
                  : 'Selecione um procedimento'}
                hint={procedimentoSelecionado && !valorCustom
                  ? `Valor padrão será usado: ${formatarMoeda(procedimentoSelecionado.valor)}`
                  : undefined}
              />
            </div>
            
            <Button
              type="submit"
              variant="secondary"
              disabled={!procedimentoId || adicionando}
              loading={adicionando}
              className="w-full"
            >
              + Adicionar
            </Button>
          </form>
        </Card>

        {/* Resumo Financeiro */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">💰 Resumo</h2>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-surface-secondary rounded-lg">
              <span className="text-neutral-600">Total de Procedimentos</span>
              <span className="text-xl font-bold">{atendimento.itens.length}</span>
            </div>
            
            <div className="flex justify-between items-center p-4 bg-info-50 rounded-lg">
              <span className="text-info-700">Valor Total</span>
              <span className="text-2xl font-bold text-info-700">
                {formatarMoeda(atendimento.total)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Lista de Procedimentos */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">🦷 Procedimentos Adicionados</h2>
        
        {atendimento.itens.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <p>Nenhum procedimento adicionado ainda</p>
            <p className="text-sm mt-2">
              Use o formulário ao lado para adicionar procedimentos
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-surface-secondary">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                  Procedimento
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                  Vendedor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                  Executor
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                  Valor
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-neutral-200">
              {atendimento.itens.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {item.procedimento_nome}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600">
                    {item.criado_por_nome || 'N/A'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={item.executor_id || ''}
                      onChange={(e) => handleAtualizarExecutor(item.id, e.target.value)}
                      className="input text-sm py-1"
                    >
                      <option value="">Não definido</option>
                      {executores.map((exec) => (
                        <option key={exec.id} value={exec.id}>
                          {exec.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatarMoeda(item.valor)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {atendimento.status === 'avaliacao' && (
                      <button
                        onClick={() => handleRemoverItem(item.id)}
                        className="text-error-600 hover:text-error-800 text-sm"
                      >
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-secondary">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-semibold">
                  Total:
                </td>
                <td className="px-4 py-3 text-right font-bold text-lg text-info-600">
                  {formatarMoeda(atendimento.total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      {/* Aviso para finalizar */}
      {atendimento.itens.length > 0 && (
        <Card className="bg-success-50 border border-success-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-success-900">
                ✓ Avaliação pronta para ser finalizada
              </p>
              <p className="text-sm text-success-700">
                O paciente será encaminhado para pagamento
              </p>
            </div>
            <Button
              onClick={handleFinalizarAvaliacao}
              disabled={finalizando}
              loading={finalizando}
            >
              Finalizar Avaliação →
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
