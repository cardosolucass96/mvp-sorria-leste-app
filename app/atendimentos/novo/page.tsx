'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

export default function NovoAtendimentoPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [avaliadores, setAvaliadores] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [clienteId, setClienteId] = useState('');
  const [avaliadorId, setAvaliadorId] = useState('');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      // Carrega clientes
      const resClientes = await fetch('/api/clientes');
      const clientesData = await resClientes.json();
      setClientes(clientesData);
      
      // Carrega avaliadores
      const resUsuarios = await fetch('/api/usuarios');
      const usuariosData = await resUsuarios.json();
      setAvaliadores(
        usuariosData.filter((u: Usuario) => 
          (u.role === 'avaliador' || u.role === 'admin')
        )
      );
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/atendimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: parseInt(clienteId),
          avaliador_id: avaliadorId ? parseInt(avaliadorId) : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao criar atendimento');
      }

      const atendimento = await res.json();
      router.push(`/atendimentos/${atendimento.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
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

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seleção de Cliente */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Selecione o Cliente</h2>
          
          {/* Busca */}
          <div className="mb-4">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF ou telefone..."
              className="input"
            />
          </div>
          
          {/* Lista de clientes */}
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
          
          {/* Link para cadastrar novo cliente */}
          <div className="mt-4 pt-4 border-t">
            <Link 
              href="/clientes/novo" 
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              + Cadastrar novo cliente
            </Link>
          </div>
        </div>

        {/* Seleção de Avaliador (opcional) */}
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

        {/* Botões */}
        <div className="flex justify-end gap-3">
          <Link href="/atendimentos" className="btn btn-secondary">
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={!clienteId || saving}
            className="btn btn-primary disabled:opacity-50"
          >
            {saving ? 'Criando...' : 'Criar Atendimento'}
          </button>
        </div>
      </form>
    </div>
  );
}
