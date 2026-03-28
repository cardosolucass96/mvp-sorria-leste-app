'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda, formatarData, formatarDataHora } from '@/lib/utils/formatters';
import { StatusBadge } from '@/components/domain';
import Alert from '@/components/ui/Alert';
import LoadingState from '@/components/ui/LoadingState';
import { ConfirmDialog, Input, Select, Modal } from '@/components/ui';
import usePageTitle from '@/lib/utils/usePageTitle';

interface ItemAtendimento {
  id: number;
  procedimento_nome: string;
  valor: number;
  valor_pago: number;
  status: string;
  group_id: string | null;
  dente_unico: string | null;
}

interface ItemPagamento {
  item_id: number;
  valor_aplicado: number;
}

interface Pagamento {
  id: number;
  valor: number;
  metodo: string;
  parcelas: number;
  observacoes: string | null;
  recebido_por_nome?: string;
  cancelado: number;
  motivo_cancelamento: string | null;
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
  cliente_id: number;
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  status: string;
  itens: ItemAtendimento[];
  total: number;
  total_pago: number;
}

interface MovimentacaoSaldo {
  id: number;
  tipo: string;
  valor: number;
  observacoes: string | null;
  created_at: string;
}

interface ClienteBusca {
  id: number;
  nome: string;
  cpf: string | null;
}

type DestinoSaldo = 'itens' | 'saldo';

const METODOS_PAGAMENTO = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Cartão Débito' },
  { value: 'cartao_credito', label: 'Cartão Crédito' },
];

