'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda, formatarDataHora } from '@/lib/utils/formatters';
import { StatusBadge } from '@/components/domain';
import { Alert, LoadingState, PageHeader, Card, Button, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import usePageTitle from '@/lib/utils/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';

interface ItemAtendimento {
  id: number;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_nome: string | null;
  valor: number;
  valor_pago: number;
  status: string;
  dente_unico: string | null;
}

interface Pagamento {
  id: number;
  valor: number;
  metodo: string;
  recebido_por_nome?: string;
  cancelado: number;
  created_at: string;
}

interface Atendimento {
  id: number;
  cliente_nome: string;
  status: string;
  created_at: string;
  finalizado_at: string | null;
  observacoes_encerramento: string | null;
  itens: ItemAtendimento[];
  total: number;
  total_pago: number;
}

const METODO_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  crediario: 'Crediário',
  afins_sorria: 'Afins Sorria',
};


function nomeProcedimento(item: ItemAtendimento): string {
  let nome = item.procedimento_nome;
  if (item.dente_unico) nome += ` • Dente ${item.dente_unico}`;
  if (item.etapa_label) nome += ` — ${item.etapa_label}`;
  return nome;
}

export default function EncerrarAtendimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  usePageTitle('Encerrar Atendimento');
  const { id } = use(params);
  const router = useRouter();
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const unitFetch = useUnitFetch();

  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [encerrando, setEncerrando] = useState(false);
  const [observacoes, setObservacoes] = useState('');

  const carregarDados = useCallback(async () => {
    try {
      const [resAt, resPag] = await Promise.all([
        unitFetch(`/api/atendimentos/${id}`),
        unitFetch(`/api/atendimentos/${id}/pagamentos`),
      ]);
      const atData = await resAt.json();
      const pagData = await resPag.json();

      if (!resAt.ok) throw new Error(atData.error || 'Atendimento não encontrado');

      // Guarda se está encerrado (leitura) ou finalizado (ação possível)
      setAtendimento(atData);
      setPagamentos(Array.isArray(pagData) ? pagData : []);

      // Redireciona se não está em estado revisável
      if (!['finalizado', 'encerrado'].includes(atData.status)) {
        router.replace(`/atendimentos/${id}`);
      }

      if (atData.observacoes_encerramento) setObservacoes(atData.observacoes_encerramento);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [id, unitFetch, router]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  async function handleEncerrar() {
    if (!atendimento || atendimento.status === 'encerrado') return;
    setEncerrando(true);
    setError('');
    try {
      const res = await unitFetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'encerrado', observacoes_encerramento: observacoes || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao encerrar');
      toast.success('Atendimento encerrado com sucesso.');
      router.push('/atendimentos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao encerrar');
    } finally {
      setEncerrando(false);
    }
  }

  if (loading) return <LoadingState text="Carregando atendimento..." />;
  if (!atendimento) return <Alert type="error">{error || 'Atendimento não encontrado'}</Alert>;

  const jaEncerrado = atendimento.status === 'encerrado';
  const pagamentosAtivos = pagamentos.filter(p => !p.cancelado);
  const totalPagamentos = pagamentosAtivos.reduce((s, p) => s + p.valor, 0);
  const itensConcluidos = atendimento.itens.filter(i => i.status === 'concluido');
  const itensPendentes = atendimento.itens.filter(i => i.status !== 'concluido');

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      <PageHeader
        title={jaEncerrado ? `Atendimento #${id} — Encerrado` : `Revisar e Encerrar — Atendimento #${id}`}
        description={atendimento.cliente_nome}
        breadcrumb={[
          { label: 'Atendimentos', href: '/atendimentos' },
          { label: `#${id}`, href: `/atendimentos/${id}` },
          { label: jaEncerrado ? 'Encerrado' : 'Encerrar' },
        ]}
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      {jaEncerrado && (
        <Alert type="info">
          Este atendimento já foi encerrado em {atendimento.finalizado_at ? formatarDataHora(atendimento.finalizado_at) : '—'}.
        </Alert>
      )}

      {/* ── Procedimentos Realizados ── */}
      <Card>
        <h2 className="text-lg font-semibold mb-3">
          Procedimentos Realizados
          <span className="ml-2 text-sm font-normal text-muted">({itensConcluidos.length})</span>
        </h2>
        {itensConcluidos.length === 0 ? (
          <p className="text-sm text-muted">Nenhum procedimento foi concluído.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {itensConcluidos.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{nomeProcedimento(item)}</p>
                  {item.executor_nome && (
                    <p className="text-xs text-muted">Executor: {item.executor_nome}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <StatusBadge type="item" status={item.status} />
                  <span className="text-sm font-semibold">{formatarMoeda(item.valor)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {itensPendentes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-neutral-100">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Procedimentos não concluídos ({itensPendentes.length})
            </p>
            <div className="space-y-1">
              {itensPendentes.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">{nomeProcedimento(item)}</span>
                  <StatusBadge type="item" status={item.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-neutral-200 flex justify-between text-sm font-semibold">
          <span>Total dos procedimentos</span>
          <span>{formatarMoeda(atendimento.total)}</span>
        </div>
      </Card>

      {/* ── Pagamentos ── */}
      <Card>
        <h2 className="text-lg font-semibold mb-3">Pagamentos</h2>
        {pagamentosAtivos.length === 0 ? (
          <p className="text-sm text-muted">Nenhum pagamento registrado.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {pagamentosAtivos.map(pag => (
              <div key={pag.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    {METODO_LABELS[pag.metodo] ?? pag.metodo}
                  </p>
                  {pag.recebido_por_nome && (
                    <p className="text-xs text-muted">Recebido por {pag.recebido_por_nome} · {formatarDataHora(pag.created_at)}</p>
                  )}
                </div>
                <span className="text-sm font-semibold">{formatarMoeda(pag.valor)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-neutral-200 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Total pago</span>
            <span className="font-semibold">{formatarMoeda(totalPagamentos)}</span>
          </div>
          {atendimento.total > totalPagamentos && (
            <div className="flex justify-between text-sm">
              <span className="text-warning-700">Diferença</span>
              <span className="font-semibold text-warning-700">
                {formatarMoeda(atendimento.total - totalPagamentos)}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Encerramento ── */}
      {!jaEncerrado && hasRole(['atendente', 'admin']) && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Encerrar Atendimento</h2>
          <Textarea
            label="Observações (opcional)"
            name="observacoes_encerramento"
            value={observacoes}
            onChange={setObservacoes}
            placeholder="Alguma observação sobre o encerramento..."
            rows={3}
          />
          <Button
            onClick={handleEncerrar}
            disabled={encerrando}
            loading={encerrando}
            className="w-full mt-4"
          >
            Encerrar Atendimento
          </Button>
        </Card>
      )}

      {jaEncerrado && atendimento.observacoes_encerramento && (
        <Card>
          <div className="text-sm text-muted">
            <span className="font-medium text-foreground">Observações:</span> {atendimento.observacoes_encerramento}
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Link href={`/atendimentos/${id}`}>
          <Button variant="secondary">Voltar ao Atendimento</Button>
        </Link>
      </div>
    </div>
  );
}
