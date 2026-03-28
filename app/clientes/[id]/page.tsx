'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Cliente } from '@/lib/types';
import { User, ClipboardList, Activity, CreditCard, Clock, FileText } from 'lucide-react';
import { PageHeader, Card, Button, Alert, LoadingState, EmptyState, ConfirmDialog, Tabs, Modal } from '@/components/ui';
import { StatusBadge } from '@/components/domain';
import { ClienteForm, ClienteFormData } from '@/components/domain';
import { formatarData, formatarDataHora, formatarMoeda, formatarCPF, formatarTelefone } from '@/lib/utils/formatters';
import { getOrigemLabel } from '@/lib/constants/origens';
import { STATUS_CONFIG } from '@/lib/constants/status';
import type { AtendimentoStatus } from '@/lib/types';
import usePageTitle from '@/lib/utils/usePageTitle';

const METODOS_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
};

const HISTORICO_CONFIG: Record<string, { label: string; cor: string }> = {
  atendimento_criado: { label: 'Atendimento criado', cor: 'bg-primary-500' },
  liberado:           { label: 'Liberado para execução', cor: 'bg-info-500' },
  finalizado:         { label: 'Finalizado', cor: 'bg-success-500' },
  pagamento:          { label: 'Pagamento', cor: 'bg-warning-500' },
  procedimento:       { label: 'Procedimento', cor: 'bg-neutral-400' },
  etapa_concluida:    { label: 'Etapa concluída', cor: 'bg-success-400' },
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
  executor_nome: string | null;
  prontuario_id: number | null;
  prontuario_descricao: string | null;
  prontuario_observacoes: string | null;
  prontuario_data: string | null;
  prontuario_updated_at: string | null;
  prontuario_autor: string | null;
}

interface PagamentoItem {
  pagamento_id: number;
  item_atendimento_id: number;
  valor_aplicado: number;
  procedimento_nome: string;
}

interface FichaData {
  atendimentos: Atendimento[];
  procedimentos: ItemProcedimento[];
  pagamentos: Pagamento[];
  pagamentosItens: PagamentoItem[];
  historico: EventoHistorico[];
  prontuarios: ItemProntuario[];
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
      } catch {
        setError('Erro ao carregar cliente');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id, router]);

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(''); setSuccess(''); }, 3000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

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

  const abas = [
    { key: 'dados', label: 'Dados' },
    { key: 'atendimentos', label: 'Atendimentos', count: ficha?.atendimentos.length },
    { key: 'procedimentos', label: 'Procedimentos', count: ficha?.procedimentos.length },
    { key: 'pagamentos', label: 'Pagamentos', count: ficha?.pagamentos.filter(p => !p.cancelado).length },
    { key: 'prontuario', label: 'Prontuário', count: ficha?.prontuarios.length },
    { key: 'historico', label: 'Histórico', count: ficha?.historico.length },
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
                  <div><p className="text-xs text-muted">Data de Nascimento</p><p className="font-medium">{cliente.data_nascimento ? formatarData(cliente.data_nascimento) : '-'}</p></div>
                  <div><p className="text-xs text-muted">Origem</p><p className="font-medium">{getOrigemLabel(cliente.origem)}</p></div>
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {ficha.procedimentos.map(p => (
                  <tr key={p.id} className="hover:bg-surface-secondary">
                    <td className="px-4 py-3 font-medium">{p.procedimento_nome}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/atendimentos/${p.atendimento_id}`} className="text-info-600 hover:text-info-800">#{p.atendimento_id}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{p.executor_nome || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatarMoeda(p.valor)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge type="item" status={p.status} /></td>
                    <td className="px-4 py-3 text-sm text-muted">{formatarData(p.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setModalProcedimento(p)} className="text-sm text-info-600 hover:text-info-800">Ver →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ABA: PAGAMENTOS */}
      {abaAtiva === 'pagamentos' && (
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
              const dentes = item.dentes ? JSON.parse(item.dentes) as string[] : [];
              return (
                <Card key={item.item_id}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-semibold text-base">{item.procedimento_nome}</h3>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted">
                        {item.executor_nome && <span>Executor: <span className="text-foreground">{item.executor_nome}</span></span>}
                        {dentes.length > 0 && <span>Dentes: <span className="text-foreground">{dentes.join(', ')}</span></span>}
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
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-neutral-200" />
              <div className="space-y-4">
                {ficha.historico.map((ev, i) => {
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
                            <Link href={`/atendimentos/${ev.ref_id}`} className="text-xs text-info-600 hover:text-info-800">
                              Ver atend. →
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* MODAL: Procedimento */}
      {modalProcedimento && (
        <Modal
          isOpen={!!modalProcedimento}
          onClose={() => setModalProcedimento(null)}
          title={modalProcedimento.procedimento_nome}
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
              const dentes = JSON.parse(modalProcedimento.dentes!) as string[];
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

            {modalProcedimento.valor_pago < modalProcedimento.valor && (
              <div className="rounded-lg p-3 bg-warning-50 border border-warning-200">
                <p className="text-sm text-warning-800">
                  Saldo pendente: <span className="font-semibold">{formatarMoeda(modalProcedimento.valor - modalProcedimento.valor_pago)}</span>
                </p>
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

            {(() => {
              const itens = ficha?.pagamentosItens.filter(i => i.pagamento_id === modalPagamento.id) ?? [];
              return itens.length > 0 ? (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide mb-2">Procedimentos cobertos</p>
                  <div className="space-y-1">
                    {itens.map(i => (
                      <div key={i.item_atendimento_id} className="flex items-center justify-between text-sm bg-surface-secondary rounded-lg px-3 py-2">
                        <span>{i.procedimento_nome}</span>
                        <span className="font-medium text-success-700">{formatarMoeda(i.valor_aplicado)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

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
    </div>
  );
}