export default function PagamentoPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  usePageTitle('Pagamento do Atendimento');
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
  const [itensSelecionados, setItensSelecionados] = useState<{ [key: number]: number }>({});
  const [registrando, setRegistrando] = useState(false);
  
  // Form de parcela
  const [valorParcela, setValorParcela] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacoesParcela, setObservacoesParcela] = useState('');
  const [adicionandoParcela, setAdicionandoParcela] = useState(false);
  
  // Avançar status
  const [avancando, setAvancando] = useState(false);

  // Cancelar pagamento
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');

  // Saldo do cliente
  const [saldoCliente, setSaldoCliente] = useState(0);
  const [destinoSaldo, setDestinoSaldo] = useState<DestinoSaldo>('itens');

  // Modal de estorno
  const [estornoModalOpen, setEstornoModalOpen] = useState(false);
  const [estornoValor, setEstornoValor] = useState('');
  const [estornoObs, setEstornoObs] = useState('');
  const [estornando, setEstornando] = useState(false);

  // Modal de transferência
  const [transferenciaModalOpen, setTransferenciaModalOpen] = useState(false);
  const [transferenciaValor, setTransferenciaValor] = useState('');
  const [transferenciaObs, setTransferenciaObs] = useState('');
  const [transferenciaDestinoId, setTransferenciaDestinoId] = useState<number | null>(null);
  const [transferenciaDestinoNome, setTransferenciaDestinoNome] = useState('');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clientesBusca, setClientesBusca] = useState<ClienteBusca[]>([]);
  const [buscandoClientes, setBuscandoClientes] = useState(false);
  const [transferindo, setTransferindo] = useState(false);

  // Extrato
  const [extratoAberto, setExtratoAberto] = useState(false);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoSaldo[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const openConfirm = (config: Omit<typeof confirmDialog, 'isOpen'>) => {
    setConfirmDialog({ ...config, isOpen: true });
  };

  useEffect(() => {
    carregarDados();
  }, [id]);

  const carregarSaldo = useCallback(async (clienteId: number) => {
    try {
      const res = await fetch(`/api/clientes/${clienteId}/saldo`);
      if (res.ok) {
        const data = await res.json();
        setSaldoCliente(data.saldo ?? 0);
        if (data.movimentacoes) {
          setMovimentacoes(data.movimentacoes);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar saldo:', err);
    }
  }, []);

  const carregarDados = async () => {
    try {
      // Carrega atendimento
      const resAtend = await fetch(`/api/atendimentos/${id}`);
      if (!resAtend.ok) throw new Error('Atendimento não encontrado');
      const atendData = await resAtend.json();
      setAtendimento(atendData);

      // Carrega saldo do cliente
      if (atendData.cliente_id) {
        carregarSaldo(atendData.cliente_id);
      }

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
    if (!valorPagamento || !atendimento) return;

    const valorNum = parseFloat(valorPagamento);

    // Modo "Adicionar ao saldo"
    if (destinoSaldo === 'saldo') {
      setRegistrando(true);
      setError('');
      try {
        // 1. Cria pagamento normalmente (para histórico)
        const resPag = await fetch(`/api/atendimentos/${id}/pagamentos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valor: valorNum,
            metodo: metodoPagamento,
            observacoes: observacoesPagamento ? `[Saldo] ${observacoesPagamento}` : '[Saldo] Crédito ao saldo do cliente',
            itens: [],
          }),
        });
        if (!resPag.ok) {
          const data = await resPag.json();
          throw new Error(data.error || 'Erro ao registrar pagamento');
        }
        const pagamento = await resPag.json();

        // 2. Credita ao saldo referenciando o pagamento
        const resCred = await fetch(`/api/clientes/${atendimento.cliente_id}/saldo/creditar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valor: valorNum,
            pagamento_id: pagamento.id,
            observacoes: observacoesPagamento || null,
          }),
        });
        if (!resCred.ok) {
          const data = await resCred.json();
          throw new Error(data.error || 'Erro ao creditar saldo');
        }

        setValorPagamento('');
        setObservacoesPagamento('');
        setDestinoSaldo('itens');
        await carregarDados();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao registrar');
      } finally {
        setRegistrando(false);
      }
      return;
    }

    // Modo normal — distribuir diretamente aos itens
    const itens = Object.entries(itensSelecionados)
      .filter(([_, valor]) => valor > 0)
      .map(([item_id, valor_aplicado]) => ({
        item_id: parseInt(item_id),
        valor_aplicado
      }));

    if (itens.length === 0) {
      setError('Selecione pelo menos um procedimento para aplicar o pagamento');
      return;
    }

    const totalAplicado = itens.reduce((sum, item) => sum + item.valor_aplicado, 0);
    if (Math.abs(totalAplicado - valorNum) > 0.01) {
      setError(`Total aplicado (${totalAplicado.toFixed(2)}) deve ser igual ao valor do pagamento (${valorNum.toFixed(2)})`);
      return;
    }

    setRegistrando(true);
    setError('');

    try {
      const res = await fetch(`/api/atendimentos/${id}/pagamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: valorNum,
          metodo: metodoPagamento,
          observacoes: observacoesPagamento || null,
          itens
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao registrar');
      }

      setValorPagamento('');
      setObservacoesPagamento('');
      setItensSelecionados({});
      await carregarDados();
      // Verifica se há procedimentos pagos para liberar execução
      const resAtend = await fetch(`/api/atendimentos/${id}`);
      const dadosAtend = await resAtend.json();
      const itensPagosAtend = dadosAtend.itens?.filter(
        (item: { valor: number; valor_pago: number }) => item.valor_pago >= item.valor
      ) ?? [];
      const algumPago = itensPagosAtend.length > 0;
      const todosPagos = dadosAtend.itens?.length > 0 &&
        itensPagosAtend.length === dadosAtend.itens.length;
      if (algumPago && dadosAtend.status === 'aguardando_pagamento') {
        openConfirm({
          title: todosPagos ? 'Todos os procedimentos pagos' : 'Procedimentos prontos para execução',
          message: todosPagos
            ? 'Todos os procedimentos estão quitados. Deseja avançar o atendimento para execução agora?'
            : `${itensPagosAtend.length} procedimento(s) pago(s) e pronto(s) para execução. Os demais permanecem pendentes de pagamento. Deseja avançar?`,
          confirmLabel: 'Avançar para Execução',
          type: 'info',
          onConfirm: async () => {
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            await handleAvancarStatus();
          },
        });
      }
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

  const handleRemoverParcela = (parcelaId: number) => {
    openConfirm({
      title: 'Remover Parcela',
      message: 'Deseja remover esta parcela?',
      confirmLabel: 'Remover',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
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
      },
    });
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

  const handleCancelarPagamento = async (pagamentoId: number) => {
    if (!motivoCancelamento.trim()) return;
    try {
      const res = await fetch(`/api/atendimentos/${id}/pagamentos/${pagamentoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoCancelamento }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao cancelar');
      }
      setCancelandoId(null);
      setMotivoCancelamento('');
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar');
    }
  };

  // Usar saldo para pagar item
  const handleUsarSaldo = async (item: ItemAtendimento) => {
    if (!atendimento) return;
    const valorRestante = item.valor - item.valor_pago;

    openConfirm({
      title: 'Usar saldo',
      message: `Usar ${formatarMoeda(valorRestante)} do saldo para pagar "${item.dente_unico ? `${item.procedimento_nome} • Dente ${item.dente_unico}` : item.procedimento_nome}"?`,
      confirmLabel: 'Usar saldo',
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setError('');
        try {
          const res = await fetch(`/api/clientes/${atendimento.cliente_id}/saldo/debitar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              item_atendimento_id: item.id,
              atendimento_id: atendimento.id,
            }),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erro ao debitar saldo');
          }
          await carregarDados();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erro ao usar saldo');
        }
      },
    });
  };

  // Estorno de saldo
  const handleEstornar = async () => {
    if (!atendimento || !estornoValor || !estornoObs.trim()) return;
    setEstornando(true);
    setError('');
    try {
      const res = await fetch(`/api/clientes/${atendimento.cliente_id}/saldo/estornar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: parseFloat(estornoValor),
          observacoes: estornoObs,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao estornar');
      }
      setEstornoModalOpen(false);
      setEstornoValor('');
      setEstornoObs('');
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao estornar');
    } finally {
      setEstornando(false);
    }
  };

  // Transferência de saldo
  const handleBuscarClientes = async (termo: string) => {
    setBuscaCliente(termo);
    if (termo.length < 2) {
      setClientesBusca([]);
      return;
    }
    setBuscandoClientes(true);
    try {
      const res = await fetch(`/api/clientes?busca=${encodeURIComponent(termo)}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        const lista = (data.clientes || data).filter(
          (c: ClienteBusca) => c.id !== atendimento?.cliente_id
        );
        setClientesBusca(lista);
      }
    } catch {
      // silently fail
    } finally {
      setBuscandoClientes(false);
    }
  };

  const handleTransferir = async () => {
    if (!atendimento || !transferenciaDestinoId || !transferenciaValor) return;
    setTransferindo(true);
    setError('');
    try {
      const res = await fetch(`/api/clientes/${atendimento.cliente_id}/saldo/transferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_destino_id: transferenciaDestinoId,
          valor: parseFloat(transferenciaValor),
          observacoes: transferenciaObs || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao transferir');
      }
      setTransferenciaModalOpen(false);
      setTransferenciaValor('');
      setTransferenciaObs('');
      setTransferenciaDestinoId(null);
      setTransferenciaDestinoNome('');
      setBuscaCliente('');
      setClientesBusca([]);
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao transferir');
    } finally {
      setTransferindo(false);
    }
  };

  // Carregar extrato (movimentacoes already loaded from GET /saldo, just refresh)
  const handleToggleExtrato = async () => {
    if (!extratoAberto && atendimento) {
      try {
        const res = await fetch(`/api/clientes/${atendimento.cliente_id}/saldo`);
        if (res.ok) {
          const data = await res.json();
          setSaldoCliente(data.saldo ?? 0);
          setMovimentacoes(data.movimentacoes ?? []);
        }
      } catch {
        // silently fail
      }
    }
    setExtratoAberto(!extratoAberto);
  };

  // Funções auxiliares para itens selecionados
  const handleItemChange = (itemId: number, valor: string) => {
    const valorNum = parseFloat(valor) || 0;
    setItensSelecionados(prev => ({
      ...prev,
      [itemId]: valorNum
    }));
  };
  
  const distribuirValorProporcional = (valorOverride?: number) => {
    if (!atendimento) return;
    const valor = valorOverride ?? (valorPagamento ? parseFloat(valorPagamento) : 0);
    if (!valor) return;

    const itensPendentes = atendimento.itens.filter(item => item.valor - item.valor_pago > 0);
    if (itensPendentes.length === 0) return;

    const novosItens: { [key: number]: number } = {};
    let restante = valor;

    for (const item of itensPendentes) {
      if (restante <= 0) break;
      const devido = item.valor - item.valor_pago;
      const aplicado = Math.min(restante, devido);
      novosItens[item.id] = Math.round(aplicado * 100) / 100;
      restante -= aplicado;
    }

    setItensSelecionados(novosItens);
  };
  
  const totalAplicado = Object.values(itensSelecionados).reduce((sum, val) => sum + val, 0);

  if (loading) {
    return <LoadingState text="Carregando pagamento..." />;
  }

  if (!atendimento) {
    return (
      <div className="text-center py-12">
        <p className="text-muted mb-4">Atendimento não encontrado</p>
        <Link href="/atendimentos" className="text-info-600">
          ← Voltar para lista
        </Link>
      </div>
    );
  }

  const totalPago = pagamentos.filter(p => !p.cancelado).reduce((acc, p) => acc + p.valor, 0);
  const totalParcelas = parcelas.reduce((acc, p) => acc + p.valor, 0);
  const parcelasPagas = parcelas.filter(p => p.pago).reduce((acc, p) => acc + p.valor, 0);
  const parcelasPendentes = parcelas.filter(p => !p.pago);
  const saldoDevedor = atendimento.total - atendimento.total_pago;
  
  // Verifica se tem pelo menos 1 procedimento totalmente pago
  const itensPagos = atendimento.itens.filter(item => item.status === 'pago' || item.valor_pago >= item.valor);
  const temProcedimentoPago = itensPagos.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href={`/atendimentos/${id}`} 
            className="text-muted hover:text-neutral-700"
          >
            ← Voltar
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              💳 Pagamento
            </h1>
            <p className="text-neutral-600">
              {atendimento.cliente_nome} - Atendimento #{atendimento.id}
            </p>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Dados do Cliente */}
      <div className="card bg-info-50 border border-info-200">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm text-info-600">Cliente</p>
            <p className="font-semibold text-info-900">{atendimento.cliente_nome}</p>
          </div>
          {atendimento.cliente_cpf && (
            <div>
              <p className="text-sm text-info-600">CPF</p>
              <p className="font-medium text-info-800">{atendimento.cliente_cpf}</p>
            </div>
          )}
          {atendimento.cliente_telefone && (
            <div>
              <p className="text-sm text-info-600">Telefone</p>
              <p className="font-medium text-info-800">{atendimento.cliente_telefone}</p>
            </div>
          )}
        </div>
      </div>

      {/* Card de Saldo do Cliente */}
      <div className="card bg-primary-50 border border-primary-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-primary-600">Saldo disponível de {atendimento.cliente_nome}</p>
            <p className="text-2xl font-bold text-primary-900 mt-1">{formatarMoeda(saldoCliente)}</p>
          </div>
          <div className="flex gap-2">
            {saldoCliente > 0 && (
              <>
                <button
                  onClick={() => { setEstornoModalOpen(true); setEstornoValor(''); setEstornoObs(''); }}
                  className="btn btn-secondary text-sm"
                >
                  Estornar saldo
                </button>
                <button
                  onClick={() => {
                    setTransferenciaModalOpen(true);
                    setTransferenciaValor('');
                    setTransferenciaObs('');
                    setTransferenciaDestinoId(null);
                    setTransferenciaDestinoNome('');
                    setBuscaCliente('');
                    setClientesBusca([]);
                  }}
                  className="btn btn-secondary text-sm"
                >
                  Transferir
                </button>
              </>
            )}
            <button
              onClick={handleToggleExtrato}
              className="btn btn-secondary text-sm"
            >
              {extratoAberto ? 'Fechar extrato' : 'Ver extrato'}
            </button>
          </div>
        </div>

        {/* Extrato de movimentações */}
        {extratoAberto && (
          <div className="mt-4 border-t border-primary-200 pt-4">
            <h3 className="text-sm font-semibold text-primary-800 mb-2">Últimas movimentações</h3>
            {movimentacoes.length === 0 ? (
              <p className="text-sm text-primary-600">Nenhuma movimentação encontrada.</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {movimentacoes.map((mov) => {
                  const isPositivo = ['credito', 'transferencia_entrada'].includes(mov.tipo);
                  const labels: Record<string, string> = {
                    credito: 'Crédito',
                    debito: 'Débito',
                    estorno: 'Estorno',
                    transferencia_saida: 'Transf. enviada',
                    transferencia_entrada: 'Transf. recebida',
                  };
                  return (
                    <div key={mov.id} className="flex items-center justify-between text-sm py-1">
                      <div className="flex-1 min-w-0">
                        <span className={`font-medium ${isPositivo ? 'text-success-700' : 'text-error-700'}`}>
                          {labels[mov.tipo] || mov.tipo}
                        </span>
                        {mov.observacoes && (
                          <span className="text-primary-600 ml-2 truncate">{mov.observacoes}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`font-medium ${isPositivo ? 'text-success-700' : 'text-error-700'}`}>
                          {isPositivo ? '+' : '-'}{formatarMoeda(mov.valor)}
                        </span>
                        <span className="text-xs text-primary-500">{formatarDataHora(mov.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registrar Pagamento */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-1">Registrar Pagamento</h2>
          {saldoDevedor > 0 && (
            <p className="text-sm text-muted mb-4">
              Saldo restante: <span className="font-semibold text-error-600">{formatarMoeda(saldoDevedor)}</span>
            </p>
          )}

          <form onSubmit={handleRegistrarPagamento} className="space-y-4">

            {/* Valor + Pagar tudo */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Valor recebido (R$) *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorPagamento}
                  onChange={(e) => setValorPagamento(e.target.value)}
                  onBlur={(e) => distribuirValorProporcional(parseFloat(e.target.value) || undefined)}
                  placeholder="0,00"
                  className="input flex-1"
                  required
                />
                {saldoDevedor > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setValorPagamento(saldoDevedor.toString());
                      distribuirValorProporcional(saldoDevedor);
                    }}
                    className="btn btn-secondary whitespace-nowrap text-sm"
                  >
                    Pagar tudo
                  </button>
                )}
              </div>
            </div>

            {/* Método */}
            <Select
              label="Forma de pagamento"
              name="metodoPagamento"
              options={METODOS_PAGAMENTO}
              value={metodoPagamento}
              onChange={setMetodoPagamento}
              required
            />

            {/* Toggle destino: itens ou saldo */}
            {valorPagamento && parseFloat(valorPagamento) > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-surface-secondary">
                  <span className="text-sm font-medium text-neutral-700">Destino do pagamento</span>
                </div>
                <div className="px-3 py-2 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="destinoSaldo"
                      checked={destinoSaldo === 'itens'}
                      onChange={() => setDestinoSaldo('itens')}
                      className="accent-primary-600"
                    />
                    <span className="text-sm">Distribuir diretamente aos itens selecionados</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="destinoSaldo"
                      checked={destinoSaldo === 'saldo'}
                      onChange={() => setDestinoSaldo('saldo')}
                      className="accent-primary-600"
                    />
                    <span className="text-sm">Adicionar ao saldo do cliente</span>
                  </label>
                </div>
              </div>
            )}

            {/* Distribuição — só aparece quando há valor e destino = itens */}
            {valorPagamento && parseFloat(valorPagamento) > 0 && destinoSaldo === 'itens' && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-surface-secondary">
                  <span className="text-sm font-medium text-neutral-700">Como distribuir nos procedimentos</span>
                </div>
                <div className="divide-y">
                  {atendimento.itens.map((item) => {
                    const devido = item.valor - item.valor_pago;
                    if (devido <= 0) return null;
                    const alocado = itensSelecionados[item.id] || 0;
                    const quitado = alocado >= devido;
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.dente_unico
                              ? `${item.procedimento_nome} • Dente ${item.dente_unico}`
                              : item.procedimento_nome}
                          </p>
                          <p className="text-xs text-muted">
                            Falta pagar: {formatarMoeda(devido)}
                            {quitado && <span className="ml-2 text-success-600 font-medium">✓ Quitado</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={devido}
                            value={itensSelecionados[item.id] ?? ''}
                            onChange={(e) => handleItemChange(item.id, e.target.value)}
                            className="w-28 text-right px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Rodapé de conferência */}
                {(() => {
                  const val = parseFloat(valorPagamento);
                  const diff = Math.abs(totalAplicado - val);
                  const ok = diff < 0.01;
                  const falta = val - totalAplicado;
                  return (
                    <div className={`flex justify-between items-center px-3 py-2 text-sm font-medium ${ok ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>
                      <span>{ok ? '✓ Valor totalmente alocado' : falta > 0 ? `Falta alocar: ${formatarMoeda(falta)}` : `Excesso: ${formatarMoeda(-falta)}`}</span>
                      <span>{formatarMoeda(totalAplicado)} / {formatarMoeda(val)}</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Observações */}
            <Input
              label="Observações"
              name="observacoesPagamento"
              value={observacoesPagamento}
              onChange={setObservacoesPagamento}
              placeholder="Ex: Entrada do tratamento"
              hint="opcional"
            />

            <button
              type="submit"
              disabled={!valorPagamento || registrando}
              className="btn btn-primary w-full disabled:opacity-50"
            >
              {registrando ? 'Registrando...' : 'Confirmar Pagamento'}
            </button>
          </form>
        </div>

        {/* Agendar Parcela */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">📅 Agendar Parcela</h2>
          
          <form onSubmit={handleAdicionarParcela} className="space-y-4">
            <Input
              label="Valor (R$)"
              name="valorParcela"
              type="number"
              step={0.01}
              min={0}
              value={valorParcela}
              onChange={setValorParcela}
              placeholder="0,00"
              required
            />
            
            <Input
              label="Data de Vencimento"
              name="dataVencimento"
              type="date"
              value={dataVencimento}
              onChange={setDataVencimento}
              required
            />
            
            <Input
              label="Observações"
              name="observacoesParcela"
              value={observacoesParcela}
              onChange={setObservacoesParcela}
              placeholder="Ex: Cartão, PIX, etc."
            />
            
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
        <h2 className="text-lg font-semibold mb-4">Procedimentos e Pagamentos</h2>
        
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-surface-secondary">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                Procedimento
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                Valor Total
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                Já Pago
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                Saldo Devedor
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-muted uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-neutral-200">
            {atendimento.itens.map((item) => {
              const saldoDevedorItem = item.valor - item.valor_pago;
              const podePagarComSaldo = item.status !== 'pago' && saldoDevedorItem > 0 && saldoCliente >= saldoDevedorItem - 0.01;
              return (
                <tr key={item.id} className={saldoDevedorItem === 0 ? 'bg-success-50' : ''}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {item.dente_unico
                      ? `${item.procedimento_nome} • Dente ${item.dente_unico}`
                      : item.procedimento_nome}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatarMoeda(item.valor)}
                  </td>
                  <td className="px-4 py-3 text-right text-success-600 font-medium">
                    {formatarMoeda(item.valor_pago)}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${
                    saldoDevedorItem > 0 ? 'text-error-600' : 'text-success-600'
                  }`}>
                    {formatarMoeda(saldoDevedorItem)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge type="item" status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {podePagarComSaldo && (
                      <button
                        onClick={() => handleUsarSaldo(item)}
                        className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                      >
                        Usar saldo
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-surface-secondary">
            <tr>
              <td className="px-4 py-3 font-semibold">Total</td>
              <td className="px-4 py-3 text-right font-bold text-lg">
                {formatarMoeda(atendimento.total)}
              </td>
              <td className="px-4 py-3 text-right font-bold text-lg text-success-600">
                {formatarMoeda(atendimento.total_pago)}
              </td>
              <td className="px-4 py-3 text-right font-bold text-lg text-error-600">
                {formatarMoeda(atendimento.total - atendimento.total_pago)}
              </td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Histórico de Pagamentos */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">💳 Pagamentos Registrados</h2>
        
        {pagamentos.length === 0 ? (
          <div className="text-center py-8 text-muted">
            Nenhum pagamento registrado
          </div>
        ) : (
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-surface-secondary">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data/Hora</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Recebido por</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Método</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Observações</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-neutral-200">
              {pagamentos.map((pag) => (
                <>
                  <tr key={pag.id} className={pag.cancelado ? 'opacity-50 bg-neutral-50' : ''}>
                    <td className="px-4 py-3 text-neutral-600">{formatarDataHora(pag.created_at)}</td>
                    <td className="px-4 py-3 text-foreground">{pag.recebido_por_nome || 'N/A'}</td>
                    <td className="px-4 py-3">{METODOS_PAGAMENTO.find(m => m.value === pag.metodo)?.label || pag.metodo}</td>
                    <td className={`px-4 py-3 text-right font-medium ${pag.cancelado ? 'line-through text-neutral-400' : 'text-success-600'}`}>
                      {formatarMoeda(pag.valor)}
                    </td>
                    <td className="px-4 py-3 text-muted">{pag.observacoes || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      {pag.cancelado ? (
                        <span className="text-xs font-medium text-error-600 bg-error-50 px-2 py-1 rounded">Cancelado</span>
                      ) : (
                        <button
                          onClick={() => { setCancelandoId(pag.id); setMotivoCancelamento(''); }}
                          className="text-sm text-error-600 hover:text-error-800"
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                  {pag.cancelado && pag.motivo_cancelamento && (
                    <tr key={`${pag.id}-motivo`} className="bg-error-50">
                      <td colSpan={6} className="px-4 py-2 text-xs text-error-700">
                        <span className="font-medium">Motivo:</span> {pag.motivo_cancelamento}
                      </td>
                    </tr>
                  )}
                  {cancelandoId === pag.id && (
                    <tr key={`${pag.id}-cancel`}>
                      <td colSpan={6} className="px-4 py-3 bg-warning-50 border-l-4 border-warning-400">
                        <p className="text-sm font-medium text-warning-800 mb-2">Informe o motivo do cancelamento:</p>
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={motivoCancelamento}
                            onChange={(e) => setMotivoCancelamento(e.target.value)}
                            placeholder="Ex: Digitação errada, pagamento duplicado..."
                            className="input flex-1 text-sm"
                          />
                          <button
                            onClick={() => handleCancelarPagamento(pag.id)}
                            disabled={!motivoCancelamento.trim()}
                            className="btn btn-primary text-sm disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setCancelandoId(null)}
                            className="btn btn-secondary text-sm"
                          >
                            Voltar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
            <tfoot className="bg-success-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 font-semibold text-success-700">Total Pago</td>
                <td className="px-4 py-3 text-right font-bold text-lg text-success-700">{formatarMoeda(totalPago)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        type={confirmDialog.type}
      />

      {/* Modal de Estorno */}
      <Modal
        isOpen={estornoModalOpen}
        onClose={() => setEstornoModalOpen(false)}
        title="Estornar saldo"
        footer={
          <>
            <button onClick={() => setEstornoModalOpen(false)} className="btn btn-secondary">
              Cancelar
            </button>
            <button
              onClick={handleEstornar}
              disabled={!estornoValor || !estornoObs.trim() || estornando}
              className="btn btn-primary disabled:opacity-50"
            >
              {estornando ? 'Estornando...' : 'Confirmar estorno'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Saldo atual: <span className="font-semibold">{formatarMoeda(saldoCliente)}</span>
          </p>
          <Input
            label="Valor a estornar (R$)"
            name="estornoValor"
            type="number"
            step={0.01}
            min={0.01}
            max={saldoCliente}
            value={estornoValor}
            onChange={setEstornoValor}
            placeholder="0,00"
            required
          />
          <Input
            label="Observações"
            name="estornoObs"
            value={estornoObs}
            onChange={setEstornoObs}
            placeholder="Motivo do estorno (obrigatório)"
            required
          />
        </div>
      </Modal>

      {/* Modal de Transferência */}
      <Modal
        isOpen={transferenciaModalOpen}
        onClose={() => setTransferenciaModalOpen(false)}
        title="Transferir saldo"
        footer={
          <>
            <button onClick={() => setTransferenciaModalOpen(false)} className="btn btn-secondary">
              Cancelar
            </button>
            <button
              onClick={handleTransferir}
              disabled={!transferenciaDestinoId || !transferenciaValor || transferindo}
              className="btn btn-primary disabled:opacity-50"
            >
              {transferindo ? 'Transferindo...' : 'Confirmar transferência'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Saldo atual: <span className="font-semibold">{formatarMoeda(saldoCliente)}</span>
          </p>

          {/* Busca de cliente destino */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Cliente destino *
            </label>
            {transferenciaDestinoId ? (
              <div className="flex items-center gap-2 p-2 bg-success-50 rounded-lg border border-success-200">
                <span className="text-sm font-medium text-success-800 flex-1">{transferenciaDestinoNome}</span>
                <button
                  onClick={() => {
                    setTransferenciaDestinoId(null);
                    setTransferenciaDestinoNome('');
                    setBuscaCliente('');
                    setClientesBusca([]);
                  }}
                  className="text-sm text-error-600 hover:text-error-800"
                >
                  Alterar
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={buscaCliente}
                  onChange={(e) => handleBuscarClientes(e.target.value)}
                  placeholder="Buscar por nome ou CPF..."
                  className="input w-full"
                />
                {clientesBusca.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {clientesBusca.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setTransferenciaDestinoId(c.id);
                          setTransferenciaDestinoNome(c.nome);
                          setClientesBusca([]);
                          setBuscaCliente('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-neutral-50 text-sm"
                      >
                        {c.nome}
                        {c.cpf && <span className="text-muted ml-2">({c.cpf})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {buscandoClientes && (
                  <p className="text-xs text-muted mt-1">Buscando...</p>
                )}
              </div>
            )}
          </div>

          <Input
            label="Valor a transferir (R$)"
            name="transferenciaValor"
            type="number"
            step={0.01}
            min={0.01}
            max={saldoCliente}
            value={transferenciaValor}
            onChange={setTransferenciaValor}
            placeholder="0,00"
            required
          />
          <Input
            label="Observações"
            name="transferenciaObs"
            value={transferenciaObs}
            onChange={setTransferenciaObs}
            placeholder="Opcional"
          />
        </div>
      </Modal>

      {/* Parcelas Agendadas */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">📅 Parcelas Agendadas</h2>
        
        {parcelas.length === 0 ? (
          <div className="text-center py-8 text-muted">
            Nenhuma parcela agendada
          </div>
        ) : (
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-surface-secondary">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                  Parcela
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                  Vencimento
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                  Valor
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                  Observações
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-neutral-200">
              {parcelas.map((parc) => {
                const vencida = new Date(parc.data_vencimento) < new Date() && !parc.pago;
                return (
                  <tr key={parc.id} className={vencida ? 'bg-error-50' : ''}>
                    <td className="px-4 py-3 font-medium">
                      {parc.numero}ª Parcela
                    </td>
                    <td className={`px-4 py-3 ${vencida ? 'text-error-600 font-medium' : 'text-neutral-600'}`}>
                      {formatarData(parc.data_vencimento)}
                      {vencida && <span className="ml-1 text-xs font-semibold text-error-600">Vencida</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatarMoeda(parc.valor)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {parc.pago ? (
                        <span className="text-success-600 font-medium">✓ Pago</span>
                      ) : (
                        <span className={vencida ? 'text-error-600' : 'text-warning-600'}>
                          {vencida ? 'Vencida' : 'Pendente'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {parc.observacoes || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!parc.pago && (
                        <button
                          onClick={() => handleRemoverParcela(parc.id)}
                          className="text-error-600 hover:text-error-800 text-sm"
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-warning-50">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-semibold text-warning-700">
                  Total Parcelas Pendentes
                </td>
                <td className="px-4 py-3 text-right font-bold text-lg text-warning-700">
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
