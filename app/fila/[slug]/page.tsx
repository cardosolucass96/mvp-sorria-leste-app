'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter, useParams } from 'next/navigation';
import { Activity, LayoutList, Users, FileText } from 'lucide-react';
import { PageHeader, Card, LoadingState, EmptyState, Alert, ConfirmDialog } from '@/components/ui';
import { StatusBadge, ProntuarioDrawer } from '@/components/domain';
import usePageTitle from '@/lib/utils/usePageTitle';

interface Procedimento {
  id: number;
  atendimento_id: number;
  procedimento_nome: string;
  etapa_label: string | null;
  tem_etapas: number;
  cliente_id: number;
  cliente_nome: string;
  executor_id: number | null;
  status: string;
  created_at: string;
  concluido_at: string | null;
  dente_unico: string | null;
}

function NomeProcedimento({ proc }: { proc: Procedimento }) {
  const base = proc.dente_unico
    ? `${proc.procedimento_nome} • Dente ${proc.dente_unico}`
    : proc.procedimento_nome;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span>{base}</span>
      {proc.tem_etapas === 1 && proc.etapa_label && (
        <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-medium">
          {proc.etapa_label}
        </span>
      )}
      {!proc.tem_etapas && proc.etapa_label && (
        <span className="text-xs text-muted">— {proc.etapa_label}</span>
      )}
    </span>
  );
}

interface FilaData {
  categoria: { id: number; nome: string; slug: string; cor: string; icone: string };
  meusProcedimentos: Procedimento[];
  disponiveis: Procedimento[];
}

type Visualizacao = 'procedimento' | 'paciente';

