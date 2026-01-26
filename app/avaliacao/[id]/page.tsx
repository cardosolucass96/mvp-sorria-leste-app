'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
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
    
    setAdicionando(true);
    setError('');
    
    try {
      const proc = procedimentos.find(p => p.id === parseInt(procedimentoId));
      
      const res = await fetch(`/api/atendimentos/${id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: parseInt(procedimentoId),
          executor_id: executorId ? parseInt(executorId) : null,
          criado_por_id: user?.id,
          valor: valorCustom ? parseFloat(valorCustom) : proc?.valor,
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

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const procedimentoSelecionado = procedimentos.find(
    p => p.id === parseInt(procedimentoId)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  if (!atendimento) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Atendimento não encontrado</p>
        <Link href="/avaliacao" className="text-blue-600">
          ← Voltar para fila
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/avaliacao" 
            className="text-gray-500 hover:text-gray-700"
          >
            ← Voltar
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              🔍 Avaliação - {atendimento.cliente_nome}
            </h1>
            <p className="text-gray-600">
              Atendimento #{atendimento.id}
            </p>
          </div>
        </div>
        
        <button
          onClick={handleFinalizarAvaliacao}
          disabled={finalizando || atendimento.itens.length === 0}
          className="btn btn-primary disabled:opacity-50"
        >
          {finalizando ? 'Finalizando...' : '✓ Finalizar Avaliação'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Aviso de privacidade */}
      <div className="card bg-yellow-50 border border-yellow-200">
        <p className="text-sm text-yellow-800">
          <strong>⚠️ Modo Avaliação:</strong> Você está vendo apenas o nome do paciente.
          Os dados pessoais (CPF, telefone, email) estão ocultos por privacidade.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Adicionar Procedimento */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">➕ Adicionar Procedimento</h2>
          
          <form onSubmit={handleAdicionarProcedimento} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Procedimento *
              </label>
              <select
                value={procedimentoId}
                onChange={(e) => {
                  setProcedimentoId(e.target.value);
                  setValorCustom('');
                }}
                className="input"
                required
              >
                <option value="">Selecione...</option>
                {procedimentos.map((proc) => (
                  <option key={proc.id} value={proc.id}>
                    {proc.nome} - {formatarMoeda(proc.valor)}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Executor
              </label>
              <select
                value={executorId}
                onChange={(e) => setExecutorId(e.target.value)}
                className="input"
              >
                <option value="">Definir depois</option>
                {executores.map((exec) => (
                  <option key={exec.id} value={exec.id}>
                    {exec.nome}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={valorCustom}
                onChange={(e) => setValorCustom(e.target.value)}
                placeholder={procedimentoSelecionado 
                  ? `Padrão: ${procedimentoSelecionado.valor}` 
                  : 'Selecione um procedimento'}
                className="input"
              />
              {procedimentoSelecionado && !valorCustom && (
                <p className="text-xs text-gray-500 mt-1">
                  Valor padrão será usado: {formatarMoeda(procedimentoSelecionado.valor)}
                </p>
              )}
            </div>
            
            <button
              type="submit"
              disabled={!procedimentoId || adicionando}
              className="btn btn-secondary w-full disabled:opacity-50"
            >
              {adicionando ? 'Adicionando...' : '+ Adicionar'}
            </button>
          </form>
        </div>

        {/* Resumo Financeiro */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">💰 Resumo</h2>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Total de Procedimentos</span>
              <span className="text-xl font-bold">{atendimento.itens.length}</span>
            </div>
            
            <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
              <span className="text-blue-700">Valor Total</span>
              <span className="text-2xl font-bold text-blue-700">
                {formatarMoeda(atendimento.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Procedimentos */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">🦷 Procedimentos Adicionados</h2>
        
        {atendimento.itens.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Nenhum procedimento adicionado ainda</p>
            <p className="text-sm mt-2">
              Use o formulário ao lado para adicionar procedimentos
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Procedimento
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vendedor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Executor
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Valor
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {atendimento.itens.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {item.procedimento_nome}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
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
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-semibold">
                  Total:
                </td>
                <td className="px-4 py-3 text-right font-bold text-lg text-blue-600">
                  {formatarMoeda(atendimento.total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Aviso para finalizar */}
      {atendimento.itens.length > 0 && (
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-green-900">
                ✓ Avaliação pronta para ser finalizada
              </p>
              <p className="text-sm text-green-700">
                O paciente será encaminhado para pagamento
              </p>
            </div>
            <button
              onClick={handleFinalizarAvaliacao}
              disabled={finalizando}
              className="btn btn-primary"
            >
              {finalizando ? 'Finalizando...' : 'Finalizar Avaliação →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
