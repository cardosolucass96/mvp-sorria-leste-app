'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Plus, Trash2, Copy } from 'lucide-react';
import { PageHeader, Button, Input, Select, Checkbox, Badge, Alert, Modal, LoadingState, Card, Table, ConfirmDialog } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import { formatarMoeda } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';
import type { CategoriaComRoles } from '@/lib/types';

interface EtapaModelo {
  id?: number;
  nome: string;
  valor: string;
  comissao_venda: string;
  comissao_execucao: string;
}

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
  por_dente: number;
  tem_face: number;
  tem_etapas: number;
  categoria_id: number | null;
  ativo: number;
  created_at: string;
}

interface FormData {
  nome: string;
  valor: string;
  comissao_venda: string;
  comissao_execucao: string;
  por_dente: boolean;
  tem_face: boolean;
  tem_etapas: boolean;
  categoria_id: string;
  etapas: EtapaModelo[];
}

const ETAPA_VAZIA: EtapaModelo = { nome: '', valor: '', comissao_venda: '', comissao_execucao: '' };

const initialFormData: FormData = {
  nome: '',
  valor: '',
  comissao_venda: '',
  comissao_execucao: '',
  por_dente: false,
  tem_face: false,
  tem_etapas: false,
  categoria_id: '',
  etapas: [],
};

