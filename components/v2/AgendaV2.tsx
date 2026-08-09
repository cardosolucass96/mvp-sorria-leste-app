'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, LogIn, Plus } from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Input, LoadingState, Modal, PageHeader, Select, Table, Textarea } from '@/components/ui';
import type { TableColumn } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { formatarDataHora } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

interface AgendaRow {
  id: string;
  cliente_id: number;
  cliente_nome: string;
  finalidade_avaliacao: number;
  data_agendada: string;
  status: string;
  itens_count: number;
  procedimentos_resumo: string | null;
  profissionais_resumo: string | null;
  atendimento_clinico_id: string | null;
}
interface Client { id: number; nome: string }
interface User { id: number; nome: string; role: string; roles?: string[] }
interface Procedure { id: string; nome_snapshot: string; status_comercial: string; status_clinico: string }

const initialForm = {
  clienteId: '',
  tipo: 'avaliacao',
  avaliadorId: '',
  data: '',
  duracao: '60',
  observacoes: '',
};

export default function AgendaV2() {
  usePageTitle('Agenda V2');
  const unitFetch = useUnitFetch();
  const [items, setItems] = useState<AgendaRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [form, setForm] = useState(initialForm);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [agendaResponse, clientsResponse, usersResponse] = await Promise.all([
        unitFetch('/api/v2/agenda'),
        unitFetch('/api/clientes?limit=200'),
        unitFetch('/api/v2/profissionais'),
      ]);
      const agenda = await agendaResponse.json() as AgendaRow[] & { error?: string };
      const clientData = await clientsResponse.json() as { clientes?: Client[] };
      const userData = await usersResponse.json() as User[];
      if (!agendaResponse.ok) throw new Error(agenda.error || 'Erro ao carregar agenda');
      setItems(Array.isArray(agenda) ? agenda : []);
      setClients(clientData.clientes ?? []);
      setUsers(Array.isArray(userData) ? userData : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar agenda');
    } finally {
      setLoading(false);
    }
  }, [unitFetch]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setSelected({});
    if (!form.clienteId || form.tipo !== 'procedimento') {
      setProcedures([]);
      return;
    }
    void unitFetch(`/api/v2/procedimentos?cliente_id=${form.clienteId}&limit=100`)
      .then((response) => response.json())
      .then((data: { items?: Procedure[] }) => setProcedures((data.items ?? []).filter((item) => item.status_comercial === 'aceito' && !['concluido', 'cancelado'].includes(item.status_clinico))))
      .catch(() => setProcedures([]));
  }, [form.clienteId, form.tipo, unitFetch]);

  const evaluators = useMemo(() => users.filter((user) => (user.roles ?? [user.role]).includes('avaliador')), [users]);
  const professionals = useMemo(() => users.filter((user) => (user.roles ?? [user.role]).some((role) => ['executor', 'ortodontista'].includes(role))), [users]);

  async function createAppointment() {
    if (!form.clienteId || !form.data) {
      setError('Paciente e data/hora são obrigatórios.');
      return;
    }
    if (form.tipo === 'avaliacao' && !form.avaliadorId) {
      setError('Selecione o avaliador.');
      return;
    }
    const selectedEntries = Object.entries(selected);
    if (form.tipo === 'procedimento' && selectedEntries.length === 0) {
      setError('Selecione ao menos um procedimento.');
      return;
    }
    if (selectedEntries.some(([, professionalId]) => !professionalId)) {
      setError('Defina o profissional de cada procedimento.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await unitFetch('/api/v2/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          cliente_id: Number(form.clienteId),
          finalidade_avaliacao: form.tipo === 'avaliacao',
          avaliador_id: form.tipo === 'avaliacao' ? Number(form.avaliadorId) : null,
          data_agendada: form.data,
          duracao_minutos: Number(form.duracao),
          observacoes: form.observacoes || null,
          itens: selectedEntries.map(([procedureId, professionalId]) => ({
            procedimento_cliente_id: procedureId,
            profissional_id: Number(professionalId),
          })),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Erro ao criar compromisso');
      setOpen(false);
      setForm(initialForm);
      setSelected({});
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao criar compromisso');
    } finally {
      setSaving(false);
    }
  }

  async function checkIn(item: AgendaRow) {
    setError('');
    const response = await unitFetch(`/api/v2/agenda/${item.id}/chegada`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `chegada:${item.id}` },
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error || 'Erro ao registrar chegada');
      return;
    }
    await load();
  }

  const columns: TableColumn<AgendaRow>[] = [
    { key: 'data_agendada', label: 'Data e hora', render: (item) => <span className="font-medium">{formatarDataHora(item.data_agendada)}</span> },
    { key: 'cliente_nome', label: 'Paciente' },
    { key: 'tipo', label: 'Finalidade', render: (item) => <Badge color={item.finalidade_avaliacao ? 'evaluation' : 'blue'}>{item.finalidade_avaliacao ? 'Avaliação' : 'Execução'}</Badge> },
    { key: 'procedimentos_resumo', label: 'Procedimentos', render: (item) => item.procedimentos_resumo || '—' },
    { key: 'profissionais_resumo', label: 'Profissionais', render: (item) => item.profissionais_resumo || '—' },
    { key: 'status', label: 'Status', render: (item) => <Badge color={item.status === 'agendado' ? 'green' : 'gray'}>{item.status}</Badge> },
    {
      key: 'acao', label: 'Ação', align: 'right', render: (item) => item.status === 'agendado'
        ? <Button size="sm" variant="secondary" icon={<LogIn className="size-4" />} onClick={() => void checkIn(item)}>Chegou</Button>
        : item.atendimento_clinico_id ? <span className="text-xs text-muted-foreground">Atendimento criado</span> : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="Todo compromisso tem data e pode reunir vários procedimentos e profissionais."
        icon={<CalendarDays className="size-7" />}
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Novo compromisso</Button>}
      />
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      {loading
        ? <LoadingState text="Carregando agenda..." />
        : <Table columns={columns} data={items} keyExtractor={(item) => item.id} emptyMessage="Nenhum compromisso agendado" caption="Agenda de compromissos" />}
      <Modal
        isOpen={open}
        onClose={() => !saving && setOpen(false)}
        title="Novo compromisso"
        size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={() => void createAppointment()} loading={saving}>Agendar</Button></>}
      >
        <div className="space-y-4">
          <SearchableSelect label="Paciente" name="cliente_id" value={form.clienteId} onChange={(value) => setForm((current) => ({ ...current, clienteId: value }))} options={clients.map((client) => ({ value: String(client.id), label: client.nome }))} required />
          <Select label="Finalidade" name="tipo" value={form.tipo} onChange={(value) => setForm((current) => ({ ...current, tipo: value, avaliadorId: '' }))} options={[{ value: 'avaliacao', label: 'Avaliação' }, { value: 'procedimento', label: 'Execução de procedimento' }]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Data e hora" name="data_agendada" type="datetime-local" value={form.data} onChange={(value) => setForm((current) => ({ ...current, data: value }))} required />
            <Input label="Duração (minutos)" name="duracao" type="number" min={1} value={form.duracao} onChange={(value) => setForm((current) => ({ ...current, duracao: value }))} required />
          </div>
          {form.tipo === 'avaliacao' ? (
            <SearchableSelect label="Avaliador" name="avaliador_id" value={form.avaliadorId} onChange={(value) => setForm((current) => ({ ...current, avaliadorId: value }))} options={evaluators.map((user) => ({ value: String(user.id), label: user.nome }))} required />
          ) : (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-sm font-medium text-foreground">Procedimentos e profissionais</p>
              {procedures.length === 0 ? <p className="text-sm text-muted-foreground">Selecione um paciente com procedimentos aceitos.</p> : procedures.map((procedure) => {
                const checked = Object.hasOwn(selected, procedure.id);
                return (
                  <div key={procedure.id} className="grid items-center gap-3 border-b border-border pb-3 last:border-0 sm:grid-cols-[1fr_240px]">
                    <Checkbox label={procedure.nome_snapshot} checked={checked} onChange={(value) => setSelected((current) => {
                      const next = { ...current };
                      if (value) next[procedure.id] = '';
                      else delete next[procedure.id];
                      return next;
                    })} />
                    <Select label="Profissional" name={`profissional_${procedure.id}`} value={selected[procedure.id] ?? ''} onChange={(value) => setSelected((current) => ({ ...current, [procedure.id]: value }))} options={professionals.map((user) => ({ value: String(user.id), label: user.nome }))} disabled={!checked} />
                  </div>
                );
              })}
            </div>
          )}
          <Textarea label="Observações" name="observacoes" value={form.observacoes} onChange={(value) => setForm((current) => ({ ...current, observacoes: value }))} rows={3} />
        </div>
      </Modal>
    </div>
  );
}
