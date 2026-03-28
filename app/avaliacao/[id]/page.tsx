'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import SeletorDentes, { type DenteFaceInput } from '@/components/SeletorDentes';
import { formatarMoeda } from '@/lib/utils/formatters';
import { Search, Calendar } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Card, Button, Select, Input, EmptyState, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
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
  cliente_id: number;
  cliente_nome: string;
  status: string;
  avaliador_nome: string | null;
  itens: ItemAtendimento[];
  total: number;
}

interface Agendamento {
  id: number;
  procedimento_nome: string;
  executor_nome: string | null;
  data_agendada: string | null;
  status: string;
}

type ModoExecucao = 'hoje' | 'agendar';

export default function AvaliacaoDetalhePage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  usePageTitle('Detalhes da Avaliação');
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form para novo procedimento
  const [procedimentoId, setProcedimentoId] = useState('');
  const [executorId, setExecutorId] = useState('');
  const [valorCustom, setValorCustom] = useState('');
  const [dentesFaces, setDentesFaces] = useState<DenteFaceInput[]>([]);
  const [modoExecucao, setModoExecucao] = useState<ModoExecucao>('hoje');
  const [dataAgendada, setDataAgendada] = useState('');
  const [observacoesAgendamento, setObservacoesAgendamento] = useState('');
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
      const [resAtend, resProc, resUsers] = await Promise.all([
        fetch(`/api/atendimentos/${id}`),
        fetch('/api/procedimentos'),
        fetch('/api/usuarios'),
      ]);

      if (!resAtend.ok) throw new Error('Atendimento não encontrado');
      const atendData = await resAtend.json();
      setAtendimento(atendData);

      const procData = await resProc.json();
      setProcedimentos(procData);

      const usersData = await resUsers.json();
      setExecutores(
        usersData.filter((u: Usuario) => u.role === 'executor' || u.role === 'admin')
      );

      // Carrega agendamentos deste atendimento
      const resAgend = await fetch(`/api/agendamentos?atendimento_origem_id=${id}`);
      if (resAgend.ok) {
        setAgendamentos(await resAgend.json());
      }
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

    // Validar dentes para procedimentos por_dente (apenas modo "hoje")
    if (modoExecucao === 'hoje') {
      if (proc?.por_dente && dentesFaces.length === 0) {
        setError('Selecione pelo menos um dente para este procedimento');
        return;
      }
      if (proc?.por_dente && dentesFaces.some(d => d.faces.length === 0)) {
        setError('Selecione ao menos uma face para cada dente');
        return;
      }
    }

    setAdicionando(true);
    setError('');

    try {
      if (modoExecucao === 'agendar') {
        // Criar agendamento para sessão futura
        const res = await fetch('/api/agendamentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente_id: atendimento!.cliente_id,
            atendimento_origem_id: parseInt(id),
            procedimento_id: parseInt(procedimentoId),
            executor_id: executorId ? parseInt(executorId) : null,
            data_agendada: dataAgendada || null,
            observacoes: observacoesAgendamento || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Erro ao agendar');
        }

        toast.success('Procedimento agendado para sessão futura');

        // Limpa form e recarrega agendamentos
        setProcedimentoId('');
        setExecutorId('');
        setValorCustom('');
        setDentesFaces([]);
        setDataAgendada('');
        setObservacoesAgendamento('');
        setModoExecucao('hoje');

        const resAgend = await fetch(`/api/agendamentos?atendimento_origem_id=${id}`);
        if (resAgend.ok) {
          setAgendamentos(await resAgend.json());
        }
      } else {
        // Executar hoje - comportamento original
        const quantidade = proc?.por_dente ? dentesFaces.length : 1;
        const valorBase = valorCustom ? parseFloat(valorCustom) : proc?.valor || 0;
        const valorTotal = valorBase * quantidade;

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
      }
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

  const formatarData = (data: string) => {
    const [year, month, day] = data.split('-');
    return `${day}/${month}/${year}`;
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

            {/* Toggle: Quando executar? */}
            {procedimentoId && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Quando executar?
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModoExecucao('hoje')}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      modoExecucao === 'hoje'
                        ? 'bg-info-50 border-info-300 text-info-700 font-medium'
                        : 'bg-surface border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    Executar hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoExecucao('agendar')}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      modoExecucao === 'agendar'
                        ? 'bg-warning-50 border-warning-300 text-warning-700 font-medium'
                        : 'bg-surface border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Agendar para outro dia
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Seletor de Dentes (se aplicável e modo "hoje") */}
            {procedimentoSelecionado?.por_dente === 1 && modoExecucao === 'hoje' && (
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
                    Valor: {formatarMoeda(procedimentoSelecionado.valor)} x {dentesFaces.length} dentes = <strong>{formatarMoeda(calcularValorTotal())}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Campos para agendamento */}
            {modoExecucao === 'agendar' && procedimentoId && (
              <>
                <div>
                  <Input
                    label="Data prevista (opcional)"
                    name="data_agendada"
                    type="date"
                    value={dataAgendada}
                    onChange={(value) => setDataAgendada(value)}
                  />
                </div>
              </>
            )}

            <div>
              <Select
                label={modoExecucao === 'agendar' ? 'Executor preferencial' : 'Executor'}
                name="executor"
                value={executorId}
                onChange={(value) => setExecutorId(value)}
                options={executores.map((exec) => ({ value: String(exec.id), label: exec.nome }))}
                placeholder="Definir depois"
              />
            </div>

            {/* Valor - apenas para modo "hoje" */}
            {modoExecucao === 'hoje' && (
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
            )}

            {/* Observações - apenas para agendamento */}
            {modoExecucao === 'agendar' && procedimentoId && (
              <div>
                <Input
                  label="Observações (opcional)"
                  name="observacoes_agendamento"
                  value={observacoesAgendamento}
                  onChange={(value) => setObservacoesAgendamento(value)}
                  placeholder="Notas sobre o agendamento..."
                />
              </div>
            )}

            <Button
              type="submit"
              variant={modoExecucao === 'agendar' ? 'secondary' : 'secondary'}
              disabled={!procedimentoId || adicionando}
              loading={adicionando}
              className="w-full"
            >
              {modoExecucao === 'agendar' ? 'Agendar para sessão futura' : '+ Adicionar'}
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

      {/* Agendados para sessões futuras */}
      {agendamentos.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-warning-600" />
            Agendados para sessões futuras
          </h2>
          <ul className="divide-y divide-neutral-200">
            {agendamentos.map((ag) => (
              <li key={ag.id} className="py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-foreground">{ag.procedimento_nome}</span>
                  {ag.executor_nome && (
                    <span className="text-sm text-neutral-500 ml-2">({ag.executor_nome})</span>
                  )}
                  <span className="text-sm text-neutral-500 ml-2">
                    — {ag.data_agendada ? formatarData(ag.data_agendada) : 'Sem data definida'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
                Avaliação pronta para ser finalizada
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
              Finalizar Avaliação
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
