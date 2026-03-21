'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Activity } from 'lucide-react';
import { PageHeader, Button, Input, Checkbox, Badge, Alert, Modal, LoadingState, Card, Table } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import { formatarMoeda } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

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
  usePageTitle('Procedimentos');
  const { user } = useAuth();
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  
  // Apenas admin e atendente podem ver comissões
  const podeVerComissoes = user?.role === 'admin' || user?.role === 'atendente';
  
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
      setError('Erro ao carregar procedimentos');
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

      {/* Busca e Filtros */}
      <Card>
        <form onSubmit={handleBuscar} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Buscar"
              name="busca"
              value={busca}
              onChange={setBusca}
              placeholder="Nome do procedimento..."
            />
          </div>
          
          <Checkbox
            label="Mostrar inativos"
            checked={mostrarInativos}
            onChange={setMostrarInativos}
          />
          
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
      </Card>

      {/* Tabela */}
      <Table<Procedimento>
        columns={[
          {
            key: 'nome',
            label: 'Procedimento',
            render: (proc) => (
              <span className={`font-medium ${!proc.ativo ? 'text-neutral-400' : 'text-foreground'}`}>
                {proc.nome}
              </span>
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
            render: (proc) => proc.por_dente ? <Badge color="amber">Sim</Badge> : <span className="text-neutral-400">-</span>,
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

      {/* Resumo */}
      <div className="text-sm text-muted">
        Total: {procedimentos.length} procedimento(s)
        {mostrarInativos && ` (${procedimentos.filter(p => !p.ativo).length} inativo(s))`}
      </div>

      {/* Modal de Criar/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={fecharModal}
        title={editingId ? 'Editar Procedimento' : 'Novo Procedimento'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          
          <Input
            label="Nome"
            name="nome"
            value={formData.nome}
            onChange={(v) => setFormData({...formData, nome: v})}
            required
            placeholder="Ex: Limpeza dental"
            disabled={saving}
          />
          
          <Input
            label="Valor (R$)"
            name="valor"
            type="number"
            value={formData.valor}
            onChange={(v) => setFormData({...formData, valor: v})}
            required
            placeholder="0,00"
            disabled={saving}
          />
          
          {podeVerComissoes && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Comissão Venda (%)"
                name="comissao_venda"
                type="number"
                value={formData.comissao_venda}
                onChange={(v) => setFormData({...formData, comissao_venda: v})}
                placeholder="0"
                disabled={saving}
              />
              <Input
                label="Comissão Execução (%)"
                name="comissao_execucao"
                type="number"
                value={formData.comissao_execucao}
                onChange={(v) => setFormData({...formData, comissao_execucao: v})}
                placeholder="0"
                disabled={saving}
              />
            </div>
          )}
          
          <Checkbox
            label="Cobrar por dente"
            checked={formData.por_dente}
            onChange={(v) => setFormData({...formData, por_dente: v})}
            hint="Se marcado, o avaliador poderá selecionar múltiplos dentes e o valor será multiplicado pela quantidade"
          />
          
          <div className="flex justify-end gap-3 pt-4">
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
