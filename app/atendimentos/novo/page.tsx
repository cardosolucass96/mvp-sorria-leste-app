'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Search, Calendar } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Card, Button, Input, Select, SearchInput, Modal } from '@/components/ui';
import { ClienteForm, ClienteFormData } from '@/components/domain';
import usePageTitle from '@/lib/utils/usePageTitle';
import { formatarDataAgendada } from '@/lib/utils/formatters';
import { apiFetch } from '@/lib/utils/apiFetch';
import type { CategoriaComRoles } from '@/lib/types';

interface Agendamento {
  id: number;
  procedimento_nome: string;
  etapa_modelo_nome: string | null;
  data_agendada: string | null;
  created_at: string;
}

interface Cliente {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
}

interface Usuario {
  id: number;
  nome: string;
  role: string;
  ativo?: number;
}

interface ProcedimentoLite {
  id: number;
  nome: string;
  valor: number;
  categoria_id: number | null;
  ativo: number;
}

type TipoAtendimento = 'normal' | 'sessao';

function NovoAtendimentoForm() {
  usePageTitle('Novo Atendimento');
  const router = useRouter();
  const searchParams = useSearchParams();
  const unitFetch = useUnitFetch();
  const { user } = useAuth();
  const clienteIdParam = searchParams.get('cliente');

  // Clientes (busca via API)
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [loadingClientes, setLoadingClientes] = useState(true);

  // Seleções
  const [clienteId, setClienteId] = useState(clienteIdParam || '');
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento>('normal');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [avaliadorId, setAvaliadorId] = useState('');

  // Campos do fluxo pula_avaliacao (orto-like)
  const [procedimentoId, setProcedimentoId] = useState<string>('');
  const [executorId, setExecutorId] = useState<string>('');
  const [valorProcedimento, setValorProcedimento] = useState<string>('');

  // Dados estáticos
  const [categorias, setCategorias] = useState<CategoriaComRoles[]>([]);
  const [avaliadores, setAvaliadores] = useState<Usuario[]>([]);
  const [procedimentosCategoria, setProcedimentosCategoria] = useState<ProcedimentoLite[]>([]);
  const [executoresCategoria, setExecutoresCategoria] = useState<Usuario[]>([]);
  const [loadingDados, setLoadingDados] = useState(true);

  const categoriaSelecionada = categorias.find(c => String(c.id) === categoriaId) || null;
  const pulaAvaliacao = categoriaSelecionada?.pula_avaliacao === 1;

  // Modal novo cliente
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [savingNovoCliente, setSavingNovoCliente] = useState(false);
  const [erroNovoCliente, setErroNovoCliente] = useState('');

  // Sessão agendada
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState<Agendamento | null>(null);
  const [confirmandoSessao, setConfirmandoSessao] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Busca clientes via API
  const buscarClientes = useCallback(async (termo: string) => {
    setLoadingClientes(true);
    try {
      const params = new URLSearchParams({ limit: '10', ordem: 'recente' });
      if (termo) params.set('busca', termo);
      const res = await fetch(`/api/clientes?${params}`);
      const data = await res.json();
      setClientes(data.clientes ?? []);
    } finally {
      setLoadingClientes(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    buscarClientes('');

    const carregarDados = async () => {
      try {
        const [resUsuarios, resCategorias] = await Promise.all([
          apiFetch('/api/usuarios'),
          apiFetch('/api/categorias?ativo=1'),
        ]);

        if (!resUsuarios.ok) {
          throw new Error('Não foi possível carregar os avaliadores');
        }
        if (!resCategorias.ok) {
          throw new Error('Não foi possível carregar as categorias');
        }

        const usuariosData: Usuario[] = await resUsuarios.json();
        setAvaliadores(usuariosData.filter((u) => (u.role === 'avaliador' || u.role === 'admin') && u.ativo !== 0));

        const cats: CategoriaComRoles[] = await resCategorias.json();
        setCategorias(cats);

        const categoriaPadrao = cats.find(c => c.slug === 'geral') ?? cats[0] ?? null;
        if (categoriaPadrao) {
          setCategoriaId(String(categoriaPadrao.id));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados do formulário');
      } finally {
        setLoadingDados(false);
      }
    };
    carregarDados();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando a categoria mudar e for pula_avaliacao, carrega procedimentos da categoria e executores compatíveis
  useEffect(() => {
    if (!categoriaId || !pulaAvaliacao) {
      setProcedimentosCategoria([]);
      setExecutoresCategoria([]);
      setProcedimentoId('');
      setExecutorId('');
      return;
    }
    (async () => {
      const [resProcs, resExecs] = await Promise.all([
        fetch('/api/procedimentos'),
        fetch(`/api/usuarios?categoria_id=${categoriaId}`),
      ]);
      const procsData: ProcedimentoLite[] = await resProcs.json();
      setProcedimentosCategoria(procsData.filter(p => p.categoria_id === parseInt(categoriaId)));
      if (resExecs.ok) {
        const execsData: Usuario[] = await resExecs.json();
        setExecutoresCategoria(execsData);
      }
    })();
  }, [categoriaId, pulaAvaliacao]);

  useEffect(() => {
    const proc = procedimentosCategoria.find(p => String(p.id) === procedimentoId);
    if (proc && !valorProcedimento) {
      setValorProcedimento(String(proc.valor));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procedimentoId]);

  // Pré-selecionar cliente vindo de ?cliente=
  useEffect(() => {
    if (!clienteIdParam) return;
    fetch(`/api/clientes/${clienteIdParam}`)
      .then((r) => r.json())
      .then((c: Cliente) => { setClienteSelecionado(c); setClienteId(String(c.id)); })
      .catch(() => {});
  }, [clienteIdParam]);

  const handleSelecionarCliente = (c: Cliente) => {
    setClienteId(String(c.id));
    setClienteSelecionado(c);
    setAgendamentoSelecionado(null);
    if (tipoAtendimento === 'sessao') {
      buscarAgendamentos(c.id);
    }
  };

  const buscarAgendamentos = async (cId: number) => {
    setLoadingAgendamentos(true);
    try {
      const res = await unitFetch(`/api/agendamentos?cliente_id=${cId}&status=pendente,agendado`);
      const data = await res.json();
      setAgendamentos(data.agendamentos ?? data ?? []);
    } finally {
      setLoadingAgendamentos(false);
    }
  };

  const handleConfirmarSessao = async () => {
    if (!agendamentoSelecionado) return;
    setConfirmandoSessao(true);
    setError('');
    try {
      const res = await unitFetch(`/api/agendamentos/${agendamentoSelecionado.id}/chegou`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao confirmar chegada');
      router.push(`/atendimentos/${data.atendimento_id ?? data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar sessão');
      setConfirmandoSessao(false);
    }
  };

  const diasAtras = (dataStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dataStr).getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Criado hoje';
    if (diff === 1) return 'Criado há 1 dia';
    return `Criado há ${diff} dias`;
  };

  // Criar novo cliente via modal e auto-selecionar
  const handleCriarNovoCliente = async (formData: ClienteFormData) => {
    setErroNovoCliente('');
    setSavingNovoCliente(true);
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) { setErroNovoCliente(data.error || 'Erro ao cadastrar'); return; }
      handleSelecionarCliente(data);
      setModalNovoCliente(false);
    } finally {
      setSavingNovoCliente(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId) return;
    if (categorias.length === 0) {
      setError('Nenhuma fila ativa disponível para criar o atendimento');
      return;
    }
    if (!categoriaId) {
      setError('Selecione uma fila');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        cliente_id: parseInt(clienteId),
        categoria_id: categoriaId ? parseInt(categoriaId) : null,
      };

      if (pulaAvaliacao) {
        if (!procedimentoId) {
          setError('Selecione um procedimento');
          setSaving(false);
          return;
        }
        payload.procedimento_id = parseInt(procedimentoId);
        if (executorId) payload.executor_id = parseInt(executorId);
        if (valorProcedimento) payload.valor = parseFloat(valorProcedimento);
        payload.criado_por_id = user?.id;
      } else {
        payload.avaliador_id = avaliadorId ? parseInt(avaliadorId) : null;
      }

      const res = await unitFetch('/api/atendimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar atendimento');

      router.push(`/atendimentos/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar');
      setSaving(false);
    }
  };

  if (loadingDados) return <LoadingState text="Carregando dados..." />;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Novo Atendimento"
        icon={<ClipboardList className="w-7 h-7" />}
        description="Cadastre um novo atendimento na fila de execução"
        breadcrumb={[
          { label: 'Atendimentos', href: '/atendimentos' },
          { label: 'Novo Atendimento' },
        ]}
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* 1 — Cliente */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">1. Cliente</h2>

          {clienteSelecionado ? (
            <div className="flex items-center justify-between p-3 bg-primary-50 border border-primary-200 rounded-lg">
              <div>
                <p className="font-medium">{clienteSelecionado.nome}</p>
                <p className="text-sm text-muted">{clienteSelecionado.telefone || 'Sem telefone'}</p>
              </div>
              <Button type="button" variant="ghost" size="sm"
                onClick={() => { setClienteSelecionado(null); setClienteId(''); }}>
                Trocar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <SearchInput
                value={buscaCliente}
                onChange={setBuscaCliente}
                onSearch={buscarClientes}
                placeholder="Buscar por nome, CPF, telefone ou email..."
              />
              <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                {loadingClientes ? (
                  <div className="p-4 text-center text-sm text-muted">Buscando...</div>
                ) : clientes.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted">Nenhum cliente encontrado</div>
                ) : (
                  clientes.map((c) => (
                    <button key={c.id} type="button"
                      onClick={() => handleSelecionarCliente(c)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-secondary transition-colors">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{c.nome}</p>
                        <p className="text-xs text-muted">
                          {[c.cpf && `CPF: ${c.cpf}`, c.telefone && `Tel: ${c.telefone}`].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button type="button" onClick={() => setModalNovoCliente(true)}
                className="text-info-600 hover:text-info-800 text-sm">
                + Cadastrar novo cliente
              </button>
            </div>
          )}
        </Card>

        {/* 2 — Categoria (fila) */}
        {categorias.length > 0 && (
          <Card>
            <h2 className="text-lg font-semibold mb-3">2. Fila</h2>
            <p className="text-sm text-muted mb-3">Escolha a fila onde o procedimento será executado.</p>
            <Select
              label="Fila"
              name="categoria_id"
              value={categoriaId}
              onChange={setCategoriaId}
              options={categorias.map(c => ({
                value: String(c.id),
                 label: c.nome,
              }))}
              placeholder="-- Selecionar --"
            />
          </Card>
        )}

        {/* 3 — Tipo (apenas se NÃO pula avaliação) */}
        {!pulaAvaliacao && (
        <Card>
          <h2 className="text-lg font-semibold mb-3">3. Tipo de Atendimento</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setTipoAtendimento('normal')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipoAtendimento === 'normal' ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'
              }`}>
              <Search className="w-5 h-5 mb-1 text-primary-500" aria-hidden="true" />
              <div className="font-semibold text-sm">Avaliação sem agendamento</div>
              <p className="text-xs text-muted mt-1">Cliente chegou sem agendamento</p>
            </button>
            <button type="button" onClick={() => {
              setTipoAtendimento('sessao');
              if (clienteSelecionado) buscarAgendamentos(clienteSelecionado.id);
            }}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipoAtendimento === 'sessao' ? 'border-warning-500 bg-warning-50' : 'border-neutral-200 hover:border-neutral-300'
              }`}>
              <Calendar className="w-5 h-5 mb-1 text-warning-500" aria-hidden="true" />
              <div className="font-semibold text-sm">Já agendado</div>
              <p className="text-xs text-muted mt-1">Cliente tem sessão agendada e veio fazer</p>
            </button>
          </div>
        </Card>
        )}

        {/* 4 — Fluxo */}
        {pulaAvaliacao ? (
          <Card>
            <h2 className="text-lg font-semibold mb-3">3. Procedimento e Executor</h2>
            <p className="text-sm text-muted mb-3">Esta fila vai direto para pagamento, sem necessidade de avaliação.</p>
            <div className="space-y-3">
              <Select
                label="Procedimento"
                name="procedimento_id"
                value={procedimentoId}
                onChange={setProcedimentoId}
                options={procedimentosCategoria.map(p => ({
                  value: String(p.id),
                  label: p.nome,
                }))}
                placeholder="-- Selecionar --"
                required
              />
              {procedimentoId && (
                <Input
                  label="Valor (R$)"
                  name="valor"
                  type="number"
                  value={valorProcedimento}
                  onChange={setValorProcedimento}
                  placeholder="0,00"
                />
              )}
              <Select
                label="Executor (opcional)"
                name="executor_id"
                value={executorId}
                onChange={setExecutorId}
                options={executoresCategoria.map(u => ({ value: String(u.id), label: u.nome }))}
                placeholder="-- Deixar disponível para qualquer executor --"
              />
            </div>
          </Card>
        ) : tipoAtendimento === 'normal' ? (
          <Card>
            <h2 className="text-lg font-semibold mb-1">4. Avaliador</h2>
            <p className="text-sm text-muted mb-3">Pode ser definido depois na fila de avaliação</p>
            <Select label="Avaliador" name="avaliador" value={avaliadorId} onChange={setAvaliadorId}
              options={avaliadores.map((a) => ({ value: String(a.id), label: a.nome }))}
              placeholder="-- Definir depois --" />
          </Card>
        ) : (
          <Card className="border-l-4 border-l-warning-500">
            <h2 className="text-lg font-semibold mb-3">4. Agendamento</h2>
            {!clienteSelecionado ? (
              <p className="text-sm text-muted">Selecione o cliente acima para ver os agendamentos pendentes.</p>
            ) : loadingAgendamentos ? (
              <div className="py-4 text-center text-sm text-muted">Buscando agendamentos...</div>
            ) : agendamentos.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted">
                Nenhum agendamento pendente para {clienteSelecionado.nome}.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted mb-2">Selecione qual sessão o cliente veio fazer:</p>
                <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                  {agendamentos.map((ag) => (
                    <button key={ag.id} type="button"
                      onClick={() => setAgendamentoSelecionado(ag)}
                      className={`w-full flex items-center justify-between p-3 text-left transition-colors ${
                        agendamentoSelecionado?.id === ag.id
                          ? 'bg-warning-50 border-l-4 border-l-warning-500'
                          : 'hover:bg-surface-secondary'
                      }`}>
                      <div>
                        <p className="font-medium text-sm">
                          {ag.procedimento_nome}{ag.etapa_modelo_nome ? <span className="text-muted font-normal"> — {ag.etapa_modelo_nome}</span> : null}
                        </p>
                        <p className="text-xs text-muted">
                          {ag.data_agendada
                            ? formatarDataAgendada(ag.data_agendada)
                            : 'Sem data'}
                          {' • '}{diasAtras(ag.created_at)}
                        </p>
                      </div>
                      {agendamentoSelecionado?.id === ag.id && (
                        <span className="text-warning-600 text-xs font-medium">Selecionado</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Botões */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => router.push('/atendimentos')}>
            Cancelar
          </Button>
          {tipoAtendimento === 'sessao' ? (
            <Button type="button"
              onClick={handleConfirmarSessao}
              disabled={!agendamentoSelecionado || confirmandoSessao}
              loading={confirmandoSessao}>
              Confirmar Chegada
            </Button>
          ) : (
            <Button type="submit" disabled={!clienteId || saving} loading={saving}>
              Criar Atendimento
            </Button>
          )}
        </div>
      </form>

      {/* Modal: novo cliente */}
      <Modal isOpen={modalNovoCliente} onClose={() => setModalNovoCliente(false)}
        title="Cadastrar Novo Cliente" size="lg">
        <ClienteForm
          onSubmit={handleCriarNovoCliente}
          onCancel={() => setModalNovoCliente(false)}
          loading={savingNovoCliente}
          error={erroNovoCliente}
          submitLabel="Cadastrar e Selecionar"
        />
      </Modal>
    </div>
  );
}

export default function NovoAtendimentoPage() {
  return (
    <Suspense fallback={<LoadingState text="Carregando..." />}>
      <NovoAtendimentoForm />
    </Suspense>
  );
}
