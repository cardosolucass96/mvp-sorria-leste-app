'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AgendamentoCompleto, Cliente, FollowupTarefaCompleta, VinculoCliente } from '@/lib/types';
import { User, ClipboardList, Activity, CreditCard, Clock, FileText, Users, Plus, Trash2, Search, CalendarDays, MessageCircle } from 'lucide-react';
import { PageHeader, Card, Button, Alert, LoadingState, EmptyState, ConfirmDialog, Tabs, Modal } from '@/components/ui';
import { StatusBadge } from '@/components/domain';
import { ClienteForm, ClienteFormData } from '@/components/domain';
import { formatarData, formatarDataHora, formatarMoeda, formatarCPF, formatarTelefone, formatarDentes, parseDentesLabels } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';
import { AGENDAMENTO_STATUS_CONFIG } from '@/lib/constants/agendamentos';
import { FOLLOWUP_STATUS_LABELS, FOLLOWUP_TIPO_CONFIG } from '@/lib/constants/followup';
import usePageTitle from '@/lib/utils/usePageTitle';

const METODOS_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
};

const HISTORICO_CONFIG: Record<string, { label: string; cor: string }> = {
  atendimento_criado:     { label: 'Atendimento criado',     cor: 'bg-primary-500' },
  liberado:               { label: 'Liberado para execução', cor: 'bg-info-500' },
  finalizado:             { label: 'Finalizado',             cor: 'bg-success-500' },
  pagamento:              { label: 'Pagamento',              cor: 'bg-warning-500' },
  procedimento:           { label: 'Procedimento',           cor: 'bg-neutral-400' },
  etapa_concluida:        { label: 'Etapa concluída',        cor: 'bg-success-400' },
  credito:                { label: 'Crédito de saldo',       cor: 'bg-success-600' },
  debito:                 { label: 'Débito de saldo',        cor: 'bg-error-500' },
  estorno:                { label: 'Estorno',                cor: 'bg-warning-600' },
  transferencia_saida:    { label: 'Transf. enviada',        cor: 'bg-error-400' },
  transferencia_entrada:  { label: 'Transf. recebida',       cor: 'bg-success-400' },
};

interface Atendimento {
  id: number;
  status: string;
  avaliador_nome: string | null;
  created_at: string;
  finalizado_at: string | null;
  total: number;
  total_pago: number;
}

interface ItemProcedimento {
  id: number;
  atendimento_id: number;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_nome: string | null;
  criado_por_nome: string | null;
  valor: number;
  valor_pago: number;
  status: string;
  dentes: string | null;
  quantidade: number;
  observacoes: string | null;
  created_at: string;
  concluido_at: string | null;
}

interface Pagamento {
  id: number;
  atendimento_id: number;
  valor: number;
  metodo: string;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  recebido_por_nome: string | null;
  created_at: string;
}

interface EventoHistorico {
  tipo: string;
  data: string;
  descricao: string;
  ref_id: number;
}

interface ItemProntuario {
  item_id: number;
  atendimento_id: number;
  concluido_at: string | null;
  dentes: string | null;
  quantidade: number;
  item_observacoes: string | null;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_nome: string | null;
  prontuario_id: number | null;
  prontuario_descricao: string | null;
  prontuario_observacoes: string | null;
  prontuario_data: string | null;
  prontuario_updated_at: string | null;
  prontuario_autor: string | null;
}

interface Movimentacao {
  tipo: string;
  data: string;
  descricao: string | null;
  ref_id: number;
  valor: number;
  saldo_anterior: number;
  saldo_novo: number;
}

interface FichaData {
  atendimentos: Atendimento[];
  procedimentos: ItemProcedimento[];
  pagamentos: Pagamento[];
  historico: EventoHistorico[];
  prontuarios: ItemProntuario[];
  movimentacoes: Movimentacao[];
}

