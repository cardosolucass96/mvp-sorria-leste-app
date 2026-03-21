'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda } from '@/lib/utils/formatters';
import { ClipboardList, Search, Activity } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Card, Button, Input, Select } from '@/components/ui';
import usePageTitle from '@/lib/utils/usePageTitle';

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
  por_dente: number;
}

type TipoAtendimento = 'normal' | 'orto';

export default function NovoAtendimentoPage() {
  usePageTitle('Novo Atendimento');
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [avaliadores, setAvaliadores] = useState<Usuario[]>([]);
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  
  const [clienteId, setClienteId] = useState('');
  const [avaliadorId, setAvaliadorId] = useState('');
  const [busca, setBusca] = useState('');
  
  // Orto
  const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento>('normal');
  const [executorId, setExecutorId] = useState('');
  const [procedimentoOrtoId, setProcedimentoOrtoId] = useState('');

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const [resClientes, resUsuarios, resProc] = await Promise.all([
        fetch('/api/clientes'),
        fetch('/api/usuarios'),
        fetch('/api/procedimentos'),
      ]);
      
      const clientesData = await resClientes.json();
      const usuariosData = await resUsuarios.json();
      const procData = await resProc.json();
      
      setClientes(clientesData);
      setAvaliadores(
        usuariosData.filter((u: Usuario) => u.role === 'avaliador' || u.role === 'admin')
      );
      setExecutores(
        usuariosData.filter((u: Usuario) => u.role === 'executor' || u.role === 'admin')
      );
      setProcedimentos(procData);
      
      // Pre-selecionar procedimento de orto se existir
      const orto = procData.find((p: Procedimento) => 
        p.nome.toLowerCase().includes('orto') || 
        p.nome.toLowerCase().includes('aparelho') ||
        p.nome.toLowerCase().includes('manutenção')
      );
      if (orto) {
        setProcedimentoOrtoId(orto.id.toString());
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setLoadError('Erro ao carregar dados. Tente recarregar a página.');
    } finally {
      setLoading(false);
    }
  };

  const clientesFiltrados = clientes.filter((c) => {
    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      c.nome.toLowerCase().includes(termo) ||
      c.cpf?.includes(termo) ||
      c.telefone?.includes(termo)
    );
  });

  const procedimentoSelecionado = procedimentos.find(
    (p) => p.id === parseInt(procedimentoOrtoId)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (tipoAtendimento === 'orto') {
        if (!executorId) {
          throw new Error('Selecione o dentista para atendimento orto');
        }
        if (!procedimentoOrtoId) {
          throw new Error('Selecione o procedimento');
        }
      }

      const payload: Record<string, unknown> = {
        cliente_id: parseInt(clienteId),
        avaliador_id: avaliadorId ? parseInt(avaliadorId) : null,
      };

      if (tipoAtendimento === 'orto') {
        payload.tipo_orto = true;
        payload.executor_id = parseInt(executorId);
        payload.procedimento_id = parseInt(procedimentoOrtoId);
        payload.valor = procedimentoSelecionado?.valor || 0;
      }

      const res = await fetch('/api/atendimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao criar atendimento');
      }

      const atendimento = await res.json();
      
      if (tipoAtendimento === 'orto') {
        router.push(`/atendimentos/${atendimento.id}/pagamento`);
      } else {
        router.push(`/atendimentos/${atendimento.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState text="Carregando dados..." />;
  }

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

      {loadError && <Alert type="error">{loadError}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo de Atendimento */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Tipo de Atendimento</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTipoAtendimento('normal')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipoAtendimento === 'normal'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              <Search className="w-6 h-6 mb-1 text-primary-500" aria-hidden="true" />
              <div className="font-semibold text-foreground">Normal</div>
              <p className="text-xs text-muted mt-1">
                Triagem → Avaliação → Pagamento → Execução
              </p>
            </button>
            
            <button
              type="button"
              onClick={() => setTipoAtendimento('orto')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipoAtendimento === 'orto'
                  ? 'border-info-500 bg-info-50'
                  : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              <Activity className="w-6 h-6 mb-1 text-info-500" aria-hidden="true" />
              <div className="font-semibold text-foreground">Orto / Aparelho</div>
              <p className="text-xs text-muted mt-1">
                Direto para Pagamento → Execução pelo dentista
              </p>
            </button>
          </div>
        </Card>

        {/* Seleção de Cliente */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Selecione o Cliente</h2>
          
          <div className="mb-4">
            <Input
              label="Buscar cliente"
              name="busca"
              value={busca}
              onChange={(value) => setBusca(value)}
              placeholder="Buscar por nome, CPF ou telefone..."
            />
          </div>
          
          <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
            {clientesFiltrados.length === 0 ? (
              <div className="p-4 text-center text-muted">
                Nenhum cliente encontrado
              </div>
            ) : (
              clientesFiltrados.map((cliente) => (
                <label
                  key={cliente.id}
                  className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-secondary transition-colors ${
                    clienteId === cliente.id.toString() ? 'bg-info-50' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="cliente"
                    value={cliente.id}
                    checked={clienteId === cliente.id.toString()}
                    onChange={(e) => setClienteId(e.target.value)}
                    className="text-info-600"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{cliente.nome}</p>
                    <p className="text-sm text-muted">
                      {cliente.cpf && `CPF: ${cliente.cpf}`}
                      {cliente.cpf && cliente.telefone && ' • '}
                      {cliente.telefone && `Tel: ${cliente.telefone}`}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t">
            <Link 
              href="/clientes/novo" 
              className="text-info-600 hover:text-info-800 text-sm"
            >
              + Cadastrar novo cliente
            </Link>
          </div>
        </Card>

        {/* Fluxo Normal: Avaliador */}
        {tipoAtendimento === 'normal' && (
          <Card>
            <h2 className="text-lg font-semibold mb-4">Avaliador (opcional)</h2>
            <p className="text-sm text-muted mb-4">
              Selecione um avaliador ou deixe em branco para definir depois
            </p>
            
            <Select
              label="Avaliador"
              name="avaliador"
              value={avaliadorId}
              onChange={(value) => setAvaliadorId(value)}
              options={avaliadores.map((a) => ({ value: String(a.id), label: `${a.nome} (${a.role})` }))}
              placeholder="-- Definir depois --"
            />
          </Card>
        )}

        {/* Fluxo Orto: Dentista + Procedimento */}
        {tipoAtendimento === 'orto' && (
          <Card className="border-l-4 border-l-info-500">
            <h2 className="text-lg font-semibold mb-4">Configuração Orto</h2>
            
            <div className="space-y-4">
              <div>
                <Select
                  label="Dentista (executor) *"
                  name="executor"
                  value={executorId}
                  onChange={(value) => setExecutorId(value)}
                  options={executores.map((e) => ({ value: String(e.id), label: e.nome }))}
                  placeholder="Selecione o dentista..."
                  required
                />
              </div>

              <div>
                <Select
                  label="Procedimento *"
                  name="procedimento"
                  value={procedimentoOrtoId}
                  onChange={(value) => setProcedimentoOrtoId(value)}
                  options={procedimentos.map((p) => ({ value: String(p.id), label: `${p.nome} - ${formatarMoeda(p.valor)}` }))}
                  placeholder="Selecione o procedimento..."
                  required
                />
              </div>

              {procedimentoSelecionado && (
                <div className="bg-info-50 border border-info-200 rounded-lg p-4">
                  <p className="text-sm text-info-800">
                    <strong>Resumo:</strong> {procedimentoSelecionado.nome} — {formatarMoeda(procedimentoSelecionado.valor)}
                  </p>
                  <p className="text-xs text-info-600 mt-1">
                    O atendimento será criado e irá direto para a fila de pagamento.
                    Após o pagamento, entrará na fila de execução do dentista selecionado.
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Botões */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/atendimentos')} type="button">
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={!clienteId || saving || (tipoAtendimento === 'orto' && (!executorId || !procedimentoOrtoId))}
            loading={saving}
          >
            {tipoAtendimento === 'orto' 
              ? 'Criar Atendimento Orto'
              : 'Criar Atendimento'
            }
          </Button>
        </div>
      </form>
    </div>
  );
}
