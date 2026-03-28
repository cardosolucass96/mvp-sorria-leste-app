'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatarMoeda } from '@/lib/utils/formatters';
import { ClipboardList, Search, Activity } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Card, Button, Select, SearchInput, Modal } from '@/components/ui';
import { ClienteForm, ClienteFormData } from '@/components/domain';
import usePageTitle from '@/lib/utils/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';

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
}

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
}

type TipoAtendimento = 'normal' | 'orto';

function NovoAtendimentoForm() {
  usePageTitle('Novo Atendimento');
  const router = useRouter();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const clienteIdParam = searchParams.get('cliente');

  // Clientes (busca via API)
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [loadingClientes, setLoadingClientes] = useState(true);

  // Seleções
  const [clienteId, setClienteId] = useState(clienteIdParam || '');
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento>('normal');
  const [avaliadorId, setAvaliadorId] = useState('');
  const [executorId, setExecutorId] = useState('');
  const [procedimentoOrtoId, setProcedimentoOrtoId] = useState('');

  // Dados estáticos
  const [avaliadores, setAvaliadores] = useState<Usuario[]>([]);
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loadingDados, setLoadingDados] = useState(true);

  // Modal novo cliente
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [savingNovoCliente, setSavingNovoCliente] = useState(false);
  const [erroNovoCliente, setErroNovoCliente] = useState('');

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
        const [resUsuarios, resProc] = await Promise.all([
          fetch('/api/usuarios'),
          fetch('/api/procedimentos'),
        ]);
        const usuariosData: Usuario[] = await resUsuarios.json();
        const procData: Procedimento[] = await resProc.json();

        setAvaliadores(usuariosData.filter((u) => u.role === 'avaliador' || u.role === 'admin'));
        setExecutores(usuariosData.filter((u) => u.role === 'executor' || u.role === 'admin'));
        setProcedimentos(procData);

        const orto = procData.find((p) =>
          p.nome.toLowerCase().includes('orto') ||
          p.nome.toLowerCase().includes('aparelho') ||
          p.nome.toLowerCase().includes('manutenção')
        );
        if (orto) setProcedimentoOrtoId(String(orto.id));
      } finally {
        setLoadingDados(false);
      }
    };
    carregarDados();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const procedimentoSelecionado = procedimentos.find((p) => p.id === parseInt(procedimentoOrtoId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId) return;
    setSaving(true);
    setError('');

    try {
      if (tipoAtendimento === 'orto' && !procedimentoOrtoId) {
        throw new Error('Selecione o procedimento para atendimento orto');
      }

      const payload: Record<string, unknown> = {
        cliente_id: parseInt(clienteId),
        avaliador_id: avaliadorId ? parseInt(avaliadorId) : null,
      };

      if (tipoAtendimento === 'orto') {
        payload.tipo_orto = true;
        payload.executor_id = executorId ? parseInt(executorId) : null;
        payload.procedimento_id = parseInt(procedimentoOrtoId);
        payload.valor = procedimentoSelecionado?.valor || 0;
        payload.criado_por_id = user?.id;
      }

      const res = await fetch('/api/atendimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar atendimento');

      router.push(tipoAtendimento === 'orto'
        ? `/atendimentos/${data.id}/pagamento`
        : `/atendimentos/${data.id}`
      );
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
        description="Iniciar atendimento para um cliente"
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

        {/* 2 — Tipo */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">2. Tipo de Atendimento</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setTipoAtendimento('normal')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipoAtendimento === 'normal' ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'
              }`}>
              <Search className="w-5 h-5 mb-1 text-primary-500" aria-hidden="true" />
              <div className="font-semibold text-sm">Normal</div>
              <p className="text-xs text-muted mt-1">Triagem → Avaliação → Pagamento → Execução</p>
            </button>
            <button type="button" onClick={() => setTipoAtendimento('orto')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipoAtendimento === 'orto' ? 'border-info-500 bg-info-50' : 'border-neutral-200 hover:border-neutral-300'
              }`}>
              <Activity className="w-5 h-5 mb-1 text-info-500" aria-hidden="true" />
              <div className="font-semibold text-sm">Orto / Aparelho</div>
              <p className="text-xs text-muted mt-1">Direto para Pagamento → Execução pelo dentista</p>
            </button>
          </div>
        </Card>

        {/* 3 — Avaliador ou Orto */}
        {tipoAtendimento === 'normal' ? (
          <Card>
            <h2 className="text-lg font-semibold mb-1">3. Avaliador</h2>
            <p className="text-sm text-muted mb-3">Opcional — pode ser definido depois</p>
            <Select label="Avaliador" name="avaliador" value={avaliadorId} onChange={setAvaliadorId}
              options={avaliadores.map((a) => ({ value: String(a.id), label: a.nome }))}
              placeholder="-- Definir depois --" />
          </Card>
        ) : (
          <Card className="border-l-4 border-l-info-500">
            <h2 className="text-lg font-semibold mb-3">3. Configuração Orto</h2>
            <div className="space-y-4">
              <Select label="Dentista (executor)" name="executor" value={executorId} onChange={setExecutorId}
                options={executores.map((e) => ({ value: String(e.id), label: e.nome }))}
                placeholder="-- Disponível para qualquer dentista --" />
              <Select label="Procedimento *" name="procedimento" value={procedimentoOrtoId} onChange={setProcedimentoOrtoId}
                options={procedimentos.map((p) => ({ value: String(p.id), label: `${p.nome} — ${formatarMoeda(p.valor)}` }))}
                placeholder="Selecione o procedimento..." required />
              {procedimentoSelecionado && (
                <div className="bg-info-50 border border-info-200 rounded-lg p-3 text-sm text-info-800">
                  <strong>Resumo:</strong> {procedimentoSelecionado.nome} — {formatarMoeda(procedimentoSelecionado.valor)}<br />
                  <span className="text-xs text-info-600">Será criado e irá direto para a fila de pagamento.</span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Botões */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => router.push('/atendimentos')}>
            Cancelar
          </Button>
          <Button type="submit"
            disabled={!clienteId || saving || (tipoAtendimento === 'orto' && !procedimentoOrtoId)}
            loading={saving}>
            {tipoAtendimento === 'orto' ? 'Criar Atendimento Orto' : 'Criar Atendimento'}
          </Button>
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