export default function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  usePageTitle('Ficha do Cliente');
  const { id } = use(params);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [ficha, setFicha] = useState<FichaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('dados');
  const [modalProcedimento, setModalProcedimento] = useState<ItemProcedimento | null>(null);
  const [modalPagamento, setModalPagamento] = useState<Pagamento | null>(null);
  const [vinculos, setVinculos] = useState<VinculoCliente[]>([]);
  const [agendamentos, setAgendamentos] = useState<AgendamentoCompleto[]>([]);
  const [followups, setFollowups] = useState<FollowupTarefaCompleta[]>([]);
  const [modalAddVinculo, setModalAddVinculo] = useState(false);
  const [vinculoBusca, setVinculoBusca] = useState('');
  const [vinculoBuscaResultados, setVinculoBuscaResultados] = useState<Cliente[]>([]);
  const [vinculoClienteSelecionado, setVinculoClienteSelecionado] = useState<Cliente | null>(null);
  const [vinculoObservacao, setVinculoObservacao] = useState('');
  const [vinculoSaving, setVinculoSaving] = useState(false);

  // Saldo
  const [saldo, setSaldo] = useState({ saldo: 0, saldo_calculado: 0 });
  const [modalTransferencia, setModalTransferencia] = useState(false);
  const [transferenciaDestinoId, setTransferenciaDestinoId] = useState<number | null>(null);
  const [transferenciaDestinoNome, setTransferenciaDestinoNome] = useState('');
  const [transferenciaValor, setTransferenciaValor] = useState('');
  const [transferindo, setTransferindo] = useState(false);
  const [transferBusca, setTransferBusca] = useState('');
  const [transferResultados, setTransferResultados] = useState<{ id: number; nome: string; cpf: string | null }[]>([]);
  const [transferBuscando, setTransferBuscando] = useState(false);
  const [estornandoItemId, setEstornandoItemId] = useState<number | null>(null);

  const router = useRouter();
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

  const loadVinculos = useCallback(async () => {
    const res = await fetch(`/api/clientes/${id}/vinculos`);
    if (res.ok) setVinculos(await res.json());
  }, [id]);

  const carregarSaldo = useCallback(async () => {
    const res = await fetch(`/api/clientes/${id}/saldo`);
    if (res.ok) {
      const data = await res.json();
      setSaldo({ saldo: data.saldo ?? 0, saldo_calculado: data.saldo_calculado ?? 0 });
    }
  }, [id]);

  const carregarFicha = useCallback(async () => {
    const res = await fetch(`/api/clientes/${id}/ficha`);
    if (res.ok) setFicha(await res.json());
  }, [id]);

  const carregarAgendamentos = useCallback(async () => {
    const res = await fetch(`/api/agendamentos?cliente_id=${id}&order_by=data_agendada&order_dir=asc`);
    if (res.ok) setAgendamentos(await res.json());
  }, [id]);

  const carregarFollowups = useCallback(async () => {
    const res = await fetch(`/api/followup?cliente_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setFollowups(data.items ?? []);
    }
  }, [id]);

  useEffect(() => {
    const load = async () => {
      try {
        const [resCliente, resFicha] = await Promise.all([
          fetch(`/api/clientes/${id}`),
          fetch(`/api/clientes/${id}/ficha`),
        ]);
        if (!resCliente.ok) { router.push('/clientes'); return; }
        setCliente(await resCliente.json());
        if (resFicha.ok) setFicha(await resFicha.json());
        await Promise.all([loadVinculos(), carregarSaldo(), carregarAgendamentos(), carregarFollowups()]);
      } catch {
        setError('Erro ao carregar cliente');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id, router, loadVinculos, carregarSaldo, carregarAgendamentos, carregarFollowups]);

  useEffect(() => {
    if (!vinculoBusca.trim()) { setVinculoBuscaResultados([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/clientes?busca=${encodeURIComponent(vinculoBusca)}&limit=8&ordem=nome`);
      if (res.ok) {
        const data = await res.json();
        // filtra o próprio cliente e já vinculados
        const vinculadosIds = new Set(vinculos.map(v => v.outro_cliente_id));
        setVinculoBuscaResultados(
          (data.clientes ?? data).filter((c: Cliente) => c.id !== parseInt(id, 10) && !vinculadosIds.has(c.id))
        );
      }
    }, 300);
    return () => clearTimeout(t);
  }, [vinculoBusca, id, vinculos]);

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(''); setSuccess(''); }, 3000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

  useEffect(() => {
    if (!transferBusca || transferBusca.length < 2) { setTransferResultados([]); return; }
    setTransferBuscando(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?busca=${encodeURIComponent(transferBusca)}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setTransferResultados(
            (data.clientes ?? data).filter((c: { id: number }) => c.id !== parseInt(id, 10))
          );
        }
      } catch { /* silently fail */ } finally {
        setTransferBuscando(false);
      }
    }, 300);
    return () => { clearTimeout(t); setTransferBuscando(false); };
  }, [transferBusca, id]);

  const handleSubmit = async (formData: ClienteFormData) => {
    setError('');
    setIsSaving(true);
    try {
      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao salvar'); return; }
      setCliente(data);
      setSuccess('Cliente atualizado com sucesso!');
      setIsEditing(false);
    } catch {
      setError('Erro ao salvar cliente');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    const temAtendimentos = (ficha?.atendimentos.length ?? 0) > 0;
    if (temAtendimentos) {
      openConfirm({
        title: 'Não é possível excluir',
        message: `O cliente "${cliente?.nome}" possui ${ficha?.atendimentos.length} atendimento(s) vinculado(s). Não é possível excluir clientes com atendimentos.`,
        confirmLabel: 'Entendi',
        type: 'warning',
        onConfirm: async () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        },
      });
      return;
    }
    openConfirm({
      title: 'Excluir Cliente',
      message: `Deseja excluir o cliente "${cliente?.nome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Erro ao excluir'); return; }
          router.push('/clientes');
        } catch {
          setError('Erro ao excluir cliente');
        }
      },
    });
  };

  if (isLoading) return <LoadingState mode="spinner" text="Carregando..." />;
  if (!cliente) return (
    <EmptyState
      icon={<User className="w-7 h-7" />}
      title="Cliente não encontrado"
      actionLabel="Voltar para lista"
      onAction={() => router.push('/clientes')}
    />
  );

  const totalGasto = ficha?.pagamentos.filter(p => !p.cancelado).reduce((s, p) => s + p.valor, 0) ?? 0;

  const handleAddVinculo = async () => {
    if (!vinculoClienteSelecionado) return;
    setVinculoSaving(true);
    try {
      const res = await fetch(`/api/clientes/${id}/vinculos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_vinculado_id: vinculoClienteSelecionado.id, observacao: vinculoObservacao }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao adicionar vínculo'); return; }
      await loadVinculos();
      setModalAddVinculo(false);
      setVinculoBusca('');
      setVinculoClienteSelecionado(null);
      setVinculoObservacao('');
      setSuccess('Vínculo adicionado com sucesso!');
    } catch {
      setError('Erro ao adicionar vínculo');
    } finally {
      setVinculoSaving(false);
    }
  };

  const handleRemoveVinculo = (vinculo: VinculoCliente) => {
    openConfirm({
      title: 'Remover Vínculo',
      message: `Deseja remover o vínculo com "${vinculo.outro_cliente_nome}"?`,
      confirmLabel: 'Remover',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/clientes/${id}/vinculos/${vinculo.id}`, { method: 'DELETE' });
          if (!res.ok) { setError('Erro ao remover vínculo'); return; }
          await loadVinculos();
          setSuccess('Vínculo removido.');
        } catch {
          setError('Erro ao remover vínculo');
        }
      },
    });
  };

  const handleEstornarProcedimento = async (item: ItemProcedimento) => {
    openConfirm({
      title: 'Gerar estorno',
      message: `Converter ${formatarMoeda(item.valor_pago)} de "${item.etapa_label ? `${item.procedimento_nome} — ${item.etapa_label}` : item.procedimento_nome}" em saldo disponível para este cliente?`,
      confirmLabel: 'Gerar estorno',
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setEstornandoItemId(item.id);
        try {
          const res = await fetch(`/api/clientes/${id}/saldo/estornar-procedimento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_atendimento_id: item.id }),
          });
          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Erro ao gerar estorno'); return; }
          setSuccess(`Estorno de ${formatarMoeda(data.valor_creditado)} gerado com sucesso!`);
          await Promise.all([carregarSaldo(), carregarFicha()]);
        } catch {
          setError('Erro ao gerar estorno');
        } finally {
          setEstornandoItemId(null);
        }
      },
    });
  };

  const handleTransferir = async () => {
    if (!transferenciaDestinoId || !transferenciaValor) return;
    setTransferindo(true);
    try {
      const res = await fetch(`/api/clientes/${id}/saldo/transferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_destino_id: transferenciaDestinoId,
          valor: parseFloat(transferenciaValor),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao transferir'); setTransferindo(false); return; }
      setModalTransferencia(false);
      setTransferenciaDestinoId(null);
      setTransferenciaDestinoNome('');
      setTransferenciaValor('');
      setTransferBusca('');
      setTransferResultados([]);
      setSuccess('Saldo transferido com sucesso!');
      await Promise.all([carregarSaldo(), carregarFicha()]);
    } catch {
      setError('Erro ao transferir saldo');
    } finally {
      setTransferindo(false);
    }
  };

  const abas = [
    { key: 'dados', label: 'Dados' },
    { key: 'atendimentos', label: 'Atendimentos', count: ficha?.atendimentos.length },
    { key: 'procedimentos', label: 'Procedimentos', count: ficha?.procedimentos.length },
    { key: 'pagamentos', label: 'Pagamentos', count: ficha?.pagamentos.filter(p => !p.cancelado).length },
    { key: 'agendamentos', label: 'Agendamentos', count: agendamentos.length || undefined },
    { key: 'followups', label: 'Followups', count: followups.length || undefined },
    { key: 'prontuario', label: 'Prontuário', count: ficha?.prontuarios.length },
    { key: 'historico', label: 'Histórico', count: ficha?.historico.length },
    { key: 'vinculados', label: 'Vinculados', count: vinculos.length || undefined },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={cliente.nome}
        icon={<User className="w-7 h-7" />}
        description={`Cadastrado em ${formatarData(cliente.created_at)} • Total gasto: ${formatarMoeda(totalGasto)}`}
        breadcrumb={[
          { label: 'Clientes', href: '/clientes' },
          { label: cliente.nome },
        ]}
        actions={
          !isEditing ? (
            <div className="flex gap-2">
              <Link href={`/atendimentos/novo?cliente=${id}`}>
                <Button variant="secondary">Novo Atendimento</Button>
              </Link>
              <Button onClick={() => setIsEditing(true)}>Editar</Button>
              <Button variant="danger" onClick={handleDelete}>Excluir</Button>
            </div>
          ) : undefined
        }
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" dismissible onDismiss={() => setSuccess('')}>{success}</Alert>}

      <Tabs tabs={abas} activeTab={abaAtiva} onTabChange={setAbaAtiva} variant="underline" />

      {/* ABA: DADOS */}
      {abaAtiva === 'dados' && (
        <Card>
          {isEditing ? (
            <ClienteForm
              initialData={{
                nome: cliente.nome || '',
                cpf: cliente.cpf || '',
                telefone: cliente.telefone || '',
                email: cliente.email || '',
                data_nascimento: cliente.data_nascimento || '',
                endereco: cliente.endereco || '',
                origem: cliente.origem || '',
                sexo: cliente.sexo || '',
                plano_odontologico: cliente.plano_odontologico || '',
                observacoes: cliente.observacoes || '',
              }}
              onSubmit={handleSubmit}
              onCancel={() => { setIsEditing(false); setError(''); }}
              loading={isSaving}
              error={error}
              submitLabel="Salvar Alterações"
            />
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Dados Pessoais</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted">Nome Completo</p><p className="font-medium">{cliente.nome}</p></div>
                  <div><p className="text-xs text-muted">CPF</p><p className="font-medium">{cliente.cpf ? formatarCPF(cliente.cpf) : '-'}</p></div>
                  <div>
                    <p className="text-xs text-muted">Data de Nascimento</p>
                    <p className="font-medium">
                      {cliente.data_nascimento ? formatarData(cliente.data_nascimento) : '-'}
                      {cliente.data_nascimento && (() => {
                        const hoje = new Date();
                        const nasc = new Date(cliente.data_nascimento);
                        let idade = hoje.getFullYear() - nasc.getFullYear();
                        const m = hoje.getMonth() - nasc.getMonth();
                        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
                        return idade >= 0 ? <span className="text-sm text-muted ml-1">({idade} anos)</span> : null;
                      })()}
                    </p>
                  </div>
                  <div><p className="text-xs text-muted">Sexo</p><p className="font-medium">{cliente.sexo ? cliente.sexo.charAt(0).toUpperCase() + cliente.sexo.slice(1) : '-'}</p></div>
                  <div><p className="text-xs text-muted">Origem</p><p className="font-medium">{getOrigemLabel(cliente.origem)}</p></div>
                  <div><p className="text-xs text-muted">Plano Odontológico</p><p className="font-medium">{cliente.plano_odontologico || '-'}</p></div>
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Contato</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted">Telefone</p><p className="font-medium">{cliente.telefone ? formatarTelefone(cliente.telefone) : '-'}</p></div>
                  <div><p className="text-xs text-muted">Email</p><p className="font-medium">{cliente.email || '-'}</p></div>
                  <div className="md:col-span-2"><p className="text-xs text-muted">Endereço</p><p className="font-medium">{cliente.endereco || '-'}</p></div>
                </div>
              </div>
              {cliente.observacoes && (
                <div>
                  <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Observações</h2>
                  <p className="text-neutral-700 whitespace-pre-wrap">{cliente.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Card de Saldo — sempre visível no topo quando na aba dados */}
      {abaAtiva === 'dados' && !isEditing && (
        <Card>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Saldo do Cliente</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted">Crédito em procedimentos</p>
              <p className="font-semibold text-lg">{formatarMoeda(saldo.saldo_calculado)}</p>
              <p className="text-xs text-muted mt-0.5">Soma dos valores pagos em procedimentos não concluídos</p>
            </div>
            <div>
              <p className="text-xs text-muted">Saldo disponível</p>
              <p className={`font-semibold text-lg ${saldo.saldo > 0 ? 'text-success-700' : ''}`}>{formatarMoeda(saldo.saldo)}</p>
              <p className="text-xs text-muted mt-0.5">Saldo real gerado por estornos</p>
            </div>
          </div>
          {saldo.saldo > 0 && (
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setModalTransferencia(true);
                  setTransferenciaDestinoId(null);
                  setTransferenciaDestinoNome('');
                  setTransferenciaValor('');
                  setTransferBusca('');
                  setTransferResultados([]);
                }}
              >
                Transferir saldo →
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ABA: ATENDIMENTOS */}
      {abaAtiva === 'atendimentos' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> Atendimentos
            </h2>
          </div>
          {!ficha?.atendimentos.length ? (
            <p className="text-center py-8 text-muted">Nenhum atendimento registrado</p>
          ) : (
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-surface-secondary">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Avaliador</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Pago</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {ficha.atendimentos.map(a => (
                  <tr key={a.id} className="hover:bg-surface-secondary">
                    <td className="px-4 py-3 font-medium">#{a.id}</td>
                    <td className="px-4 py-3 text-sm text-muted">{formatarDataHora(a.created_at)}</td>
                    <td className="px-4 py-3"><StatusBadge type="atendimento" status={a.status} /></td>
                    <td className="px-4 py-3 text-sm">{a.avaliador_nome || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatarMoeda(a.total ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-success-600 font-medium">{formatarMoeda(a.total_pago ?? 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/atendimentos/${a.id}`} className="text-sm text-info-600 hover:text-info-800">Ver →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ABA: PROCEDIMENTOS */}
      {abaAtiva === 'procedimentos' && (
        <Card>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5" /> Procedimentos
          </h2>
          {!ficha?.procedimentos.length ? (
            <p className="text-center py-8 text-muted">Nenhum procedimento registrado</p>
          ) : (
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-surface-secondary">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Procedimento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Atend.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Executor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor Pago</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {ficha.procedimentos.map(p => {
                  const podeEstornar = p.valor_pago > 0 && p.status !== 'concluido';
                  return (
                  <tr key={p.id} className="hover:bg-surface-secondary">
                    <td className="px-4 py-3 font-medium">
                      {p.etapa_label ? `${p.procedimento_nome} — ${p.etapa_label}` : p.procedimento_nome}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/atendimentos/${p.atendimento_id}`} className="text-info-600 hover:text-info-800">#{p.atendimento_id}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{p.executor_nome || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatarMoeda(p.valor_pago)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge type="item" status={p.status} /></td>
                    <td className="px-4 py-3 text-sm text-muted">{formatarData(p.created_at)}</td>
                    <td className="px-4 py-3 text-right space-x-3">
                      {podeEstornar && (
                        <button
                          onClick={() => handleEstornarProcedimento(p)}
                          disabled={estornandoItemId === p.id}
                          className="text-sm text-warning-600 hover:text-warning-800 font-medium disabled:opacity-50"
                        >
                          {estornandoItemId === p.id ? 'Gerando...' : 'Gerar estorno'}
                        </button>
                      )}
                      <button onClick={() => setModalProcedimento(p)} className="text-sm text-info-600 hover:text-info-800">Ver →</button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ABA: PAGAMENTOS */}
      {abaAtiva === 'pagamentos' && (
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CreditCard className="w-5 h-5" /> Pagamentos
              </h2>
              <span className="text-sm font-semibold text-success-700">
                Total: {formatarMoeda(totalGasto)}
              </span>
            </div>
            {!ficha?.pagamentos.length ? (
              <p className="text-center py-8 text-muted">Nenhum pagamento registrado</p>
            ) : (
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-surface-secondary">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Atend.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Método</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Recebido por</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {ficha.pagamentos.map(p => (
                    <tr key={p.id} className={p.cancelado ? 'opacity-50 bg-neutral-50' : 'hover:bg-surface-secondary'}>
                      <td className="px-4 py-3 text-sm">{formatarDataHora(p.created_at)}</td>
                      <td className="px-4 py-3 text-sm">
                        <Link href={`/atendimentos/${p.atendimento_id}`} className="text-info-600 hover:text-info-800">#{p.atendimento_id}</Link>
                      </td>
                      <td className="px-4 py-3 text-sm">{METODOS_LABEL[p.metodo] || p.metodo}</td>
                      <td className={`px-4 py-3 text-right font-medium ${p.cancelado ? 'line-through text-neutral-400' : 'text-success-600'}`}>
                        {formatarMoeda(p.valor)}
                      </td>
                      <td className="px-4 py-3 text-sm">{p.recebido_por_nome || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setModalPagamento(p)} className="text-sm text-info-600 hover:text-info-800">Ver →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {ficha?.movimentacoes && ficha.movimentacoes.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5" /> Movimentações de Saldo
              </h2>
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-surface-secondary">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Descrição</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Saldo após</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {ficha.movimentacoes.map((m, i) => {
                    const isEntrada = ['credito', 'transferencia_entrada'].includes(m.tipo);
                    const cfg = HISTORICO_CONFIG[m.tipo] ?? { label: m.tipo, cor: 'bg-neutral-400' };
                    return (
                      <tr key={i} className="hover:bg-surface-secondary">
                        <td className="px-4 py-3 text-sm text-muted">{formatarDataHora(m.data)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.cor}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted">{m.descricao || '-'}</td>
                        <td className={`px-4 py-3 text-right font-medium ${isEntrada ? 'text-success-600' : 'text-error-600'}`}>
                          {isEntrada ? '+' : '-'}{formatarMoeda(m.valor)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium">{formatarMoeda(m.saldo_novo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* ABA: AGENDAMENTOS */}
      {abaAtiva === 'agendamentos' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="w-5 h-5" /> Agendamentos
            </h2>
          </div>
          {!agendamentos.length ? (
            <p className="text-center py-8 text-muted">Nenhum agendamento registrado</p>
          ) : (
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-surface-secondary">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Procedimento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Executor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Atendimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {agendamentos.map((agendamento) => {
                  const statusConfig = AGENDAMENTO_STATUS_CONFIG[agendamento.status];
                  return (
                    <tr key={agendamento.id} className="hover:bg-surface-secondary">
                      <td className="px-4 py-3 text-sm">
                        {agendamento.data_agendada ? formatarDataHora(agendamento.data_agendada) : 'Sem data'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {agendamento.etapa_modelo_nome
                            ? `${agendamento.procedimento_nome} — ${agendamento.etapa_modelo_nome}`
                            : agendamento.procedimento_nome}
                        </div>
                        {agendamento.observacoes && (
                          <p className="text-xs text-muted mt-1 line-clamp-2">{agendamento.observacoes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{agendamento.executor_nome || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig.bgCor} ${statusConfig.cor}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {agendamento.atendimento_origem_id ? (
                          <Link href={`/atendimentos/${agendamento.atendimento_origem_id}`} className="text-info-600 hover:text-info-800">
                            #{agendamento.atendimento_origem_id}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ABA: FOLLOWUPS */}
      {abaAtiva === 'followups' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageCircle className="w-5 h-5" /> Followups
            </h2>
          </div>
          {!followups.length ? (
            <p className="text-center py-8 text-muted">Nenhum followup registrado</p>
          ) : (
            <div className="space-y-3">
              {followups.map((followup) => {
                const tipoConfig = FOLLOWUP_TIPO_CONFIG[followup.tipo];
                return (
                  <div key={followup.id} className="rounded-lg border border-neutral-200 p-4 hover:bg-surface-secondary">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{followup.titulo}</span>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tipoConfig.borderColor} border`}>
                            {tipoConfig.label}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${followup.status === 'concluida' ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}>
                            {FOLLOWUP_STATUS_LABELS[followup.status]}
                          </span>
                        </div>
                        {followup.descricao && (
                          <p className="mt-2 text-sm text-muted whitespace-pre-wrap">{followup.descricao}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                          <span>Vencimento: {formatarDataHora(followup.vencimento_em)}</span>
                          <span>Responsável: {followup.responsavel_usuario_nome}</span>
                          <span>Criado por: {followup.criado_por_nome}</span>
                          {followup.concluida_em && <span>Concluído em: {formatarDataHora(followup.concluida_em)}</span>}
                        </div>
                        {followup.nota_conclusao && (
                          <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-foreground">
                            {followup.nota_conclusao}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ABA: PRONTUÁRIO */}
      {abaAtiva === 'prontuario' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5" /> Prontuários de Execução
            </h2>
            <span className="text-sm text-muted">
              {ficha?.prontuarios.length ?? 0} procedimento(s) concluído(s)
            </span>
          </div>
          {!ficha?.prontuarios.length ? (
            <Card>
              <p className="text-center py-8 text-muted">Nenhum procedimento concluído</p>
            </Card>
          ) : (
            ficha.prontuarios.map(item => {
              const dentes = formatarDentes(item.dentes);
              return (
                <Card key={item.item_id}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-semibold text-base">
                        {item.etapa_label ? `${item.procedimento_nome} — ${item.etapa_label}` : item.procedimento_nome}
                      </h3>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted">
                        {item.executor_nome && <span>Executor: <span className="text-foreground">{item.executor_nome}</span></span>}
                        {dentes && <span>Dentes: <span className="text-foreground">{dentes}</span></span>}
                        {item.quantidade > 1 && <span>Qtd: <span className="text-foreground">{item.quantidade}</span></span>}
                        <Link href={`/atendimentos/${item.atendimento_id}`} className="text-info-600 hover:text-info-800">
                          Atend. #{item.atendimento_id} →
                        </Link>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {item.concluido_at && (
                        <p className="text-xs text-muted">Concluído em</p>
                      )}
                      {item.concluido_at && (
                        <p className="text-sm font-medium">{formatarDataHora(item.concluido_at)}</p>
                      )}
                    </div>
                  </div>

                  {item.prontuario_descricao ? (
                    <div className="space-y-3">
                      <div className="bg-surface-secondary rounded-lg p-4 border-l-4 border-primary-400">
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Descrição do Procedimento</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{item.prontuario_descricao}</p>
                      </div>
                      {item.prontuario_observacoes && (
                        <div className="bg-warning-50 rounded-lg p-4 border-l-4 border-warning-400">
                          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Observações</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{item.prontuario_observacoes}</p>
                        </div>
                      )}
                      {item.item_observacoes && (
                        <div className="rounded-lg p-4 border border-neutral-200">
                          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Observações do Item</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{item.item_observacoes}</p>
                        </div>
                      )}
                      <div className="flex justify-end text-xs text-muted">
                        Prontuário preenchido por <span className="font-medium ml-1">{item.prontuario_autor}</span>
                        {item.prontuario_data && <span className="ml-2">em {formatarDataHora(item.prontuario_data)}</span>}
                        {item.prontuario_updated_at && item.prontuario_updated_at !== item.prontuario_data && (
                          <span className="ml-2">(atualizado em {formatarDataHora(item.prontuario_updated_at)})</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg p-4 border border-dashed border-neutral-300 text-center">
                      <p className="text-sm text-muted">Prontuário não preenchido</p>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ABA: HISTÓRICO */}
      {abaAtiva === 'historico' && (
        <Card>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-6">
            <Clock className="w-5 h-5" /> Histórico de Eventos
          </h2>
          {!ficha?.historico.length ? (
            <p className="text-center py-8 text-muted">Nenhum evento registrado</p>
          ) : (() => {
            const TIPOS_SALDO = new Set(['credito', 'debito', 'estorno', 'transferencia_saida', 'transferencia_entrada']);
            const eventosAtendimento = ficha.historico.filter(ev => !TIPOS_SALDO.has(ev.tipo));
            const eventosSaldo = ficha.historico.filter(ev => TIPOS_SALDO.has(ev.tipo));
            const renderTimeline = (eventos: EventoHistorico[]) => (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-neutral-200" />
                <div className="space-y-4">
                  {eventos.map((ev, i) => {
                    const cfg = HISTORICO_CONFIG[ev.tipo] ?? { label: ev.tipo, cor: 'bg-neutral-400' };
                    return (
                      <div key={i} className="flex gap-4 relative">
                        <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 z-10 ${cfg.cor}`} style={{ marginLeft: '10px' }} />
                        <div className="flex-1 pb-2">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{cfg.label}</span>
                              <p className="text-sm text-foreground mt-0.5">{ev.descricao}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-muted">{formatarDataHora(ev.data)}</p>
                              {ev.ref_id > 0 && (
                                <Link href={`/atendimentos/${ev.ref_id}`} className="text-xs text-info-600 hover:text-info-800">
                                  Ver atend. →
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            return (
              <div className="space-y-6">
                {eventosAtendimento.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-4">Atendimentos & Procedimentos</h3>
                    {renderTimeline(eventosAtendimento)}
                  </div>
                )}
                {eventosSaldo.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-4 pt-2 border-t border-neutral-200">Movimentações de Saldo</h3>
                    {renderTimeline(eventosSaldo)}
                  </div>
                )}
              </div>
            );
          })()}
        </Card>
      )}

      {/* ABA: VINCULADOS */}
      {abaAtiva === 'vinculados' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" /> Clientes Vinculados
            </h2>
            <Button onClick={() => { setModalAddVinculo(true); setVinculoBusca(''); setVinculoClienteSelecionado(null); setVinculoObservacao(''); }}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Vínculo
            </Button>
          </div>
          {!vinculos.length ? (
            <p className="text-center py-8 text-muted">Nenhum vínculo cadastrado</p>
          ) : (
            <div className="space-y-3">
              {vinculos.map(v => (
                <div key={v.id} className="flex items-start justify-between gap-4 p-4 rounded-lg border border-neutral-200 hover:bg-surface-secondary">
                  <div className="flex-1 min-w-0">
                    <Link href={`/clientes/${v.outro_cliente_id}`} className="font-medium text-info-600 hover:text-info-800 hover:underline">
                      {v.outro_cliente_nome}
                    </Link>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted">
                      {v.outro_cliente_cpf && <span>CPF: {v.outro_cliente_cpf}</span>}
                      {v.outro_cliente_telefone && <span>Tel: {v.outro_cliente_telefone}</span>}
                    </div>
                    {v.observacao && (
                      <p className="mt-2 text-sm text-foreground bg-neutral-50 rounded px-3 py-2 whitespace-pre-wrap">{v.observacao}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveVinculo(v)}
                    className="text-neutral-400 hover:text-error-600 shrink-0 mt-0.5"
                    title="Remover vínculo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* MODAL: Adicionar Vínculo */}
      {modalAddVinculo && (
        <Modal
          isOpen={modalAddVinculo}
          onClose={() => setModalAddVinculo(false)}
          title="Adicionar Vínculo"
          size="md"
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setModalAddVinculo(false)}>Cancelar</Button>
              <Button onClick={handleAddVinculo} disabled={!vinculoClienteSelecionado || vinculoSaving}>
                {vinculoSaving ? 'Salvando...' : 'Vincular'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Buscar cliente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                <input
                  type="text"
                  className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  placeholder="Nome, CPF ou telefone..."
                  value={vinculoBusca}
                  onChange={e => { setVinculoBusca(e.target.value); setVinculoClienteSelecionado(null); }}
                  autoFocus
                />
              </div>
              {vinculoBuscaResultados.length > 0 && !vinculoClienteSelecionado && (
                <div className="mt-1 border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-48 overflow-y-auto">
                  {vinculoBuscaResultados.map(c => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2 hover:bg-surface-secondary text-sm"
                      onClick={() => { setVinculoClienteSelecionado(c); setVinculoBusca(c.nome); setVinculoBuscaResultados([]); }}
                    >
                      <span className="font-medium">{c.nome}</span>
                      {c.cpf && <span className="text-muted ml-2">{c.cpf}</span>}
                      {c.telefone && <span className="text-muted ml-2">{c.telefone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {vinculoClienteSelecionado && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm">
                  <span className="font-medium text-primary-800">{vinculoClienteSelecionado.nome}</span>
                  <button onClick={() => { setVinculoClienteSelecionado(null); setVinculoBusca(''); }} className="ml-auto text-primary-600 hover:text-primary-900 text-xs">Trocar</button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Observação <span className="text-muted font-normal">(opcional)</span></label>
              <textarea
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                rows={3}
                placeholder="Descreva o vínculo entre eles..."
                value={vinculoObservacao}
                onChange={e => setVinculoObservacao(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Procedimento */}
      {modalProcedimento && (
        <Modal
          isOpen={!!modalProcedimento}
          onClose={() => setModalProcedimento(null)}
          title={modalProcedimento.etapa_label ? `${modalProcedimento.procedimento_nome} — ${modalProcedimento.etapa_label}` : modalProcedimento.procedimento_nome}
          size="md"
          footer={
            <Link href={`/atendimentos/${modalProcedimento.atendimento_id}`}>
              <Button variant="secondary" onClick={() => setModalProcedimento(null)}>
                Abrir Atendimento #{modalProcedimento.atendimento_id} →
              </Button>
            </Link>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StatusBadge type="item" status={modalProcedimento.status} />
              {modalProcedimento.concluido_at && (
                <span className="text-xs text-muted">Concluído em {formatarDataHora(modalProcedimento.concluido_at)}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Valor</p>
                <p className="font-semibold text-lg">{formatarMoeda(modalProcedimento.valor)}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Valor Pago</p>
                <p className={`font-semibold text-lg ${modalProcedimento.valor_pago >= modalProcedimento.valor ? 'text-success-600' : 'text-warning-600'}`}>
                  {formatarMoeda(modalProcedimento.valor_pago)}
                </p>
              </div>
              {modalProcedimento.executor_nome && (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide">Executor</p>
                  <p className="font-medium">{modalProcedimento.executor_nome}</p>
                </div>
              )}
              {modalProcedimento.criado_por_nome && (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide">Vendido por</p>
                  <p className="font-medium">{modalProcedimento.criado_por_nome}</p>
                </div>
              )}
              {modalProcedimento.quantidade > 1 && (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide">Quantidade</p>
                  <p className="font-medium">{modalProcedimento.quantidade}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Adicionado em</p>
                <p className="font-medium">{formatarDataHora(modalProcedimento.created_at)}</p>
              </div>
            </div>

            {modalProcedimento.dentes && (() => {
              const dentes = parseDentesLabels(modalProcedimento.dentes);
              return dentes.length > 0 ? (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide mb-1">Dentes</p>
                  <div className="flex flex-wrap gap-1">
                    {dentes.map(d => (
                      <span key={d} className="px-2 py-0.5 bg-surface-secondary rounded text-sm font-mono">{d}</span>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {modalProcedimento.observacoes && (
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-1">Observações</p>
                <p className="text-sm whitespace-pre-wrap bg-surface-secondary rounded-lg p-3">{modalProcedimento.observacoes}</p>
              </div>
            )}

          </div>
        </Modal>
      )}

      {/* MODAL: Pagamento */}
      {modalPagamento && (
        <Modal
          isOpen={!!modalPagamento}
          onClose={() => setModalPagamento(null)}
          title={`Pagamento — ${formatarMoeda(modalPagamento.valor)}`}
          size="sm"
          footer={
            <Link href={`/atendimentos/${modalPagamento.atendimento_id}`}>
              <Button variant="secondary" onClick={() => setModalPagamento(null)}>
                Abrir Atendimento #{modalPagamento.atendimento_id} →
              </Button>
            </Link>
          }
        >
          <div className="space-y-4">
            {modalPagamento.cancelado ? (
              <div className="rounded-lg p-3 bg-error-50 border border-error-200">
                <p className="text-sm font-semibold text-error-700">Pagamento Cancelado</p>
                {modalPagamento.motivo_cancelamento && (
                  <p className="text-sm text-error-600 mt-1">Motivo: {modalPagamento.motivo_cancelamento}</p>
                )}
              </div>
            ) : (
              <div className="rounded-lg p-3 bg-success-50 border border-success-200">
                <p className="text-sm font-semibold text-success-700">Pagamento Confirmado</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Valor</p>
                <p className={`font-semibold text-lg ${modalPagamento.cancelado ? 'line-through text-neutral-400' : 'text-success-600'}`}>
                  {formatarMoeda(modalPagamento.valor)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Método</p>
                <p className="font-medium">{METODOS_LABEL[modalPagamento.metodo] || modalPagamento.metodo}</p>
              </div>
              {modalPagamento.recebido_por_nome && (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide">Recebido por</p>
                  <p className="font-medium">{modalPagamento.recebido_por_nome}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Data</p>
                <p className="font-medium">{formatarDataHora(modalPagamento.created_at)}</p>
              </div>
            </div>

            {modalPagamento.observacoes && !modalPagamento.cancelado && (
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-1">Observações</p>
                <p className="text-sm whitespace-pre-wrap bg-surface-secondary rounded-lg p-3">{modalPagamento.observacoes}</p>
              </div>
            )}
          </div>
        </Modal>
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

      {/* MODAL: Transferir Saldo */}
      <Modal
        isOpen={modalTransferencia}
        onClose={() => setModalTransferencia(false)}
        title="Transferir saldo"
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModalTransferencia(false)}>Cancelar</Button>
            <Button
              onClick={handleTransferir}
              disabled={!transferenciaDestinoId || !transferenciaValor || transferindo}
            >
              {transferindo ? 'Transferindo...' : 'Confirmar transferência'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Saldo disponível: <span className="font-semibold">{formatarMoeda(saldo.saldo)}</span>
          </p>

          <div>
            <label className="block text-sm font-medium mb-1">Cliente destino *</label>
            {transferenciaDestinoId ? (
              <div className="flex items-center gap-2 p-2 bg-success-50 rounded-lg border border-success-200">
                <span className="text-sm font-medium text-success-800 flex-1">{transferenciaDestinoNome}</span>
                <button
                  onClick={() => { setTransferenciaDestinoId(null); setTransferenciaDestinoNome(''); setTransferBusca(''); setTransferResultados([]); }}
                  className="text-sm text-error-600 hover:text-error-800"
                >
                  Alterar
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={transferBusca}
                  onChange={(e) => setTransferBusca(e.target.value)}
                  placeholder="Buscar por nome ou CPF..."
                  className="input w-full"
                  autoFocus
                />
                {transferResultados.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {transferResultados.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setTransferenciaDestinoId(c.id); setTransferenciaDestinoNome(c.nome); setTransferBusca(''); setTransferResultados([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-neutral-50 text-sm"
                      >
                        {c.nome}
                        {c.cpf && <span className="text-muted ml-2">({c.cpf})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {transferBuscando && <p className="text-xs text-muted mt-1">Buscando...</p>}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Valor a transferir (R$) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={saldo.saldo}
              value={transferenciaValor}
              onChange={(e) => setTransferenciaValor(e.target.value)}
              placeholder="0,00"
              className="input w-full"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
