'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Atendimento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  status: string;
  created_at: string;
}

interface AtendimentoComTotais extends Atendimento {
  total: number;
  total_pago: number;
}

interface Parcela {
  id: number;
  atendimento_id: number;
  numero: number;
  valor: number;
  data_vencimento: string;
  pago: number;
  cliente_nome: string;
}

export default function PagamentosPage() {
  const [atendimentos, setAtendimentos] = useState<AtendimentoComTotais[]>([]);
  const [parcelasVencidas, setParcelasVencidas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'aguardando' | 'parcelas'>('aguardando');

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      // Carrega atendimentos
      const resAtend = await fetch('/api/atendimentos');
      const atendData = await resAtend.json();
      
      // Filtra apenas aguardando_pagamento
      const aguardando = atendData.filter(
        (a: Atendimento) => a.status === 'aguardando_pagamento'
      );
      
      // Para cada atendimento, busca os detalhes com totais
      const atendimentosComTotais: AtendimentoComTotais[] = await Promise.all(
        aguardando.map(async (a: Atendimento) => {
          const resDetalhe = await fetch(`/api/atendimentos/${a.id}`);
          const detalhe = await resDetalhe.json();
          return {
            ...a,
            total: detalhe.total || 0,
            total_pago: detalhe.total_pago || 0,
          };
        })
      );
      
      setAtendimentos(atendimentosComTotais);
      
      // Carrega parcelas vencidas
      const resParcelas = await fetch('/api/parcelas/vencidas');
      if (resParcelas.ok) {
        const parcData = await resParcelas.json();
        setParcelasVencidas(parcData);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">💰 Pagamentos</h1>
        <p className="text-gray-600">
          Gerencie pagamentos e parcelas pendentes
        </p>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-yellow-50 border border-yellow-200">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⏳</span>
            <div>
              <p className="text-sm text-yellow-700">Aguardando Pagamento</p>
              <p className="text-2xl font-bold text-yellow-800">{atendimentos.length}</p>
            </div>
          </div>
        </div>
        
        <div className="card bg-red-50 border border-red-200">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <p className="text-sm text-red-700">Parcelas Vencidas</p>
              <p className="text-2xl font-bold text-red-800">{parcelasVencidas.length}</p>
            </div>
          </div>
        </div>
        
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center gap-3">
            <span className="text-3xl">💵</span>
            <div>
              <p className="text-sm text-green-700">Total a Receber</p>
              <p className="text-2xl font-bold text-green-800">
                {formatarMoeda(
                  atendimentos.reduce((acc, a) => acc + (a.total - a.total_pago), 0)
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setFiltro('aguardando')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            filtro === 'aguardando'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Aguardando Pagamento ({atendimentos.length})
        </button>
        <button
          onClick={() => setFiltro('parcelas')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            filtro === 'parcelas'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Parcelas Vencidas ({parcelasVencidas.length})
        </button>
      </div>

      {/* Conteúdo */}
      {filtro === 'aguardando' && (
        <div className="card">
          {atendimentos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">🎉 Nenhum atendimento aguardando pagamento!</p>
              <p className="text-sm mt-2">Todos os clientes estão em dia.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Atendimento
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Pago
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Pendente
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {atendimentos.map((atend) => {
                  const pendente = atend.total - atend.total_pago;
                  return (
                    <tr key={atend.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {atend.cliente_nome}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        #{atend.id} - {formatarData(atend.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatarMoeda(atend.total)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {formatarMoeda(atend.total_pago)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">
                        {formatarMoeda(pendente)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/atendimentos/${atend.id}/pagamento`}
                          className="btn btn-primary btn-sm"
                        >
                          💳 Receber
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {filtro === 'parcelas' && (
        <div className="card">
          {parcelasVencidas.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">🎉 Nenhuma parcela vencida!</p>
              <p className="text-sm mt-2">Todos os clientes estão em dia com as parcelas.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Atendimento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Parcela
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Vencimento
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
                {parcelasVencidas.map((parc) => (
                  <tr key={parc.id} className="bg-red-50 hover:bg-red-100">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {parc.cliente_nome}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      #{parc.atendimento_id}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {parc.numero}ª Parcela
                    </td>
                    <td className="px-4 py-3 text-red-600 font-medium">
                      {formatarData(parc.data_vencimento)} ⚠️
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      {formatarMoeda(parc.valor)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/atendimentos/${parc.atendimento_id}/pagamento`}
                        className="btn btn-primary btn-sm"
                      >
                        💳 Receber
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
