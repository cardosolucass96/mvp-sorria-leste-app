'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface ResumoComissao {
  usuario_id: number;
  usuario_nome: string;
  total_venda: number;
  total_execucao: number;
  total_geral: number;
  quantidade: number;
}

interface Comissao {
  id: number;
  atendimento_id: number;
  usuario_id: number;
  usuario_nome: string;
  tipo: string;
  percentual: number;
  valor_base: number;
  valor_comissao: number;
  procedimento_nome: string;
  cliente_nome: string;
  created_at: string;
}

interface ComissoesData {
  comissoes: Comissao[];
  totais: {
    venda: number;
    execucao: number;
    geral: number;
  };
}

export default function ComissoesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [resumo, setResumo] = useState<ResumoComissao[]>([]);
  const [detalhes, setDetalhes] = useState<ComissoesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'resumo' | 'detalhes'>('resumo');
  const [filtroUsuario, setFiltroUsuario] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');

  useEffect(() => {
    // Verificar permissão
    if (user && user.role !== 'admin') {
      router.push('/minhas-comissoes');
      return;
    }
    carregarDados();
  }, [user, viewMode, filtroUsuario, filtroDataInicio, filtroDataFim]);

  async function carregarDados() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (filtroUsuario) params.append('usuario_id', filtroUsuario);
      if (filtroDataInicio) params.append('data_inicio', filtroDataInicio);
      if (filtroDataFim) params.append('data_fim', filtroDataFim);

      if (viewMode === 'resumo') {
        params.append('resumo', 'true');
        const response = await fetch(`/api/comissoes?${params}`);
        const data = await response.json();
        setResumo(data);
      } else {
        const response = await fetch(`/api/comissoes?${params}`);
        const data = await response.json();
        setDetalhes(data);
      }
    } catch (error) {
      console.error('Erro ao carregar comissões:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatarMoeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarData(dataStr: string): string {
    const data = new Date(dataStr);
    return data.toLocaleDateString('pt-BR');
  }

  function limparFiltros() {
    setFiltroUsuario('');
    setFiltroDataInicio('');
    setFiltroDataFim('');
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">💰 Comissões</h1>
        
        {/* Toggle Resumo/Detalhes */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('resumo')}
            className={`px-4 py-2 rounded ${
              viewMode === 'resumo'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Resumo
          </button>
          <button
            onClick={() => setViewMode('detalhes')}
            className={`px-4 py-2 rounded ${
              viewMode === 'detalhes'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Detalhes
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h3 className="font-semibold mb-3">Filtros</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Data Início</label>
            <input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Data Fim</label>
            <input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={limparFiltros}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* View Resumo */}
      {viewMode === 'resumo' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4">Usuário</th>
                <th className="text-right p-4">Comissão Venda</th>
                <th className="text-right p-4">Comissão Execução</th>
                <th className="text-right p-4">Total</th>
                <th className="text-center p-4">Qtd. Procedimentos</th>
                <th className="text-center p-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {resumo.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-gray-500">
                    Nenhuma comissão encontrada
                  </td>
                </tr>
              ) : (
                resumo.map((r) => (
                  <tr key={r.usuario_id} className="border-t hover:bg-gray-50">
                    <td className="p-4 font-medium">{r.usuario_nome}</td>
                    <td className="p-4 text-right text-green-600">
                      {formatarMoeda(r.total_venda)}
                    </td>
                    <td className="p-4 text-right text-blue-600">
                      {formatarMoeda(r.total_execucao)}
                    </td>
                    <td className="p-4 text-right font-bold">
                      {formatarMoeda(r.total_geral)}
                    </td>
                    <td className="p-4 text-center">{r.quantidade}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => {
                          setFiltroUsuario(r.usuario_id.toString());
                          setViewMode('detalhes');
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {resumo.length > 0 && (
              <tfoot className="bg-gray-100">
                <tr className="font-bold">
                  <td className="p-4">TOTAL GERAL</td>
                  <td className="p-4 text-right text-green-600">
                    {formatarMoeda(resumo.reduce((sum, r) => sum + r.total_venda, 0))}
                  </td>
                  <td className="p-4 text-right text-blue-600">
                    {formatarMoeda(resumo.reduce((sum, r) => sum + r.total_execucao, 0))}
                  </td>
                  <td className="p-4 text-right">
                    {formatarMoeda(resumo.reduce((sum, r) => sum + r.total_geral, 0))}
                  </td>
                  <td className="p-4 text-center">
                    {resumo.reduce((sum, r) => sum + r.quantidade, 0)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* View Detalhes */}
      {viewMode === 'detalhes' && detalhes && (
        <>
          {/* Cards de Totais */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <p className="text-sm text-green-600">Comissão de Venda</p>
              <p className="text-2xl font-bold text-green-800">
                {formatarMoeda(detalhes.totais.venda)}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <p className="text-sm text-blue-600">Comissão de Execução</p>
              <p className="text-2xl font-bold text-blue-800">
                {formatarMoeda(detalhes.totais.execucao)}
              </p>
            </div>
            <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
              <p className="text-sm text-purple-600">Total Geral</p>
              <p className="text-2xl font-bold text-purple-800">
                {formatarMoeda(detalhes.totais.geral)}
              </p>
            </div>
          </div>

          {/* Tabela de Detalhes */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4">Data</th>
                  <th className="text-left p-4">Usuário</th>
                  <th className="text-left p-4">Cliente</th>
                  <th className="text-left p-4">Procedimento</th>
                  <th className="text-center p-4">Tipo</th>
                  <th className="text-right p-4">Valor Base</th>
                  <th className="text-right p-4">%</th>
                  <th className="text-right p-4">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {detalhes.comissoes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center p-8 text-gray-500">
                      Nenhuma comissão encontrada
                    </td>
                  </tr>
                ) : (
                  detalhes.comissoes.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-gray-50">
                      <td className="p-4">{formatarData(c.created_at)}</td>
                      <td className="p-4">{c.usuario_nome}</td>
                      <td className="p-4">{c.cliente_nome}</td>
                      <td className="p-4">{c.procedimento_nome}</td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded ${
                            c.tipo === 'venda'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {c.tipo === 'venda' ? 'Venda' : 'Execução'}
                        </span>
                      </td>
                      <td className="p-4 text-right">{formatarMoeda(c.valor_base)}</td>
                      <td className="p-4 text-right">{c.percentual}%</td>
                      <td className="p-4 text-right font-semibold">
                        {formatarMoeda(c.valor_comissao)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
