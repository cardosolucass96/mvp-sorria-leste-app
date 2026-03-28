'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import SeletorDentes, { type DenteFaceInput } from '@/components/SeletorDentes';
import { formatarMoeda } from '@/lib/utils/formatters';
import { Search } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Card, Button, Select, Input, EmptyState, ConfirmDialog } from '@/components/ui';
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
  const [dentesFaces, setDentesFaces] = useState<DenteFaceInput[]>([]);
  const [adicionando, setAdicionando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [editingValorId, setEditingValorId] = useState<number | null>(null);
  const [editingValorValue, setEditingValorValue] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const openConfirm = (config: Omit<typeof confirmDialog, 'isOpen'>) => {
    setConfirmDialog({ ...config, isOpen: true });
  };

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
    if (proc?.por_dente && dentesFaces.length === 0) {
      setError('Selecione pelo menos um dente para este procedimento');
      return;
    }
    if (proc?.por_dente && dentesFaces.some(d => d.faces.length === 0)) {
      setError('Selecione ao menos uma face para cada dente');
      return;
    }
    
    setAdicionando(true);
    setError('');
    
    try {
      // Calcular valor baseado em quantidade de dentes (se aplicável)
      const quantidade = proc?.por_dente ? dentesFaces.length : 1;
      const valorBase = valorCustom ? parseFloat(valorCustom) : proc?.valor || 0;
      const valorTotal = valorBase * quantidade;

      // Converte para formato de armazenamento com concluido por face
      const dentesParaSalvar = proc?.por_dente
        ? JSON.stringify(dentesFaces.map(d => ({
            dente: d.dente,
            faces: d.faces.map(f => ({ nome: f, concluido: false })),
          })))
        : null;

      const res = await fetch(`/api/atendimentos/${id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: parseInt(procedimentoId),
          executor_id: executorId ? parseInt(executorId) : null,
          criado_por_id: user?.id,
          valor: valorTotal,
          dentes: dentesParaSalvar,
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
      setDentesFaces([]);
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar');
    } finally {
      setAdicionando(false);
    }
  };

  const handleRemoverItem = (itemId: number) => {
    openConfirm({
      title: 'Remover Procedimento',
      message: 'Deseja remover este procedimento?',
      confirmLabel: 'Remover',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
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
      },
    });
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

  const handleAtualizarValor = async (itemId: number) => {
    const novoValor = parseFloat(editingValorValue);
    setEditingValorId(null);
    if (isNaN(novoValor) || novoValor <= 0) return;
    try {
      await fetch(`/api/atendimentos/${id}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: novoValor }),
      });
      await carregarDados();
    } catch (err) {
      console.error('Erro ao atualizar valor:', err);
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
    const quantidade = procedimentoSelecionado.por_dente ? dentesFaces.length : 1;
    return valorBase * quantidade;
  };

  if (loading) {
    return <LoadingState text="Carregando avaliação..." />;
  }

  if (!atendimento) {
    return (
      <EmptyState
        icon={<Search className="w-7 h-7" />}
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
        icon={<Search className="w-7 h-7" />}
        description={`Atendimento #${atendimento.id}`}
        breadcrumb={[
          { label: 'Avaliações', href: '/avaliacao' },
          { label: atendimento.cliente_nome },
        ]}
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Adicionar Procedimento */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Adicionar Procedimento</h2>
          
          <form onSubmit={handleAdicionarProcedimento} className="space-y-4">
            <div>
              <Select
                label="Procedimento *"
                name="procedimento"
                value={procedimentoId}
                onChange={(value) => {
                  setProcedimentoId(value);
                  setValorCustom('');
                  setDentesFaces([]);
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
                  valor={dentesFaces}
                  onChange={setDentesFaces}
                  disabled={adicionando}
                />
                {dentesFaces.length > 0 && (
                  <p className="text-sm text-info-600 mt-2">
                    Valor: {formatarMoeda(procedimentoSelecionado.valor)} × {dentesFaces.length} dentes = <strong>{formatarMoeda(calcularValorTotal())}</strong>
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

      </div>

      {/* Lista de Procedimentos */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">Procedimentos Adicionados</h2>
        
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
                    {editingValorId === item.id ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        autoFocus
                        value={editingValorValue}
                        onChange={(e) => setEditingValorValue(e.target.value)}
                        onBlur={() => handleAtualizarValor(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAtualizarValor(item.id);
                          if (e.key === 'Escape') setEditingValorId(null);
                        }}
                        className="input text-sm py-1 w-28 text-right"
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingValorId(item.id); setEditingValorValue(String(item.valor)); }}
                        className="hover:text-info-600 hover:underline cursor-pointer"
                        title="Clique para editar"
                      >
                        {formatarMoeda(item.valor)}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemoverItem(item.id)}
                      className="text-error-600 hover:text-error-800 text-sm"
                    >
                      Remover
                    </button>
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

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        type={confirmDialog.type}
      />

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
