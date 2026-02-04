'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
  por_dente: number;
  ativo: number;
  created_at: string;
}

interface FormData {
  nome: string;
  valor: string;
  comissao_venda: string;
  comissao_execucao: string;
  por_dente: boolean;
}

const initialFormData: FormData = {
  nome: '',
  valor: '',
  comissao_venda: '',
  comissao_execucao: '',
  por_dente: false,
};

export default function ProcedimentosPage() {
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  
  // Modal/Formulário
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const carregarProcedimentos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (busca) params.append('busca', busca);
      if (mostrarInativos) params.append('inativos', 'true');
      
      const res = await fetch(`/api/procedimentos?${params}`);
      const data = await res.json();
      setProcedimentos(data);
    } catch (error) {
      console.error('Erro ao carregar procedimentos:', error);
    } finally {
      setLoading(false);
    }
  }, [busca, mostrarInativos]);

  useEffect(() => {
    carregarProcedimentos();
  }, [carregarProcedimentos]);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    carregarProcedimentos();
  };

  const abrirModalNovo = () => {
    setFormData(initialFormData);
    setEditingId(null);
    setError('');
    setIsModalOpen(true);
  };

  const abrirModalEditar = (proc: Procedimento) => {
    setFormData({
      nome: proc.nome,
      valor: proc.valor.toString(),
      comissao_venda: proc.comissao_venda.toString(),
      comissao_execucao: proc.comissao_execucao.toString(),
      por_dente: proc.por_dente === 1,
    });
    setEditingId(proc.id);
    setError('');
    setIsModalOpen(true);
  };

  const fecharModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(initialFormData);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        nome: formData.nome,
        valor: parseFloat(formData.valor) || 0,
        comissao_venda: parseFloat(formData.comissao_venda) || 0,
        comissao_execucao: parseFloat(formData.comissao_execucao) || 0,
        por_dente: formData.por_dente,
      };

      const url = editingId 
        ? `/api/procedimentos/${editingId}`
        : '/api/procedimentos';
      
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao salvar');
      }

      fecharModal();
      carregarProcedimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDesativar = async (id: number) => {
    if (!confirm('Deseja desativar este procedimento?')) return;

    try {
      const res = await fetch(`/api/procedimentos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        carregarProcedimentos();
      }
    } catch (error) {
      console.error('Erro ao desativar:', error);
    }
  };

  const handleReativar = async (id: number) => {
    try {
      const res = await fetch(`/api/procedimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: true }),
      });
      if (res.ok) {
        carregarProcedimentos();
      }
    } catch (error) {
      console.error('Erro ao reativar:', error);
    }
  };

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📑 Procedimentos</h1>
          <p className="text-gray-600">Catálogo de procedimentos odontológicos</p>
        </div>
        <button 
          onClick={abrirModalNovo}
          className="btn btn-primary"
        >
          + Novo Procedimento
        </button>
      </div>

      {/* Busca e Filtros */}
      <div className="card">
        <form onSubmit={handleBuscar} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar
            </label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do procedimento..."
              className="input"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="mostrarInativos"
              checked={mostrarInativos}
              onChange={(e) => setMostrarInativos(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="mostrarInativos" className="text-sm text-gray-700">
              Mostrar inativos
            </label>
          </div>
          
          <button type="submit" className="btn btn-secondary">
            Buscar
          </button>
        </form>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Procedimento
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Valor
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Por Dente
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Comissão Venda
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Comissão Execução
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {procedimentos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  Nenhum procedimento encontrado
                </td>
              </tr>
            ) : (
              procedimentos.map((proc) => (
                <tr key={proc.id} className={!proc.ativo ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4">
                    <div className={`font-medium ${!proc.ativo ? 'text-gray-400' : 'text-gray-900'}`}>
                      {proc.nome}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-semibold ${proc.valor === 0 ? 'text-green-600' : 'text-gray-900'}`}>
                      {proc.valor === 0 ? 'Grátis' : formatarMoeda(proc.valor)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {proc.por_dente ? (
                      <span className="badge badge-warning">🦷 Sim</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-600">
                    {proc.comissao_venda}%
                  </td>
                  <td className="px-6 py-4 text-right text-gray-600">
                    {proc.comissao_execucao}%
                  </td>
                  <td className="px-6 py-4 text-center">
                    {proc.ativo ? (
                      <span className="badge badge-success">Ativo</span>
                    ) : (
                      <span className="badge badge-secondary">Inativo</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => abrirModalEditar(proc)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Editar
                    </button>
                    {proc.ativo ? (
                      <button
                        onClick={() => handleDesativar(proc.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Desativar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReativar(proc.id)}
                        className="text-green-600 hover:text-green-800 text-sm"
                      >
                        Reativar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Resumo */}
      <div className="text-sm text-gray-500">
        Total: {procedimentos.length} procedimento(s)
        {mostrarInativos && ` (${procedimentos.filter(p => !p.ativo).length} inativo(s))`}
      </div>

      {/* Modal de Criar/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingId ? 'Editar Procedimento' : 'Novo Procedimento'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({...formData, nome: e.target.value})}
                  className="input"
                  required
                  placeholder="Ex: Limpeza dental"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.valor}
                  onChange={(e) => setFormData({...formData, valor: e.target.value})}
                  className="input"
                  required
                  placeholder="0,00"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Comissão Venda (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.comissao_venda}
                    onChange={(e) => setFormData({...formData, comissao_venda: e.target.value})}
                    className="input"
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Comissão Execução (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.comissao_execucao}
                    onChange={(e) => setFormData({...formData, comissao_execucao: e.target.value})}
                    className="input"
                    placeholder="0"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <input
                  type="checkbox"
                  id="por_dente"
                  checked={formData.por_dente}
                  onChange={(e) => setFormData({...formData, por_dente: e.target.checked})}
                  className="w-5 h-5 rounded text-orange-600 focus:ring-orange-500"
                />
                <label htmlFor="por_dente" className="text-sm text-gray-700 cursor-pointer">
                  <span className="font-medium">🦷 Cobrar por dente</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Se marcado, o avaliador poderá selecionar múltiplos dentes e o valor será multiplicado pela quantidade
                  </p>
                </label>
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={fecharModal}
                  className="btn btn-secondary"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
