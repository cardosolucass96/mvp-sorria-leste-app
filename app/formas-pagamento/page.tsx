'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, History, Pencil, Plus } from 'lucide-react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import usePageTitle from '@/lib/utils/usePageTitle';
import { formatarDataHora, formatarMoeda } from '@/lib/utils/formatters';
import { METODO_PAGAMENTO_LABELS } from '@/lib/constants/status';
import type { FormaPagamentoComTaxa, FormaPagamentoHistorico, MetodoPagamento } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Table,
  type TableColumn,
} from '@/components/ui';

interface FormaPagamentoDetalhe extends FormaPagamentoComTaxa {
  historico?: FormaPagamentoHistorico[];
}

interface FormaPagamentoFormData {
  grupo: string;
  subgrupo: string;
  metodo_base: MetodoPagamento;
  taxa_percentual: string;
  taxa_fixa: string;
  ativo: boolean;
}

const initialFormData: FormaPagamentoFormData = {
  grupo: '',
  subgrupo: '',
  metodo_base: 'pix',
  taxa_percentual: '0',
  taxa_fixa: '0',
  ativo: true,
};

const metodoBaseOptions = Object.entries(METODO_PAGAMENTO_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default function FormasPagamentoPage() {
  usePageTitle('Formas de Pagamento');
  const unitFetch = useUnitFetch();
  const [formas, setFormas] = useState<FormaPagamentoComTaxa[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormaPagamentoFormData>(initialFormData);
  const [historico, setHistorico] = useState<FormaPagamentoHistorico[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const carregarFormas = useCallback(async () => {
    try {
      setLoading(true);
      const query = mostrarInativas ? '?inativos=true' : '';
      const res = await unitFetch(`/api/formas-pagamento${query}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar formas de pagamento');
      }
      setFormas(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar formas de pagamento');
    } finally {
      setLoading(false);
    }
  }, [mostrarInativas, unitFetch]);

  useEffect(() => {
    void carregarFormas();
  }, [carregarFormas]);

  useEffect(() => {
    if (!error && !success) return;
    const timer = window.setTimeout(() => {
      setError('');
      setSuccess('');
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [error, success]);

  const carregarDetalhe = useCallback(async (formaId: number) => {
    const res = await unitFetch(`/api/formas-pagamento/${formaId}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao carregar forma de pagamento');
    }
    return data as FormaPagamentoDetalhe;
  }, [unitFetch]);

  const abrirNovo = () => {
    setEditingId(null);
    setFormData(initialFormData);
    setHistorico([]);
    setShowForm(true);
  };

  const abrirEdicao = async (formaId: number) => {
    try {
      const detalhe = await carregarDetalhe(formaId);
      setEditingId(detalhe.id);
      setFormData({
        grupo: detalhe.grupo,
        subgrupo: detalhe.subgrupo ?? '',
        metodo_base: detalhe.metodo_base,
        taxa_percentual: String(detalhe.taxa_percentual ?? 0),
        taxa_fixa: String(detalhe.taxa_fixa ?? 0),
        ativo: detalhe.ativo === 1,
      });
      setHistorico(detalhe.historico ?? []);
      setShowForm(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir forma de pagamento');
    }
  };

  const abrirHistorico = async (formaId: number) => {
    try {
      const detalhe = await carregarDetalhe(formaId);
      setEditingId(detalhe.id);
      setHistorico(detalhe.historico ?? []);
      setShowForm(false);
      setSuccess(`Histórico carregado para ${detalhe.grupo}${detalhe.subgrupo ? ` - ${detalhe.subgrupo}` : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.grupo.trim()) {
      setError('Grupo é obrigatório');
      return;
    }

    const payload = {
      grupo: formData.grupo.trim(),
      subgrupo: formData.subgrupo.trim(),
      metodo_base: formData.metodo_base,
      taxa_percentual: Number(formData.taxa_percentual || '0'),
      taxa_fixa: Number(formData.taxa_fixa || '0'),
      ativo: formData.ativo,
    };

    if (!Number.isFinite(payload.taxa_percentual) || payload.taxa_percentual < 0 || payload.taxa_percentual > 100) {
      setError('Taxa percentual deve estar entre 0 e 100');
      return;
    }

    if (!Number.isFinite(payload.taxa_fixa) || payload.taxa_fixa < 0) {
      setError('Taxa fixa deve ser maior ou igual a zero');
      return;
    }

    try {
      setSalvando(true);
      const url = editingId ? `/api/formas-pagamento/${editingId}` : '/api/formas-pagamento';
      const method = editingId ? 'PUT' : 'POST';
      const res = await unitFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar forma de pagamento');
      }

      setSuccess(editingId ? 'Forma de pagamento atualizada.' : 'Forma de pagamento criada.');
      setShowForm(false);
      setEditingId(null);
      setFormData(initialFormData);
      setHistorico(data.historico ?? []);
      await carregarFormas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar forma de pagamento');
    } finally {
      setSalvando(false);
    }
  };

  const columns = useMemo<TableColumn<FormaPagamentoComTaxa>[]>(() => ([
    {
      key: 'grupo',
      label: 'Forma',
      render: (item) => (
        <div>
          <p className="font-medium">{item.grupo}</p>
          <p className="text-xs text-muted-foreground">{item.subgrupo || 'Sem subgrupo'}</p>
        </div>
      ),
    },
    {
      key: 'metodo_base',
      label: 'Método base',
      render: (item) => METODO_PAGAMENTO_LABELS[item.metodo_base] || item.metodo_base,
    },
    {
      key: 'taxa_percentual',
      label: 'Taxa',
      render: (item) => (
        <div>
          <p>{Number(item.taxa_percentual ?? 0).toFixed(2)}%</p>
          <p className="text-xs text-muted-foreground">+ {formatarMoeda(Number(item.taxa_fixa ?? 0))}</p>
        </div>
      ),
    },
    {
      key: 'ativo',
      label: 'Status',
      render: (item) => (
        <Badge color={item.ativo ? 'green' : 'gray'} size="sm">
          {item.ativo ? 'Ativa' : 'Inativa'}
        </Badge>
      ),
    },
    {
      key: 'updated_at',
      label: 'Atualizada em',
      render: (item) => formatarDataHora(item.updated_at),
    },
    {
      key: 'acoes',
      label: 'Ações',
      render: (item) => (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => void abrirEdicao(item.id)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" onClick={() => void abrirHistorico(item.id)}>
            <History className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]), [abrirEdicao, abrirHistorico]);

  if (loading) {
    return <LoadingState mode="spinner" text="Carregando formas de pagamento..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formas de Pagamento"
        description="Configure as formas e subformas usadas na unidade atual, com taxa e histórico de vigência."
        icon={<CreditCard className="h-7 w-7" />}
        actions={
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4" />
            Nova Forma
          </Button>
        }
      />

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-medium">Listagem da unidade</p>
          <p className="text-sm text-muted-foreground">
            Use grupos e subgrupos para manter o select simples na cobrança.
          </p>
        </div>
        <Checkbox
          label="Mostrar inativas"
          name="mostrar_inativas"
          checked={mostrarInativas}
          onChange={setMostrarInativas}
        />
      </div>

      <Table
        columns={columns}
        data={formas}
        keyExtractor={(item) => item.id}
        emptyMessage="Nenhuma forma de pagamento cadastrada para esta unidade."
      />

      {showForm && (
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{editingId ? 'Editar forma de pagamento' : 'Nova forma de pagamento'}</h2>
              <p className="text-sm text-muted-foreground">
                A taxa nova passa a valer daqui para frente, sem recalcular pagamentos antigos.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Fechar
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Grupo"
                name="grupo"
                value={formData.grupo}
                onChange={(value) => setFormData((prev) => ({ ...prev, grupo: value }))}
                placeholder="Ex: Cartão Crédito"
                required
              />
              <Input
                label="Subgrupo"
                name="subgrupo"
                value={formData.subgrupo}
                onChange={(value) => setFormData((prev) => ({ ...prev, subgrupo: value }))}
                placeholder="Ex: Rede Visa/Master 3x"
              />
              <Select
                label="Método base"
                name="metodo_base"
                options={metodoBaseOptions}
                value={formData.metodo_base}
                onChange={(value) => setFormData((prev) => ({ ...prev, metodo_base: value as MetodoPagamento }))}
              />
              <Checkbox
                label="Forma ativa"
                name="ativo"
                checked={formData.ativo}
                onChange={(checked) => setFormData((prev) => ({ ...prev, ativo: checked }))}
              />
              <Input
                label="Taxa percentual"
                name="taxa_percentual"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.taxa_percentual}
                onChange={(value) => setFormData((prev) => ({ ...prev, taxa_percentual: value }))}
                placeholder="0,00"
              />
              <Input
                label="Taxa fixa"
                name="taxa_fixa"
                type="number"
                min="0"
                step="0.01"
                value={formData.taxa_fixa}
                onChange={(value) => setFormData((prev) => ({ ...prev, taxa_fixa: value }))}
                placeholder="0,00"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={salvando}>
                Salvar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {historico.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <History className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Histórico de Taxas</h2>
          </div>
          <div className="space-y-3">
            {historico.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{Number(item.taxa_percentual ?? 0).toFixed(2)}% + {formatarMoeda(Number(item.taxa_fixa ?? 0))}</p>
                    <p className="text-sm text-muted-foreground">
                      Vigente de {formatarDataHora(item.vigente_de)}
                      {item.vigente_ate ? ` até ${formatarDataHora(item.vigente_ate)}` : ' até agora'}
                    </p>
                  </div>
                  <Badge color={item.vigente_ate ? 'gray' : 'green'} size="sm">
                    {item.vigente_ate ? 'Encerrada' : 'Atual'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