export default function FilaPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const { user } = useAuth();
  const router = useRouter();
  const unitFetch = useUnitFetch();
  const [fila, setFila] = useState<FilaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('paciente');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>({ isOpen: false, title: '', message: '', onConfirm: async () => {} });
  const [pegando, setPegando] = useState<number | null>(null);
  const [drawerClienteId, setDrawerClienteId] = useState<number | null>(null);

  usePageTitle(fila?.categoria ? `Fila ${fila.categoria.nome}` : 'Fila');

  const carregarProcedimentos = useCallback(async () => {
    if (!slug) return;
    try {
      const response = await unitFetch(`/api/fila/${slug}?executor_id=${user?.id}`);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Erro ao carregar fila');
        setLoading(false);
        return;
      }
      const data = await response.json();
      setFila(data);
    } catch {
      setError('Erro ao carregar procedimentos');
    } finally {
      setLoading(false);
    }
  }, [user?.id, unitFetch, slug]);

  useEffect(() => {
    if (user?.id) carregarProcedimentos();
  }, [user?.id, carregarProcedimentos]);

  function confirmarPegarTodos(atendimento_id: number, cliente_nome: string, disponiveis: Procedimento[]) {
    setConfirmDialog({
      isOpen: true,
      title: 'Pegar todos os procedimentos',
      message: `Deseja assumir todos os ${disponiveis.length} procedimento${disponiveis.length !== 1 ? 's' : ''} disponíveis de ${cliente_nome}?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setPegando(atendimento_id);
        try {
          await Promise.all(
            disponiveis.map(proc =>
              unitFetch(`/api/atendimentos/${proc.atendimento_id}/itens/${proc.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ executor_id: user?.id }),
              })
            )
          );
          await carregarProcedimentos();
        } catch {
          setError('Erro ao assumir procedimentos');
        } finally {
          setPegando(null);
        }
      },
    });
  }

  if (loading) return <div className="p-6"><LoadingState mode="skeleton" lines={5} /></div>;

  if (!fila) {
    return (
      <div className="p-6">
        <Alert type="error">{error || 'Fila indisponível'}</Alert>
      </div>
    );
  }

  const todos = [...fila.meusProcedimentos, ...fila.disponiveis];
  const totalProcedimentos = todos.length;

  const porPaciente = Object.values(
    todos.reduce<Record<number, { atendimento_id: number; cliente_id: number; cliente_nome: string; itens: Procedimento[] }>>(
      (acc, proc) => {
        if (!acc[proc.atendimento_id]) {
          acc[proc.atendimento_id] = {
            atendimento_id: proc.atendimento_id,
            cliente_id: proc.cliente_id,
            cliente_nome: proc.cliente_nome,
            itens: [],
          };
        }
        acc[proc.atendimento_id].itens.push(proc);
        return acc;
      },
      {}
    )
  );

  const detalheHref = (procId: number) => `/fila/${slug}/${procId}`;

  return (
    <div className="p-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader
        title={`Fila ${fila.categoria.nome}`}
        description={`${totalProcedimentos} procedimento${totalProcedimentos !== 1 ? 's' : ''}`}
        actions={
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setVisualizacao('procedimento')}
              className={`flex items-center gap-1.5 px-3 py-2 transition-colors
                ${visualizacao === 'procedimento'
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface text-muted hover:bg-surface-secondary'}`}
            >
              <LayoutList className="w-4 h-4" />
              Procedimento
            </button>
            <button
              onClick={() => setVisualizacao('paciente')}
              className={`flex items-center gap-1.5 px-3 py-2 transition-colors border-l border-border
                ${visualizacao === 'paciente'
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface text-muted hover:bg-surface-secondary'}`}
            >
              <Users className="w-4 h-4" />
              Paciente
            </button>
          </div>
        }
      />

      {totalProcedimentos === 0 ? (
        <EmptyState
          icon={<Activity className="w-7 h-7" />}
          title="Nenhum procedimento na fila"
          description="Quando houver procedimentos pagos, eles aparecerão aqui."
        />
      ) : visualizacao === 'procedimento' ? (
        <div className="space-y-8 mt-6">
          {(() => {
            const porAtendimento = todos.reduce<Record<number, Procedimento[]>>((acc, p) => {
              if (!acc[p.atendimento_id]) acc[p.atendimento_id] = [];
              acc[p.atendimento_id].push(p);
              return acc;
            }, {});

            return (
              <>
                <Section
                  label="Meus Procedimentos"
                  count={fila.meusProcedimentos.length}
                  badgeClass="bg-info-100 text-info-800"
                  empty="Nenhum procedimento atribuído a você ainda."
                >
                  {fila.meusProcedimentos.map(proc => (
                    <ProcedimentoCard
                      key={proc.id}
                      proc={proc}
                      irmaos={(porAtendimento[proc.atendimento_id] ?? []).filter(p => p.id !== proc.id)}
                      onClick={() => router.push(detalheHref(proc.id))}
                    />
                  ))}
                </Section>

                <Section
                  label="Disponíveis para Pegar"
                  count={fila.disponiveis.length}
                  badgeClass="bg-warning-100 text-warning-800"
                  empty="Nenhum procedimento disponível no momento."
                >
                  {fila.disponiveis.map(proc => (
                    <ProcedimentoCard
                      key={proc.id}
                      proc={proc}
                      irmaos={(porAtendimento[proc.atendimento_id] ?? []).filter(p => p.id !== proc.id)}
                      onClick={() => router.push(detalheHref(proc.id))}
                    />
                  ))}
                </Section>
              </>
            );
          })()}
        </div>
      ) : (
        (() => {
          const sorted = [...porPaciente].sort((a, b) => a.cliente_nome.localeCompare(b.cliente_nome));
          const meusPacientes = sorted.filter(g => g.itens.some(p => p.executor_id === user?.id));
          const pacientesDisp = sorted.filter(g => g.itens.every(p => p.executor_id !== user?.id));

          return (
            <div className="space-y-8 mt-6">
              <PacienteSection
                label="Meus Pacientes"
                badgeClass="bg-info-100 text-info-800"
                grupos={meusPacientes}
                empty="Nenhum paciente atribuído a você ainda."
                userId={user?.id}
                pegando={pegando}
                onPegarTodos={confirmarPegarTodos}
                onVerProcedimento={id => router.push(detalheHref(id))}
                onVerProntuario={setDrawerClienteId}
              />
              <PacienteSection
                label="Pacientes Disponíveis"
                badgeClass="bg-warning-100 text-warning-800"
                grupos={pacientesDisp}
                empty="Nenhum paciente disponível no momento."
                userId={user?.id}
                pegando={pegando}
                onPegarTodos={confirmarPegarTodos}
                onVerProcedimento={id => router.push(detalheHref(id))}
                onVerProntuario={setDrawerClienteId}
              />
            </div>
          );
        })()
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel="Pegar todos"
        type="info"
      />
      <ProntuarioDrawer
        clienteId={drawerClienteId}
        open={drawerClienteId !== null}
        onClose={() => setDrawerClienteId(null)}
      />
    </div>
  );
}

