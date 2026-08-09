'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CircleDollarSign, Plus, ReceiptText } from 'lucide-react';
import { Alert, Badge, Button, Input, LoadingState, Modal, PageHeader, Select, StatCard, Table } from '@/components/ui';
import type { TableColumn } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { formatarDataHora, formatarMoeda } from '@/lib/utils/formatters';
import { unmaskMoeda } from '@/lib/utils/masks';
import usePageTitle from '@/lib/utils/usePageTitle';

interface ReceiptRow {
  id: string;
  cliente_id: number;
  cliente_nome: string;
  canal: string;
  status: string;
  valor_total_centavos: number;
  valor_alocado_centavos: number;
  formas_resumo: string | null;
  recebido_por_nome: string;
  created_at: string;
}

interface ClientOption { id: number; nome: string }
interface PaymentMethod { id: number; grupo: string; subgrupo: string; taxa_percentual?: number; taxa_fixa?: number }
interface ProcedureOption { id: string; nome_snapshot: string; valor_final_centavos: number; valor_recebido_centavos: number }

const initialForm = {
  clienteId: '',
  canal: 'presencial',
  formaId: '',
  valor: '',
  procedimentoId: '',
  observacoes: '',
};

export default function Recebimentos() {
  usePageTitle('Recebimentos');
  const unitFetch = useUnitFetch();
  const [items, setItems] = useState<ReceiptRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [procedures, setProcedures] = useState<ProcedureOption[]>([]);
  const [form, setForm] = useState(initialForm);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [receiptsResponse, clientsResponse, methodsResponse] = await Promise.all([
        unitFetch('/api/v2/recebimentos'),
        unitFetch('/api/clientes?limit=200'),
        unitFetch('/api/formas-pagamento'),
      ]);
      const receipts = await receiptsResponse.json() as ReceiptRow[] & { error?: string };
      const clientData = await clientsResponse.json() as { clientes?: ClientOption[]; error?: string };
      const methodData = await methodsResponse.json() as PaymentMethod[] & { error?: string };
      if (!receiptsResponse.ok) throw new Error(receipts.error || 'Erro ao carregar recebimentos');
      setItems(Array.isArray(receipts) ? receipts : []);
      setClients(clientData.clientes ?? []);
      setMethods(Array.isArray(methodData) ? methodData : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar recebimentos');
    } finally {
      setLoading(false);
    }
  }, [unitFetch]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!form.clienteId) {
      setProcedures([]);
      return;
    }
    void unitFetch(`/api/v2/procedimentos?cliente_id=${form.clienteId}&limit=100`)
      .then((response) => response.json())
      .then((data: { items?: ProcedureOption[] }) => setProcedures(data.items ?? []))
      .catch(() => setProcedures([]));
  }, [form.clienteId, unitFetch]);

  const totals = useMemo(() => ({
    total: items.filter((item) => item.status !== 'estornado').reduce((sum, item) => sum + Number(item.valor_total_centavos), 0),
    presencial: items.filter((item) => item.canal === 'presencial' && item.status !== 'estornado').reduce((sum, item) => sum + Number(item.valor_total_centavos), 0),
  }), [items]);

  async function submit() {
    const cents = Math.round(unmaskMoeda(form.valor) * 100);
    if (!form.clienteId || !form.formaId || !Number.isInteger(cents) || cents <= 0) {
      setError('Selecione paciente, forma e informe um valor válido.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const method = methods.find((item) => String(item.id) === form.formaId);
      const response = await unitFetch('/api/v2/recebimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          cliente_id: Number(form.clienteId),
          canal: form.canal,
          formas: [{
            forma_pagamento_id: Number(form.formaId),
            valor_centavos: cents,
            taxa_bps: Math.round(Number(method?.taxa_percentual ?? 0) * 100),
            taxa_fixa_centavos: Math.round(Number(method?.taxa_fixa ?? 0) * 100),
          }],
          alocacoes: form.procedimentoId
            ? [{ procedimento_cliente_id: form.procedimentoId, valor_centavos: cents }]
            : [],
          observacoes: form.observacoes || null,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Erro ao registrar recebimento');
      setOpen(false);
      setForm(initialForm);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao registrar recebimento');
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumn<ReceiptRow>[] = [
    { key: 'cliente_nome', label: 'Paciente', render: (item) => <span className="font-medium text-foreground">{item.cliente_nome}</span> },
    { key: 'canal', label: 'Canal', render: (item) => <Badge color={item.canal === 'presencial' ? 'blue' : 'purple'}>{item.canal}</Badge> },
    { key: 'formas_resumo', label: 'Forma' },
    { key: 'valor_total_centavos', label: 'Valor', align: 'right', render: (item) => <span className="font-semibold">{formatarMoeda(item.valor_total_centavos / 100)}</span> },
    { key: 'valor_alocado_centavos', label: 'Alocado', align: 'right', render: (item) => formatarMoeda(item.valor_alocado_centavos / 100) },
    { key: 'status', label: 'Status', render: (item) => <Badge color={item.status === 'confirmado' ? 'green' : 'gray'}>{item.status}</Badge> },
    { key: 'created_at', label: 'Registrado em', render: (item) => formatarDataHora(item.created_at) },
  ];
  const selectedProcedure = procedures.find((item) => item.id === form.procedimentoId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recebimentos"
        description="Registre pagamentos presenciais ou remotos sem criar atendimento clínico."
        icon={<ReceiptText className="size-7" />}
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Novo recebimento</Button>}
      />
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<CircleDollarSign className="size-5" />} label="Recebido" value={formatarMoeda(totals.total / 100)} color="border-success-500" />
        <StatCard icon={<Banknote className="size-5" />} label="Presencial" value={formatarMoeda(totals.presencial / 100)} color="border-info-500" />
        <StatCard icon={<ReceiptText className="size-5" />} label="Lançamentos" value={items.length} color="border-primary" />
      </div>
      {loading
        ? <LoadingState text="Carregando recebimentos..." />
        : <Table columns={columns} data={items} keyExtractor={(item) => item.id} emptyMessage="Nenhum recebimento registrado" caption="Recebimentos" />}
      <Modal
        isOpen={open}
        onClose={() => !saving && setOpen(false)}
        title="Novo recebimento"
        description="O vínculo com atendimento é opcional e não será criado automaticamente."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={() => void submit()} loading={saving}>Registrar</Button></>}
      >
        <div className="space-y-4">
          <SearchableSelect
            label="Paciente"
            name="cliente_id"
            value={form.clienteId}
            onChange={(value) => setForm((current) => ({ ...current, clienteId: value, procedimentoId: '' }))}
            options={clients.map((client) => ({ value: String(client.id), label: client.nome }))}
            required
          />
          <Select
            label="Canal"
            name="canal"
            value={form.canal}
            onChange={(value) => setForm((current) => ({ ...current, canal: value }))}
            options={[
              { value: 'presencial', label: 'Presencial' },
              { value: 'remoto', label: 'Remoto' },
              { value: 'link', label: 'Link de pagamento' },
            ]}
          />
          <SearchableSelect
            label="Forma de pagamento"
            name="forma_id"
            value={form.formaId}
            onChange={(value) => setForm((current) => ({ ...current, formaId: value }))}
            options={methods.map((method) => ({ value: String(method.id), label: `${method.grupo}${method.subgrupo ? ` — ${method.subgrupo}` : ''}` }))}
            required
          />
          <Input label="Valor" name="valor" value={form.valor} onChange={(value) => setForm((current) => ({ ...current, valor: value }))} mask="moeda" required />
          <SearchableSelect
            label="Alocar em procedimento (opcional)"
            name="procedimento_id"
            value={form.procedimentoId}
            onChange={(value) => setForm((current) => ({ ...current, procedimentoId: value }))}
            options={procedures
              .filter((procedure) => procedure.valor_final_centavos > procedure.valor_recebido_centavos)
              .map((procedure) => ({
                value: procedure.id,
                label: `${procedure.nome_snapshot} — saldo ${formatarMoeda((procedure.valor_final_centavos - procedure.valor_recebido_centavos) / 100)}`,
              }))}
            hint={selectedProcedure ? 'O valor será alocado integralmente ao procedimento selecionado.' : 'Sem alocação, o valor fica como crédito do paciente.'}
          />
          <Input label="Observações" name="observacoes" value={form.observacoes} onChange={(value) => setForm((current) => ({ ...current, observacoes: value }))} />
        </div>
      </Modal>
    </div>
  );
}
