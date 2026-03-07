'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda } from '@/lib/utils/formatters';
import Alert from '@/components/ui/Alert';
import LoadingState from '@/components/ui/LoadingState';
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
    return <LoadingState message="Carregando dados..." />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link 
          href="/atendimentos" 
          className="text-gray-500 hover:text-gray-700"
        >
          ← Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📋 Novo Atendimento</h1>
          <p className="text-gray-600">Iniciar atendimento para um cliente</p>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo de Atendimento */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Tipo de Atendimento</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTipoAtendimento('normal')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipoAtendimento === 'normal'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-1">🔍</div>
              <div className="font-semibold text-gray-900">Normal</div>
              <p className="text-xs text-gray-500 mt-1">
                Triagem → Avaliação → Pagamento → Execução
              </p>
            </button>
            
            <button
              type="button"
              onClick={() => setTipoAtendimento('orto')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipoAtendimento === 'orto'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-1">🦷</div>
              <div className="font-semibold text-gray-900">Orto / Aparelho</div>
              <p className="text-xs text-gray-500 mt-1">
                Direto para Pagamento → Execução pelo dentista
              </p>
            </button>
          </div>
        </div>

        {/* Seleção de Cliente */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Selecione o Cliente</h2>
          
          <div className="mb-4">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF ou telefone..."
              className="input"
            />
          </div>
          
          <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
            {clientesFiltrados.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                Nenhum cliente encontrado
              </div>
            ) : (
              clientesFiltrados.map((cliente) => (
                <label
                  key={cliente.id}
                  className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    clienteId === cliente.id.toString() ? 'bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="cliente"
                    value={cliente.id}
                    checked={clienteId === cliente.id.toString()}
                    onChange={(e) => setClienteId(e.target.value)}
                    className="text-blue-600"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{cliente.nome}</p>
                    <p className="text-sm text-gray-500">
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
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              + Cadastrar novo cliente
            </Link>
          </div>
        </div>

        {/* Fluxo Normal: Avaliador */}
        {tipoAtendimento === 'normal' && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Avaliador (opcional)</h2>
            <p className="text-sm text-gray-500 mb-4">
              Selecione um avaliador ou deixe em branco para definir depois
            </p>
            
            <select
              value={avaliadorId}
              onChange={(e) => setAvaliadorId(e.target.value)}
              className="input"
            >
              <option value="">-- Definir depois --</option>
              {avaliadores.map((avaliador) => (
                <option key={avaliador.id} value={avaliador.id}>
                  {avaliador.nome} ({avaliador.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Fluxo Orto: Dentista + Procedimento */}
        {tipoAtendimento === 'orto' && (
          <div className="card border-l-4 border-l-blue-500">
            <h2 className="text-lg font-semibold mb-4">🦷 Configuração Orto</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dentista (executor) *
                </label>
                <select
                  value={executorId}
                  onChange={(e) => setExecutorId(e.target.value)}
                  className="input"
                  required
                >
                  <option value="">Selecione o dentista...</option>
                  {executores.map((exec) => (
                    <option key={exec.id} value={exec.id}>
                      {exec.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Procedimento *
                </label>
                <select
                  value={procedimentoOrtoId}
                  onChange={(e) => setProcedimentoOrtoId(e.target.value)}
                  className="input"
                  required
                >
                  <option value="">Selecione o procedimento...</option>
                  {procedimentos.map((proc) => (
                    <option key={proc.id} value={proc.id}>
                      {proc.nome} - {formatarMoeda(proc.valor)}
                    </option>
                  ))}
                </select>
              </div>

              {procedimentoSelecionado && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Resumo:</strong> {procedimentoSelecionado.nome} — {formatarMoeda(procedimentoSelecionado.valor)}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    O atendimento será criado e irá direto para a fila de pagamento.
                    Após o pagamento, entrará na fila de execução do dentista selecionado.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Botões */}
        <div className="flex justify-end gap-3">
          <Link href="/atendimentos" className="btn btn-secondary">
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={!clienteId || saving || (tipoAtendimento === 'orto' && (!executorId || !procedimentoOrtoId))}
            className="btn btn-primary disabled:opacity-50"
          >
            {saving 
              ? 'Criando...' 
              : tipoAtendimento === 'orto' 
                ? '🦷 Criar Atendimento Orto' 
                : 'Criar Atendimento'
            }
          </button>
        </div>
      </form>
    </div>
  );
}