function Section({
  label, count, badgeClass, empty, children,
}: {
  label: string;
  count: number;
  badgeClass: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-neutral-800 mb-4 flex items-center gap-2">
        <span className={`px-3 py-1 rounded-full text-sm ${badgeClass}`}>{label}</span>
        <span className="text-muted text-sm font-normal">({count})</span>
      </h2>
      {count === 0 ? (
        <div className="bg-surface-secondary p-4 rounded-lg text-center text-muted">{empty}</div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

interface GrupoPaciente {
  atendimento_id: number;
  cliente_id: number;
  cliente_nome: string;
  itens: Procedimento[];
}

function PacienteSection({
  label, badgeClass, grupos, empty, userId, pegando, onPegarTodos, onVerProcedimento, onVerProntuario,
}: {
  label: string;
  badgeClass: string;
  grupos: GrupoPaciente[];
  empty: string;
  userId?: number;
  pegando: number | null;
  onPegarTodos: (atendimento_id: number, cliente_nome: string, disp: Procedimento[]) => void;
  onVerProcedimento: (id: number) => void;
  onVerProntuario: (clienteId: number) => void;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-neutral-800 mb-4 flex items-center gap-2">
        <span className={`px-3 py-1 rounded-full text-sm ${badgeClass}`}>{label}</span>
        <span className="text-muted text-sm font-normal">({grupos.length})</span>
      </h2>
      {grupos.length === 0 ? (
        <div className="bg-surface-secondary p-4 rounded-lg text-center text-muted">{empty}</div>
      ) : (
        <div className="space-y-3">
          {grupos.map(grupo => {
            const meus = grupo.itens.filter(p => p.executor_id === userId);
            const disp = grupo.itens.filter(p => p.executor_id !== userId);
            const carregandoEste = pegando === grupo.atendimento_id;
            return (
              <Card key={grupo.atendimento_id} variant="outlined">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{grupo.cliente_nome}</h3>
                    <p className="text-xs text-muted">Atendimento #{grupo.atendimento_id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onVerProntuario(grupo.cliente_id)}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg border border-border text-muted hover:text-primary-700 hover:border-primary-300 hover:bg-primary-50 transition-colors"
                      title="Ver prontuário"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Prontuário</span>
                    </button>
                    {disp.length > 0 && (
                      <button
                        onClick={() => onPegarTodos(grupo.atendimento_id, grupo.cliente_nome, disp)}
                        disabled={carregandoEste}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                      >
                        {carregandoEste
                          ? 'Pegando...'
                          : `Pegar todos${disp.length < grupo.itens.length ? ` (${disp.length})` : ''}`}
                      </button>
                    )}
                    <span className="text-xs text-muted bg-surface-secondary px-2 py-1 rounded-full">
                      {grupo.itens.length} proc.
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  {[...meus, ...disp].map(proc => (
                    <button
                      key={proc.id}
                      onClick={() => onVerProcedimento(proc.id)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {proc.executor_id === userId && (
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-info-500" title="Meu procedimento" />
                        )}
                        <span className="text-sm font-medium text-foreground group-hover:text-primary-700">
                          <NomeProcedimento proc={proc} />
                        </span>
                      </div>
                      <StatusBadge type="item" status={proc.status} />
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProcedimentoCard({ proc, irmaos, onClick }: { proc: Procedimento; irmaos: Procedimento[]; onClick: () => void }) {
  return (
    <Card variant="outlined" borderColor="border-info-500" onClick={onClick}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">
            <NomeProcedimento proc={proc} />
          </h3>
          <p className="text-sm text-neutral-600">{proc.cliente_nome}</p>
          <p className="text-xs text-neutral-400">Atendimento #{proc.atendimento_id}</p>
        </div>
        <StatusBadge type="item" status={proc.status} />
      </div>
      {irmaos.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-light">
          <p className="text-xs text-muted font-medium mb-1.5">Outros procedimentos deste paciente:</p>
          <div className="space-y-1">
            {irmaos.map(irmao => (
              <div key={irmao.id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-neutral-600">
                  <NomeProcedimento proc={irmao} />
                </span>
                <StatusBadge type="item" status={irmao.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
