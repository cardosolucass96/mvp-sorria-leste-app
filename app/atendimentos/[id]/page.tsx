'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda, formatarDataHora } from '@/lib/utils/formatters';
import { STATUS_CONFIG, ITEM_STATUS_CONFIG, PROXIMOS_STATUS } from '@/lib/constants/status';
import type { AtendimentoStatus, ItemStatus } from '@/lib/types';
import { StatusBadge, StatusPipeline } from '@/components/domain';
import { ClipboardList } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Button, Card, Table, EmptyState, ConfirmDialog, Modal, Select, Input } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import usePageTitle from '@/lib/utils/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import SeletorDentes, { type DenteFaceInput } from '@/components/SeletorDentes';

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

const METODOS_PAGAMENTO = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Cartão Débito' },
  { value: 'cartao_credito', label: 'Cartão Crédito' },
];

interface ItemAtendimento {
  id: number;
  procedimento_nome: string;
  executor_nome: string | null;
  criado_por_nome: string | null;
  valor: number;
  valor_pago: number;
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
  const { hasRole, user } = useAuth();
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mudandoStatus, setMudandoStatus] = useState(false);
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
  const [finalizando, setFinalizando] = useState(false);

  // Modal adicionar procedimento
  const [modalProcedimento, setModalProcedimento] = useState(false);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [loadingDadosProc, setLoadingDadosProc] = useState(false);
  const [procId, setProcId] = useState('');
  const [execId, setExecId] = useState('');
  const [valorCustom, setValorCustom] = useState('');
  const [dentesFaces, setDentesFaces] = useState<DenteFaceInput[]>([]);
  const [adicionando, setAdicionando] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  // Modal ficha do cliente
  const [modalCliente, setModalCliente] = useState(false);
  const [dadosCliente, setDadosCliente] = useState<Record<string, string | null> | null>(null);
  const [loadingCliente, setLoadingCliente] = useState(false);

  // Modal pagamento
  const [modalPagamento, setModalPagamento] = useState(false);
  const [valorPagamento, setValorPagamento] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState('pix');
  const [observacoesPagamento, setObservacoesPagamento] = useState('');
  const [itensPagamento, setItensPagamento] = useState<{ [key: number]: number }>({});
  const [registrando, setRegistrando] = useState(false);
  const [errorPagamento, setErrorPagamento] = useState('');

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

  const handleExcluir = () => {
    if (!atendimento) return;
    openConfirm({
      title: 'Excluir Atendimento',
      message: `Excluir o atendimento #${atendimento.id} de ${atendimento.cliente_nome}? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/atendimentos/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Erro ao excluir'); return; }
          router.push('/atendimentos');
        } catch {
          setError('Erro ao excluir atendimento');
        }
      },
    });
  };

  const abrirModalProcedimento = async () => {
    setModalProcedimento(true);
    if (procedimentos.length > 0) return;
    setLoadingDadosProc(true);
    try {
      const [resProc, resUsers] = await Promise.all([
        fetch('/api/procedimentos'),
        fetch('/api/usuarios'),
      ]);
      setProcedimentos(await resProc.json());
      const usersData: Usuario[] = await resUsers.json();
      setExecutores(usersData.filter(u => u.role === 'executor' || u.role === 'admin'));
    } finally {
      setLoadingDadosProc(false);
    }
  };

  const fecharModalProcedimento = () => {
    setModalProcedimento(false);
    setProcId('');
    setExecId('');
    setValorCustom('');
    setDentesFaces([]);
    setErrorModal('');
  };

  const handleAdicionarProcedimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!procId) return;
    const proc = procedimentos.find(p => p.id === parseInt(procId));
    if (proc?.por_dente && dentesFaces.length === 0) {
      setErrorModal('Selecione pelo menos um dente para este procedimento');
      return;
    }
    if (proc?.por_dente && dentesFaces.some(d => d.faces.length === 0)) {
      setErrorModal('Selecione ao menos uma face para cada dente');
      return;
    }
    setAdicionando(true);
    setErrorModal('');
    try {
      const quantidade = proc?.por_dente ? dentesFaces.length : 1;
      const valorBase = valorCustom ? parseFloat(valorCustom) : proc?.valor || 0;
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
          procedimento_id: parseInt(procId),
          executor_id: execId ? parseInt(execId) : null,
          criado_por_id: user?.id,
          valor: valorBase * quantidade,
          dentes: dentesParaSalvar,
          quantidade,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao adicionar');
      }
      fecharModalProcedimento();
      await carregarAtendimento();
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : 'Erro ao adicionar');
    } finally {
      setAdicionando(false);
    }
  };

  const abrirFichaCliente = async () => {
    setModalCliente(true);
    if (dadosCliente) return;
    setLoadingCliente(true);
    try {
      const res = await fetch(`/api/clientes/${atendimento?.cliente_id}`);
      const data = await res.json();
      setDadosCliente(data);
    } finally {
      setLoadingCliente(false);
    }
  };

  const fecharModalPagamento = () => {
    setModalPagamento(false);
    setValorPagamento('');
    setMetodoPagamento('pix');
    setObservacoesPagamento('');
    setItensPagamento({});
    setErrorPagamento('');
  };

  const distribuirPagamento = (valor: number) => {
    if (!atendimento) return;
    const novos: { [key: number]: number } = {};
    let restante = valor;
    for (const item of atendimento.itens) {
      if (restante <= 0) break;
      const devido = item.valor - item.valor_pago;
      if (devido <= 0) continue;
      const aplicado = Math.min(restante, devido);
      novos[item.id] = Math.round(aplicado * 100) / 100;
      restante -= aplicado;
    }
    setItensPagamento(novos);
  };

  const handleRegistrarPagamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valorPagamento) return;
    const itens = Object.entries(itensPagamento)
      .filter(([, v]) => v > 0)
      .map(([item_id, valor_aplicado]) => ({ item_id: parseInt(item_id), valor_aplicado }));
    if (itens.length === 0) {
      setErrorPagamento('Distribua o valor entre os procedimentos');
      return;
    }
    const total = itens.reduce((s, i) => s + i.valor_aplicado, 0);
    if (Math.abs(total - parseFloat(valorPagamento)) > 0.01) {
      setErrorPagamento(`Total alocado (${formatarMoeda(total)}) não bate com o valor informado (${formatarMoeda(parseFloat(valorPagamento))})`);
      return;
    }
    setRegistrando(true);
    setErrorPagamento('');
    try {
      const res = await fetch(`/api/atendimentos/${id}/pagamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: parseFloat(valorPagamento), metodo: metodoPagamento, observacoes: observacoesPagamento || null, itens }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao registrar');
      }
      fecharModalPagamento();
      // Recarrega e verifica se todos os procedimentos estão pagos
      const resAtend = await fetch(`/api/atendimentos/${id}`);
      const dadosAtend = await resAtend.json();
      setAtendimento(dadosAtend);
      const todosPagos = dadosAtend.itens.length > 0 &&
        dadosAtend.itens.every((item: ItemAtendimento) => item.valor_pago >= item.valor);
      if (todosPagos && dadosAtend.status === 'aguardando_pagamento') {
        openConfirm({
          title: 'Todos os procedimentos pagos',
          message: 'Todos os procedimentos estão quitados. Deseja avançar o atendimento para execução agora?',
          confirmLabel: 'Avançar para Execução',
          type: 'info',
          onConfirm: async () => {
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            await handleMudarStatus('em_execucao');
          },
        });
      }
    } catch (err) {
      setErrorPagamento(err instanceof Error ? err.message : 'Erro ao registrar');
    } finally {
      setRegistrando(false);
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
    return <LoadingState text="Carregando atendimento..." />;
  }

  if (!atendimento) {
    return (
      <EmptyState
        icon={<ClipboardList className="w-7 h-7" />}
        title="Atendimento não encontrado"
        actionLabel="Voltar para lista"
        onAction={() => router.push('/atendimentos')}
      />
    );
  }

  const statusConfig = STATUS_CONFIG[atendimento.status as AtendimentoStatus];
  const proximoStatus = PROXIMOS_STATUS[atendimento.status as AtendimentoStatus];

  const itensColumns: TableColumn<ItemAtendimento>[] = [
    { key: 'procedimento_nome', label: 'Procedimento' },
    { key: 'criado_por_nome', label: 'Vendedor', render: (item) => item.criado_por_nome || '-' },
    { key: 'executor_nome', label: 'Executor', render: (item) => item.executor_nome || '-' },
    { key: 'valor', label: 'Valor', align: 'right' as const, render: (item) => formatarMoeda(item.valor) },
    { key: 'status', label: 'Status', align: 'center' as const, render: (item) => <StatusBadge type="item" status={item.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Atendimento #${atendimento.id}`}
        icon={<ClipboardList className="w-7 h-7" />}
        breadcrumb={[
          { label: 'Atendimentos', href: '/atendimentos' },
          { label: `#${atendimento.id}` },
        ]}
        actions={
          <div className="flex gap-2 flex-wrap">
            {atendimento.status === 'em_execucao' && (
              <Button onClick={handleFinalizar} disabled={finalizando} variant="primary">
                {finalizando ? 'Finalizando...' : 'Finalizar Atendimento'}
              </Button>
            )}
            {proximoStatus && atendimento.status !== 'em_execucao' && (
              <Button onClick={() => handleMudarStatus(proximoStatus)} disabled={mudandoStatus}>
                {mudandoStatus ? 'Processando...' : `Avançar para ${STATUS_CONFIG[proximoStatus].label}`}
              </Button>
            )}
            {atendimento.status !== 'finalizado' && hasRole(['atendente', 'admin']) && (
              <Button variant="danger" onClick={handleExcluir}>
                Excluir
              </Button>
            )}
          </div>
        }
      />

      <Card className="-mt-2">
        <StatusPipeline currentStatus={atendimento.status as AtendimentoStatus} />
      </Card>

      {error && <Alert type="error">{error}</Alert>}

      {/* Comissões Geradas (após finalização) */}
      {comissoesGeradas && (
        <div className="p-4 bg-success-50 border border-success-200 rounded-lg">
          <h3 className="font-semibold text-success-800 mb-2">Atendimento Finalizado!</h3>
          <p className="text-sm text-success-700 mb-2">Comissões geradas:</p>
          <div className="flex gap-4">
            <div>
              <span className="text-xs text-success-600">Venda:</span>
              <span className="ml-1 font-semibold">{formatarMoeda(comissoesGeradas.venda)}</span>
            </div>
            <div>
              <span className="text-xs text-success-600">Execução:</span>
              <span className="ml-1 font-semibold">{formatarMoeda(comissoesGeradas.execucao)}</span>
            </div>
            <div>
              <span className="text-xs text-success-600">Total:</span>
              <span className="ml-1 font-bold">{formatarMoeda(comissoesGeradas.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Grid de Informações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dados do Cliente */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Cliente</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Nome</p>
              <p className="font-medium">{atendimento.cliente_nome}</p>
            </div>
            {atendimento.cliente_cpf && (
              <div>
                <p className="text-sm text-muted">CPF</p>
                <p className="font-medium">{atendimento.cliente_cpf}</p>
              </div>
            )}
            {atendimento.cliente_telefone && (
              <div>
                <p className="text-sm text-muted">Telefone</p>
                <p className="font-medium">{atendimento.cliente_telefone}</p>
              </div>
            )}
            {atendimento.cliente_email && (
              <div>
                <p className="text-sm text-muted">Email</p>
                <p className="font-medium">{atendimento.cliente_email}</p>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={abrirFichaCliente}
              className="text-info-600 hover:text-info-800 text-sm"
            >
              Ver ficha completa →
            </button>
          </div>
        </Card>

        {/* Dados do Atendimento */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Atendimento</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Status</p>
              <p className={`font-medium ${statusConfig.cor}`}>
                {statusConfig.label}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Avaliador</p>
              <p className="font-medium">
                {atendimento.avaliador_nome || 'Não definido'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Criado em</p>
              <p className="font-medium">{formatarDataHora(atendimento.created_at)}</p>
            </div>
            {atendimento.liberado_em && (
              <div>
                <p className="text-sm text-muted">Liberado para execução</p>
                <p className="font-medium">{formatarDataHora(atendimento.liberado_em)}</p>
                {atendimento.liberado_por_nome && (
                  <p className="text-xs text-muted">por {atendimento.liberado_por_nome}</p>
                )}
              </div>
            )}
            {atendimento.finalizado_at && (
              <div>
                <p className="text-sm text-muted">Finalizado em</p>
                <p className="font-medium">{formatarDataHora(atendimento.finalizado_at)}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Resumo Financeiro */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Financeiro</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Total</p>
              <p className="text-2xl font-bold text-foreground">
                {formatarMoeda(atendimento.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Pago</p>
              <p className="text-xl font-semibold text-success-600">
                {formatarMoeda(atendimento.total_pago)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Pendente</p>
              <p className={`text-xl font-semibold ${
                atendimento.total - atendimento.total_pago > 0 
                  ? 'text-error-600' 
                  : 'text-neutral-400'
              }`}>
                {formatarMoeda(atendimento.total - atendimento.total_pago)}
              </p>
            </div>
          </div>
          {atendimento.status === 'aguardando_pagamento' && (
            <div className="mt-4 pt-4 border-t">
              <Button variant="secondary" className="w-full justify-center" onClick={() => setModalPagamento(true)}>
                Registrar Pagamento
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Procedimentos */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Procedimentos</h2>
          {(['triagem', 'avaliacao', 'em_execucao'].includes(atendimento.status)) && (
            <Button variant="secondary" size="sm" onClick={abrirModalProcedimento}>+ Adicionar Procedimento</Button>
          )}
        </div>
        
        <Table
          columns={itensColumns}
          data={atendimento.itens}
          keyExtractor={(item) => item.id}
          emptyMessage="Nenhum procedimento adicionado"
          caption="Procedimentos do atendimento"
        />

        {atendimento.itens.length > 0 && (
          <div className="mt-4 pt-4 border-t flex justify-end">
            <div className="text-right">
              <span className="text-sm text-muted mr-3">Total:</span>
              <span className="text-lg font-bold">{formatarMoeda(atendimento.total)}</span>
            </div>
          </div>
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

      <Modal
        isOpen={modalProcedimento}
        onClose={fecharModalProcedimento}
        title="Adicionar Procedimento"
        size="md"
      >
        {loadingDadosProc ? (
          <LoadingState text="Carregando..." />
        ) : (
          <form onSubmit={handleAdicionarProcedimento} className="space-y-4">
            {errorModal && <Alert type="error">{errorModal}</Alert>}
            <Select
              label="Procedimento *"
              name="procedimento"
              value={procId}
              onChange={(value) => { setProcId(value); setValorCustom(''); setDentesFaces([]); }}
              options={procedimentos.map(p => ({
                value: String(p.id),
                label: `${p.nome} — ${formatarMoeda(p.valor)}${p.por_dente ? ' (por dente)' : ''}`,
              }))}
              placeholder="Selecione..."
              required
            />
            {(() => {
              const proc = procedimentos.find(p => p.id === parseInt(procId));
              return proc?.por_dente === 1 ? (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Dentes *</label>
                  <SeletorDentes
                    valor={dentesFaces}
                    onChange={setDentesFaces}
                    disabled={adicionando}
                  />
                  {dentesFaces.length > 0 && (
                    <p className="text-sm text-info-600 mt-2">
                      {formatarMoeda(proc.valor)} × {dentesFaces.length} dentes = <strong>{formatarMoeda(proc.valor * dentesFaces.length)}</strong>
                    </p>
                  )}
                </div>
              ) : null;
            })()}
            <Select
              label="Executor"
              name="executor"
              value={execId}
              onChange={setExecId}
              options={executores.map(e => ({ value: String(e.id), label: e.nome }))}
              placeholder="Definir depois"
            />
            <Input
              label="Valor (R$)"
              name="valor"
              type="number"
              value={valorCustom}
              onChange={setValorCustom}
              placeholder={(() => {
                const proc = procedimentos.find(p => p.id === parseInt(procId));
                return proc ? `Padrão: ${proc.valor}` : 'Selecione um procedimento';
              })()}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={fecharModalProcedimento}>Cancelar</Button>
              <Button type="submit" disabled={!procId || adicionando} loading={adicionando}>
                + Adicionar
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Ficha do Cliente */}
      <Modal isOpen={modalCliente} onClose={() => setModalCliente(false)} title="Ficha do Cliente" size="md">
        {loadingCliente ? (
          <LoadingState text="Carregando..." />
        ) : dadosCliente ? (
          <div className="space-y-3">
            {[
              { label: 'Nome', value: dadosCliente.nome },
              { label: 'CPF', value: dadosCliente.cpf },
              { label: 'Telefone', value: dadosCliente.telefone },
              { label: 'Email', value: dadosCliente.email },
              { label: 'Data de Nascimento', value: dadosCliente.data_nascimento },
              { label: 'Endereço', value: dadosCliente.endereco },
              { label: 'Origem', value: dadosCliente.origem },
              { label: 'Observações', value: dadosCliente.observacoes },
            ].map(({ label, value }) =>
              value ? (
                <div key={label} className="flex gap-3">
                  <span className="text-sm text-muted w-40 shrink-0">{label}</span>
                  <span className="text-sm font-medium text-foreground">{value}</span>
                </div>
              ) : null
            )}
            <div className="pt-3 border-t">
              <Link href={`/clientes/${atendimento.cliente_id}`} className="text-info-600 hover:text-info-800 text-sm">
                Abrir ficha completa →
              </Link>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal Pagamento */}
      <Modal isOpen={modalPagamento} onClose={fecharModalPagamento} title="Registrar Pagamento" size="md">
        {atendimento && (() => {
          const saldo = atendimento.total - atendimento.total_pago;
          const totalAlocado = Object.values(itensPagamento).reduce((s, v) => s + v, 0);
          const val = parseFloat(valorPagamento) || 0;
          const diff = Math.abs(totalAlocado - val);
          const ok = val > 0 && diff < 0.01;
          return (
            <form onSubmit={handleRegistrarPagamento} className="space-y-4">
              {errorPagamento && <Alert type="error">{errorPagamento}</Alert>}

              {/* Valor */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Valor recebido (R$) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" min="0"
                    value={valorPagamento}
                    onChange={(e) => setValorPagamento(e.target.value)}
                    onBlur={(e) => distribuirPagamento(parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                    className="input flex-1"
                    required
                  />
                  {saldo > 0 && (
                    <button type="button"
                      onClick={() => { setValorPagamento(saldo.toString()); distribuirPagamento(saldo); }}
                      className="btn btn-secondary whitespace-nowrap text-sm"
                    >
                      Pagar tudo
                    </button>
                  )}
                </div>
                {saldo > 0 && <p className="text-xs text-muted mt-1">Saldo restante: <span className="font-medium text-error-600">{formatarMoeda(saldo)}</span></p>}
              </div>

              {/* Forma de pagamento */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Forma de pagamento *</label>
                <select value={metodoPagamento} onChange={(e) => setMetodoPagamento(e.target.value)} className="input" required>
                  {METODOS_PAGAMENTO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              {/* Distribuição */}
              {val > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-surface-secondary">
                    <span className="text-sm font-medium text-neutral-700">Como distribuir nos procedimentos</span>
                  </div>
                  <div className="divide-y">
                    {atendimento.itens.map(item => {
                      const devido = item.valor - item.valor_pago;
                      if (devido <= 0) return null;
                      const alocado = itensPagamento[item.id] || 0;
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.procedimento_nome}</p>
                            <p className="text-xs text-muted">
                              Falta pagar: {formatarMoeda(devido)}
                              {alocado >= devido && <span className="ml-2 text-success-600 font-medium">✓ Quitado</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted">R$</span>
                            <input
                              type="number" step="0.01" min="0" max={devido}
                              value={itensPagamento[item.id] ?? ''}
                              onChange={(e) => setItensPagamento(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                              className="input w-28 text-right"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={`flex justify-between px-3 py-2 text-sm font-medium ${ok ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>
                    <span>{ok ? '✓ Valor totalmente alocado' : val - totalAlocado > 0 ? `Falta alocar: ${formatarMoeda(val - totalAlocado)}` : `Excesso: ${formatarMoeda(totalAlocado - val)}`}</span>
                    <span>{formatarMoeda(totalAlocado)} / {formatarMoeda(val)}</span>
                  </div>
                </div>
              )}

              {/* Observações */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Observações <span className="text-neutral-400 font-normal">(opcional)</span></label>
                <input type="text" value={observacoesPagamento} onChange={(e) => setObservacoesPagamento(e.target.value)} placeholder="Ex: Entrada do tratamento" className="input" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={fecharModalPagamento}>Cancelar</Button>
                <Button type="submit" disabled={!valorPagamento || registrando} loading={registrando}>
                  Confirmar Pagamento
                </Button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}
