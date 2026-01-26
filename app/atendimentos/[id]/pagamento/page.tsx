'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ItemAtendimento {
  id: number;
  procedimento_nome: string;
  valor: number;
  status: string;
}

interface Pagamento {
  id: number;
  valor: number;
  metodo: string;
  parcelas: number;
  observacoes: string | null;
  recebido_por_nome?: string;
  created_at: string;
}

interface Parcela {
  id: number;
  numero: number;
  valor: number;
  data_vencimento: string;
  pago: number;
  observacoes: string | null;
}

interface Atendimento {
  id: number;
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  status: string;
  itens: ItemAtendimento[];
  total: number;
  total_pago: number;
}

const METODOS_PAGAMENTO = [
  { value: 'dinheiro', label: '💵 Dinheiro' },
  { value: 'pix', label: '📱 PIX' },
  { value: 'cartao_debito', label: '💳 Cartão Débito' },
  { value: 'cartao_credito', label: '💳 Cartão Crédito' },
];

export default function PagamentoPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = use(params);
  const router = useRouter();
  
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form de pagamento
  const [valorPagamento, setValorPagamento] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState('pix');
  const [observacoesPagamento, setObservacoesPagamento] = useState('');
  const [registrando, setRegistrando] = useState(false);
  
  // Form de parcela
  const [valorParcela, setValorParcela] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacoesParcela, setObservacoesParcela] = useState('');
  const [adicionandoParcela, setAdicionandoParcela] = useState(false);
  
  // Avançar status
  const [avancando, setAvancando] = useState(false);

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
      
      // Carrega pagamentos
      const resPag = await fetch(`/api/atendimentos/${id}/pagamentos`);
      const pagData = await resPag.json();
      setPagamentos(pagData);
      
      // Carrega parcelas
      const resParc = await fetch(`/api/atendimentos/${id}/parcelas`);
      const parcData = await resParc.json();
      setParcelas(parcData);
    } catch (err) {
      setError('Erro ao carregar dados');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrarPagamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valorPagamento) return;
    
    setRegistrando(true);
    setError('');
    
    try {
      const res = await fetch(`/api/atendimentos/${id}/pagamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: parseFloat(valorPagamento),
          metodo: metodoPagamento,
          observacoes: observacoesPagamento || null,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao registrar');
      }
      
      // Limpa form e recarrega
      setValorPagamento('');
      setObservacoesPagamento('');
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar');
    } finally {
      setRegistrando(false);
    }
  };

  const handleAdicionarParcela = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valorParcela || !dataVencimento) return;
    
    setAdicionandoParcela(true);
    setError('');
    
    try {
      const res = await fetch(`/api/atendimentos/${id}/parcelas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: parseFloat(valorParcela),
          data_vencimento: dataVencimento,
          observacoes: observacoesParcela || null,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao adicionar');
      }
      
      // Limpa form e recarrega
      setValorParcela('');
      setDataVencimento('');
      setObservacoesParcela('');
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar');
    } finally {
      setAdicionandoParcela(false);
    }
  };

  const handleRemoverParcela = async (parcelaId: number) => {
    if (!confirm('Deseja remover esta parcela?')) return;
    
    try {
      const res = await fetch(
        `/api/atendimentos/${id}/parcelas?parcela_id=${parcelaId}`,
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

  const handleAvancarStatus = async () => {
    if (!atendimento) return;
    
    setAvancando(true);
    setError('');
    
    try {
      const res = await fetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'em_execucao' }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao avançar');
      }
      
      router.push(`/atendimentos/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao avançar');
    } finally {
      setAvancando(false);
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

  const formatarDataHora = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
        <Link href="/atendimentos" className="text-blue-600">
          ← Voltar para lista
        </Link>
      </div>
    );
  }

  const totalPago = pagamentos.reduce((acc, p) => acc + p.valor, 0);
  const totalParcelas = parcelas.reduce((acc, p) => acc + p.valor, 0);
  const parcelasPagas = parcelas.filter(p => p.pago).reduce((acc, p) => acc + p.valor, 0);
  const parcelasPendentes = parcelas.filter(p => !p.pago);
  const saldoDevedor = atendimento.total - totalPago;
  const temEntrada = totalPago > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href={`/atendimentos/${id}`} 
            className="text-gray-500 hover:text-gray-700"
          >
            ← Voltar
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              💳 Pagamento
            </h1>
            <p className="text-gray-600">
              {atendimento.cliente_nome} - Atendimento #{atendimento.id}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Dados do Cliente */}
      <div className="card bg-blue-50 border border-blue-200">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm text-blue-600">Cliente</p>
            <p className="font-semibold text-blue-900">{atendimento.cliente_nome}</p>
          </div>
          {atendimento.cliente_cpf && (
            <div>
              <p className="text-sm text-blue-600">CPF</p>
              <p className="font-medium text-blue-800">{atendimento.cliente_cpf}</p>
            </div>
          )}
          {atendimento.cliente_telefone && (
            <div>
              <p className="text-sm text-blue-600">Telefone</p>
              <p className="font-medium text-blue-800">{atendimento.cliente_telefone}</p>
            </div>
          )}
        </div>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resumo Financeiro */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">💰 Resumo Financeiro</h2>
          
          <div className="space-y-3">
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Total do Tratamento</span>
              <span className="font-bold text-lg">{formatarMoeda(atendimento.total)}</span>
            </div>
            
            <div className="flex justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-green-700">Pago</span>
              <span className="font-bold text-lg text-green-700">{formatarMoeda(totalPago)}</span>
            </div>
            
            <div className={`flex justify-between p-3 rounded-lg ${
              saldoDevedor > 0 ? 'bg-red-50' : 'bg-green-50'
            }`}>
              <span className={saldoDevedor > 0 ? 'text-red-700' : 'text-green-700'}>
                {saldoDevedor > 0 ? 'Saldo Devedor' : 'Quitado'}
              </span>
              <span className={`font-bold text-lg ${
                saldoDevedor > 0 ? 'text-red-700' : 'text-green-700'
              }`}>
                {formatarMoeda(saldoDevedor)}
              </span>
            </div>
            
            {parcelasPendentes.length > 0 && (
              <div className="flex justify-between p-3 bg-yellow-50 rounded-lg">
                <span className="text-yellow-700">
                  Parcelas Pendentes ({parcelasPendentes.length})
                </span>
                <span className="font-bold text-yellow-700">
                  {formatarMoeda(totalParcelas - parcelasPagas)}
                </span>
              </div>
            )}
          </div>
          
          {/* Botão Avançar */}
          {atendimento.status === 'aguardando_pagamento' && temEntrada && (
            <div className="mt-6 pt-4 border-t">
              <button
                onClick={handleAvancarStatus}
                disabled={avancando}
                className="btn btn-primary w-full"
              >
                {avancando ? 'Avançando...' : '✓ Liberar para Execução'}
              </button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Cliente pagou entrada. Parcelas serão cobradas depois.
              </p>
            </div>
          )}
          
          {atendimento.status === 'aguardando_pagamento' && !temEntrada && (
            <div className="mt-6 pt-4 border-t">
              <div className="p-3 bg-yellow-50 rounded-lg text-center">
                <p className="text-yellow-800 font-medium">⚠️ Entrada necessária</p>
                <p className="text-yellow-600 text-sm">
                  Registre pelo menos um pagamento para liberar
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Registrar Pagamento */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">➕ Registrar Pagamento</h2>
          
          <form onSubmit={handleRegistrarPagamento} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={valorPagamento}
                onChange={(e) => setValorPagamento(e.target.value)}
                placeholder="0,00"
                className="input"
                required
              />
              {saldoDevedor > 0 && (
                <button
                  type="button"
                  onClick={() => setValorPagamento(saldoDevedor.toString())}
                  className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                >
                  Preencher saldo devedor: {formatarMoeda(saldoDevedor)}
                </button>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Método *
              </label>
              <select
                value={metodoPagamento}
                onChange={(e) => setMetodoPagamento(e.target.value)}
                className="input"
                required
              >
                {METODOS_PAGAMENTO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <input
                type="text"
                value={observacoesPagamento}
                onChange={(e) => setObservacoesPagamento(e.target.value)}
                placeholder="Ex: Entrada do tratamento"
                className="input"
              />
            </div>
            
            <button
              type="submit"
              disabled={!valorPagamento || registrando}
              className="btn btn-secondary w-full disabled:opacity-50"
            >
              {registrando ? 'Registrando...' : '💰 Registrar Pagamento'}
            </button>
          </form>
        </div>

        {/* Agendar Parcela */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">📅 Agendar Parcela</h2>
          
          <form onSubmit={handleAdicionarParcela} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={valorParcela}
                onChange={(e) => setValorParcela(e.target.value)}
                placeholder="0,00"
                className="input"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data de Vencimento *
              </label>
              <input
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="input"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <input
                type="text"
                value={observacoesParcela}
                onChange={(e) => setObservacoesParcela(e.target.value)}
                placeholder="Ex: Cartão, PIX, etc."
                className="input"
              />
            </div>
            
            <button
              type="submit"
              disabled={!valorParcela || !dataVencimento || adicionandoParcela}
              className="btn btn-secondary w-full disabled:opacity-50"
            >
              {adicionandoParcela ? 'Adicionando...' : '📅 Agendar Parcela'}
            </button>
          </form>
        </div>
      </div>

      {/* Procedimentos */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">🦷 Procedimentos</h2>
        
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Procedimento
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Valor
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {atendimento.itens.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {item.procedimento_nome}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatarMoeda(item.valor)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm ${
                    item.status === 'concluido' ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {item.status === 'pendente' ? 'Pendente' :
                     item.status === 'executando' ? 'Executando' :
                     item.status === 'concluido' ? 'Concluído' : item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td className="px-4 py-3 font-semibold">Total</td>
              <td className="px-4 py-3 text-right font-bold text-lg">
                {formatarMoeda(atendimento.total)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Histórico de Pagamentos */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">💳 Pagamentos Registrados</h2>
        
        {pagamentos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhum pagamento registrado
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Data/Hora
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Recebido por
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Método
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Valor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Observações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pagamentos.map((pag) => (
                <tr key={pag.id}>
                  <td className="px-4 py-3 text-gray-600">
                    {formatarDataHora(pag.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {pag.recebido_por_nome || 'N/A'}
                  </td>
                  <td className="px-4 py-3">
                    {METODOS_PAGAMENTO.find(m => m.value === pag.metodo)?.label || pag.metodo}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">
                    {formatarMoeda(pag.valor)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {pag.observacoes || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-green-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 font-semibold text-green-700">
                  Total Pago
                </td>
                <td className="px-4 py-3 text-right font-bold text-lg text-green-700">
                  {formatarMoeda(totalPago)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Parcelas Agendadas */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">📅 Parcelas Agendadas</h2>
        
        {parcelas.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhuma parcela agendada
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Parcela
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vencimento
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Valor
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Observações
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {parcelas.map((parc) => {
                const vencida = new Date(parc.data_vencimento) < new Date() && !parc.pago;
                return (
                  <tr key={parc.id} className={vencida ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 font-medium">
                      {parc.numero}ª Parcela
                    </td>
                    <td className={`px-4 py-3 ${vencida ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                      {formatarData(parc.data_vencimento)}
                      {vencida && ' ⚠️'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatarMoeda(parc.valor)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {parc.pago ? (
                        <span className="text-green-600 font-medium">✓ Pago</span>
                      ) : (
                        <span className={vencida ? 'text-red-600' : 'text-yellow-600'}>
                          {vencida ? 'Vencida' : 'Pendente'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {parc.observacoes || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!parc.pago && (
                        <button
                          onClick={() => handleRemoverParcela(parc.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-yellow-50">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-semibold text-yellow-700">
                  Total Parcelas Pendentes
                </td>
                <td className="px-4 py-3 text-right font-bold text-lg text-yellow-700">
                  {formatarMoeda(totalParcelas - parcelasPagas)}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