export default function ProcedimentosPage() {
  usePageTitle('Procedimentos');
  const { user } = useAuth();
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [categorias, setCategorias] = useState<CategoriaComRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const podeVerComissoes = user?.role === 'admin' || user?.role === 'atendente';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
      setError('Erro ao carregar procedimentos');
    } finally {
      setLoading(false);
    }
  }, [busca, mostrarInativos]);

  useEffect(() => {
    carregarProcedimentos();
  }, [carregarProcedimentos]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/categorias?ativo=1');
        if (res.ok) setCategorias(await res.json());
      } catch {
        // degrada para seleção manual
      }
    })();
  }, []);

  const abrirModalNovo = () => {
    setFormData(initialFormData);
    setEditingId(null);
    setIsDuplicating(false);
    setError('');
    setIsModalOpen(true);
  };

  const abrirModalEditar = async (proc: Procedimento) => {
    setEditingId(proc.id);
    setError('');
    setIsModalOpen(true);

    // Carrega etapas do procedimento
    try {
      const res = await fetch(`/api/procedimentos/${proc.id}`);
      const data = await res.json();
      setFormData({
        nome: proc.nome,
        valor: proc.valor.toString(),
        comissao_venda: proc.comissao_venda.toString(),
        comissao_execucao: proc.comissao_execucao.toString(),
        por_dente: proc.por_dente === 1,
        tem_face: proc.tem_face === 1,
        tem_etapas: proc.tem_etapas === 1,
        categoria_id: proc.categoria_id != null ? String(proc.categoria_id) : '',
        etapas: (data.etapas ?? []).map((e: { nome: string; valor: number | null; comissao_venda: number; comissao_execucao: number }) => ({
          nome: e.nome,
          valor: e.valor != null ? String(e.valor) : '',
          comissao_venda: String(e.comissao_venda),
          comissao_execucao: String(e.comissao_execucao),
        })),
      });
    } catch {
      setFormData({
        nome: proc.nome,
        valor: proc.valor.toString(),
        comissao_venda: proc.comissao_venda.toString(),
        comissao_execucao: proc.comissao_execucao.toString(),
        por_dente: proc.por_dente === 1,
        tem_face: proc.tem_face === 1,
        tem_etapas: proc.tem_etapas === 1,
        categoria_id: proc.categoria_id != null ? String(proc.categoria_id) : '',
        etapas: [],
      });
    }
  };

  const duplicarProcedimento = async (proc: Procedimento) => {
    setEditingId(null);
    setIsDuplicating(true);
    setError('');
    setIsModalOpen(true);

    try {
      const res = await fetch(`/api/procedimentos/${proc.id}`);
      const data = await res.json();
      setFormData({
        nome: `${proc.nome} (Cópia)`,
        valor: proc.valor.toString(),
        comissao_venda: proc.comissao_venda.toString(),
        comissao_execucao: proc.comissao_execucao.toString(),
        por_dente: proc.por_dente === 1,
        tem_face: proc.tem_face === 1,
        tem_etapas: proc.tem_etapas === 1,
        categoria_id: proc.categoria_id != null ? String(proc.categoria_id) : '',
        etapas: (data.etapas ?? []).map((e: { nome: string; valor: number | null; comissao_venda: number; comissao_execucao: number }) => ({
          nome: e.nome,
          valor: e.valor != null ? String(e.valor) : '',
          comissao_venda: String(e.comissao_venda),
          comissao_execucao: String(e.comissao_execucao),
        })),
      });
    } catch {
      setFormData({
        nome: `${proc.nome} (Cópia)`,
        valor: proc.valor.toString(),
        comissao_venda: proc.comissao_venda.toString(),
        comissao_execucao: proc.comissao_execucao.toString(),
        por_dente: proc.por_dente === 1,
        tem_face: proc.tem_face === 1,
        tem_etapas: proc.tem_etapas === 1,
        categoria_id: proc.categoria_id != null ? String(proc.categoria_id) : '',
        etapas: [],
      });
    }
  };

  const fecharModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setIsDuplicating(false);
    setFormData(initialFormData);
    setError('');
  };

  const adicionarEtapa = () => {
    setFormData(prev => ({ ...prev, etapas: [...prev.etapas, { ...ETAPA_VAZIA }] }));
  };

  const removerEtapa = (idx: number) => {
    setFormData(prev => ({ ...prev, etapas: prev.etapas.filter((_, i) => i !== idx) }));
  };

  const atualizarEtapa = (idx: number, field: keyof EtapaModelo, value: string) => {
    setFormData(prev => ({
      ...prev,
      etapas: prev.etapas.map((e, i) => i === idx ? { ...e, [field]: value } : e),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (formData.tem_etapas && formData.etapas.length === 0) {
      setError('Adicione pelo menos uma etapa ou desmarque "Tem etapas"');
      setSaving(false);
      return;
    }

    if (formData.tem_etapas && formData.etapas.some(e => !e.nome.trim())) {
      setError('Todas as etapas precisam ter um nome');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        nome: formData.nome,
        valor: parseFloat(formData.valor) || 0,
        comissao_venda: parseFloat(formData.comissao_venda) || 0,
        comissao_execucao: parseFloat(formData.comissao_execucao) || 0,
        por_dente: formData.por_dente,
        tem_face: formData.por_dente && formData.tem_face,
        tem_etapas: formData.tem_etapas,
        categoria_id: formData.categoria_id ? parseInt(formData.categoria_id) : null,
        etapas: formData.tem_etapas
          ? formData.etapas.map((e, idx) => ({
              nome: e.nome.trim(),
              valor: e.valor ? parseFloat(e.valor) : null,
              comissao_venda: parseFloat(e.comissao_venda) || 0,
              comissao_execucao: parseFloat(e.comissao_execucao) || 0,
              ordem: idx,
            }))
          : [],
      };

      const url = editingId ? `/api/procedimentos/${editingId}` : '/api/procedimentos';
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

  const handleDesativar = (id: number) => {
    openConfirm({
      title: 'Desativar Procedimento',
      message: 'Deseja desativar este procedimento?',
      confirmLabel: 'Desativar',
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/procedimentos/${id}`, { method: 'DELETE' });
          if (res.ok) carregarProcedimentos();
        } catch (error) {
          console.error('Erro ao desativar:', error);
        }
      },
    });
  };

  const handleReativar = async (id: number) => {
    try {
      const res = await fetch(`/api/procedimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: true }),
      });
      if (res.ok) carregarProcedimentos();
    } catch (error) {
      console.error('Erro ao reativar:', error);
    }
  };

  if (loading) {
    return <LoadingState mode="spinner" text="Carregando..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procedimentos"
        icon={<FileText className="w-7 h-7" />}
        description="Catálogo de procedimentos odontológicos"
        actions={<Button onClick={abrirModalNovo}>+ Novo Procedimento</Button>}
      />

      <Card>
        <form onSubmit={(e) => { e.preventDefault(); carregarProcedimentos(); }} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Buscar"
              name="busca"
              value={busca}
              onChange={setBusca}
              placeholder="Nome do procedimento..."
            />
          </div>
          <Checkbox label="Mostrar inativos" checked={mostrarInativos} onChange={setMostrarInativos} />
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
      </Card>

      <Table<Procedimento>
        columns={[
          {
            key: 'nome',
            label: 'Procedimento',
            render: (proc) => (
              <div>
                <span className={`font-medium ${!proc.ativo ? 'text-neutral-400' : 'text-foreground'}`}>
                  {proc.nome}
                </span>
                {proc.tem_etapas === 1 && (
                  <Badge color="purple" className="ml-2 text-xs">Multi-sessão</Badge>
                )}
              </div>
            ),
          },
          {
            key: 'valor',
            label: 'Valor',
            align: 'right',
            render: (proc) => (
              <span className={`font-semibold ${proc.valor === 0 ? 'text-success-600' : 'text-foreground'}`}>
                {proc.valor === 0 ? 'Grátis' : formatarMoeda(proc.valor)}
              </span>
            ),
          },
          {
            key: 'por_dente',
            label: 'Por Dente',
            align: 'center',
            render: (proc) => (
              proc.por_dente ? (
                <div className="flex items-center justify-center gap-1.5">
                  <Badge color="amber">Sim</Badge>
                  {proc.tem_face === 1 && <Badge color="blue">Faces</Badge>}
                </div>
              ) : <span className="text-neutral-400">-</span>
            ),
          },
          ...(podeVerComissoes ? [
            {
              key: 'comissao_venda',
              label: 'Comissão Venda',
              align: 'right' as const,
              render: (proc: Procedimento) => <span className="text-neutral-600">{proc.comissao_venda}%</span>,
            },
            {
              key: 'comissao_execucao',
              label: 'Comissão Execução',
              align: 'right' as const,
              render: (proc: Procedimento) => <span className="text-neutral-600">{proc.comissao_execucao}%</span>,
            },
          ] : []),
          {
            key: 'status',
            label: 'Status',
            align: 'center',
            render: (proc) => proc.ativo ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge>,
          },
          {
            key: 'acoes',
            label: 'Ações',
            align: 'right',
            render: (proc) => (
              <div className="space-x-2">
                <Button variant="ghost" size="sm" onClick={() => abrirModalEditar(proc)} className="text-info-600 hover:text-info-800">
                  Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => duplicarProcedimento(proc)} className="text-neutral-600 hover:text-neutral-800">
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Duplicar
                </Button>
                {proc.ativo ? (
                  <Button variant="ghost" size="sm" onClick={() => handleDesativar(proc.id)} className="text-error-600 hover:text-error-800">
                    Desativar
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleReativar(proc.id)} className="text-success-600 hover:text-success-800">
                    Reativar
                  </Button>
                )}
              </div>
            ),
          },
        ] as TableColumn<Procedimento>[]}
        data={procedimentos}
        keyExtractor={(proc) => proc.id}
        emptyMessage="Nenhum procedimento encontrado"
        caption="Procedimentos odontológicos"
      />

      <div className="text-sm text-muted">
        Total: {procedimentos.length} procedimento(s)
        {mostrarInativos && ` (${procedimentos.filter(p => !p.ativo).length} inativo(s))`}
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

      {/* Modal de Criar/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={fecharModal}
        title={editingId ? 'Editar Procedimento' : isDuplicating ? 'Duplicar Procedimento' : 'Novo Procedimento'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert type="error">{error}</Alert>}

          <Input
            label="Nome"
            name="nome"
            value={formData.nome}
            onChange={(v) => setFormData({ ...formData, nome: v })}
            required
            placeholder="Ex: Limpeza dental"
            disabled={saving}
          />

          <Input
            label="Valor total (R$)"
            name="valor"
            type="number"
            value={formData.valor}
            onChange={(v) => setFormData({ ...formData, valor: v })}
            required
            placeholder="0,00"
            disabled={saving}
            hint={formData.tem_etapas ? 'Valor total do procedimento completo (soma de todas as sessões)' : undefined}
          />

          {categorias.length > 0 && (
            <Select
              label="Fila"
              name="categoria_id"
              value={formData.categoria_id}
              onChange={(v) => setFormData({ ...formData, categoria_id: v })}
              options={[
                { value: '', label: '— Selecionar —' },
                ...categorias.map(c => ({ value: String(c.id), label: c.nome })),
              ]}
              disabled={saving}
              hint="Fila de execução em que esse procedimento será atendido"
            />
          )}

          {podeVerComissoes && !formData.tem_etapas && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Comissão Venda (%)"
                name="comissao_venda"
                type="number"
                value={formData.comissao_venda}
                onChange={(v) => setFormData({ ...formData, comissao_venda: v })}
                placeholder="0"
                disabled={saving}
              />
              <Input
                label="Comissão Execução (%)"
                name="comissao_execucao"
                type="number"
                value={formData.comissao_execucao}
                onChange={(v) => setFormData({ ...formData, comissao_execucao: v })}
                placeholder="0"
                disabled={saving}
              />
            </div>
          )}

          <div className="flex gap-6">
            <Checkbox
              label="Cobrar por dente"
              checked={formData.por_dente}
              onChange={(v) => setFormData({ ...formData, por_dente: v, tem_face: v ? formData.tem_face : false })}
              hint="Valor multiplicado pela quantidade de dentes"
            />
            <Checkbox
              label="Tem etapas (multi-sessão)"
              checked={formData.tem_etapas}
              onChange={(v) => setFormData({ ...formData, tem_etapas: v, etapas: v ? [{ ...ETAPA_VAZIA }] : [] })}
              hint="Ex: aparelho, implante, canal"
            />
          </div>

          {formData.por_dente && (
            <Checkbox
              label="Usa faces do dente"
              checked={formData.tem_face}
              onChange={(v) => setFormData({ ...formData, tem_face: v })}
              hint="Exige a marcação das faces tratadas para cada dente selecionado"
            />
          )}

          {/* Etapas */}
          {formData.tem_etapas && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-surface-secondary flex items-center justify-between">
                <span className="text-sm font-medium">Etapas / Sessões</span>
                <button
                  type="button"
                  onClick={adicionarEtapa}
                  disabled={saving}
                  className="flex items-center gap-1 text-sm text-info-600 hover:text-info-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar etapa
                </button>
              </div>

              {formData.etapas.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted">
                  Nenhuma etapa adicionada.
                </div>
              ) : (
                <div className="divide-y">
                  {formData.etapas.map((etapa, idx) => (
                    <div key={idx} className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted w-6 shrink-0">{idx + 1}.</span>
                        <input
                          type="text"
                          value={etapa.nome}
                          onChange={(e) => atualizarEtapa(idx, 'nome', e.target.value)}
                          placeholder="Nome da etapa (ex: Instalação do aparelho)"
                          className="input flex-1 text-sm"
                          disabled={saving}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => removerEtapa(idx)}
                          disabled={saving}
                          className="text-error-500 hover:text-error-700 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className={`grid gap-2 pl-8 ${podeVerComissoes ? 'grid-cols-3' : 'grid-cols-1'}`}>
                        <div>
                          <label className="block text-xs text-muted mb-1">Valor (R$) <span className="text-neutral-400">opcional</span></label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={etapa.valor}
                            onChange={(e) => atualizarEtapa(idx, 'valor', e.target.value)}
                            placeholder="Deixe vazio para proporcional"
                            className="input text-sm w-full"
                            disabled={saving}
                          />
                        </div>
                        {podeVerComissoes && (
                          <>
                            <div>
                              <label className="block text-xs text-muted mb-1">Comissão Venda (%)</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={etapa.comissao_venda}
                                onChange={(e) => atualizarEtapa(idx, 'comissao_venda', e.target.value)}
                                placeholder="0"
                                className="input text-sm w-full"
                                disabled={saving}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-muted mb-1">Comissão Execução (%)</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={etapa.comissao_execucao}
                                onChange={(e) => atualizarEtapa(idx, 'comissao_execucao', e.target.value)}
                                placeholder="0"
                                className="input text-sm w-full"
                                disabled={saving}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={fecharModal} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
