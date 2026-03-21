'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { formatarDataHora } from '@/lib/utils/formatters';
import { StatusBadge } from '@/components/domain';
import { Activity, Save, Paperclip, FileText } from 'lucide-react';
import { Alert, LoadingState, Modal, PageHeader, Card, Button, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import usePageTitle from '@/lib/utils/usePageTitle';

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number | null;
  valor: number;
  valor_pago: number;
  dentes: string | null;
  quantidade: number;
  por_dente: number;
  status: string;
  created_at: string;
  concluido_at: string | null;
  procedimento_nome: string;
  executor_nome: string | null;
  criado_por_nome: string | null;
  cliente_nome: string;
  cliente_id: number;
}

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
}

interface Anexo {
  id: number;
  nome_arquivo: string;
  tipo_arquivo: string;
  caminho: string;
  tamanho: number;
  descricao: string | null;
  usuario_nome: string;
  created_at: string;
}

interface Prontuario {
  id: number;
  item_atendimento_id: number;
  usuario_id: number;
  usuario_nome: string;
  descricao: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

const MIN_CARACTERES_PRONTUARIO = 50;

export default function ExecucaoProcedimentoPage() {
  usePageTitle('Execução de Procedimento');
  const params = useParams();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [item, setItem] = useState<ItemAtendimento | null>(null);
  const [error, setError] = useState('');
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNovoProcedimento, setShowNovoProcedimento] = useState(false);
  const [novoProcedimento, setNovoProcedimento] = useState({
    procedimento_id: '',
  });
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [descricaoAnexo, setDescricaoAnexo] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Prontuário
  const [prontuario, setProntuario] = useState<Prontuario | null>(null);
  const [descricaoProntuario, setDescricaoProntuario] = useState('');
  const [observacoesProntuario, setObservacoesProntuario] = useState('');
  const [salvandoProntuario, setSalvandoProntuario] = useState(false);
  const [erroProntuario, setErroProntuario] = useState('');

  useEffect(() => {
    if (params.id) {
      carregarItem();
      carregarProcedimentos();
      carregarAnexos();
      carregarProntuario();
    }
  }, [params.id]);

  async function carregarItem() {
    try {
      const response = await fetch(`/api/execucao/item/${params.id}`);
      if (!response.ok) {
        throw new Error('Item não encontrado');
      }
      const data = await response.json();
      setItem(data);
    } catch (error) {
      console.error('Erro ao carregar procedimento:', error);
      setError('Erro ao carregar procedimento');
    } finally {
      setLoading(false);
    }
  }

  async function carregarProcedimentos() {
    try {
      const response = await fetch('/api/procedimentos');
      const data = await response.json();
      setProcedimentos(data);
    } catch (error) {
      console.error('Erro ao carregar procedimentos:', error);
    }
  }

  async function carregarAnexos() {
    try {
      const response = await fetch(`/api/execucao/item/${params.id}/anexos`);
      const data = await response.json();
      setAnexos(data);
    } catch (error) {
      console.error('Erro ao carregar anexos:', error);
    }
  }

  async function carregarProntuario() {
    try {
      const response = await fetch(`/api/execucao/item/${params.id}/prontuario`);
      const data = await response.json();
      if (data.prontuario) {
        setProntuario(data.prontuario);
        setDescricaoProntuario(data.prontuario.descricao);
        setObservacoesProntuario(data.prontuario.observacoes || '');
      }
    } catch (error) {
      console.error('Erro ao carregar prontuário:', error);
    }
  }

  async function salvarProntuario() {
    if (!user) return;
    
    if (descricaoProntuario.trim().length < MIN_CARACTERES_PRONTUARIO) {
      setErroProntuario(`A descrição deve ter no mínimo ${MIN_CARACTERES_PRONTUARIO} caracteres`);
      return;
    }
    
    setSalvandoProntuario(true);
    setErroProntuario('');
    
    try {
      const response = await fetch(`/api/execucao/item/${params.id}/prontuario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: user.id,
          descricao: descricaoProntuario,
          observacoes: observacoesProntuario,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setProntuario(data.prontuario);
        toast.success('Prontuário salvo com sucesso!');
      } else {
        const data = await response.json();
        setErroProntuario(data.error || 'Erro ao salvar prontuário');
      }
    } catch (error) {
      console.error('Erro ao salvar prontuário:', error);
      setErroProntuario('Erro ao salvar prontuário');
    }
    setSalvandoProntuario(false);
  }

  async function enviarAnexo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setEnviandoAnexo(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', user.id.toString());
      formData.append('descricao', descricaoAnexo);

      const response = await fetch(`/api/execucao/item/${params.id}/anexos`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setDescricaoAnexo('');
        carregarAnexos();
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erro ao enviar arquivo');
      }
    } catch (error) {
      console.error('Erro ao enviar anexo:', error);
    }
    setEnviandoAnexo(false);
  }

  async function removerAnexo(anexoId: number) {
    if (!confirm('Tem certeza que deseja remover este anexo?')) return;

    try {
      const response = await fetch(`/api/execucao/item/${params.id}/anexos?anexo_id=${anexoId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        carregarAnexos();
      }
    } catch (error) {
      console.error('Erro ao remover anexo:', error);
    }
  }

  async function marcarComoConcluido() {
    if (!item) return;
    
    // Verificar se o prontuário foi preenchido
    if (!prontuario) {
      toast.warning('Preencha o PRONTUÁRIO antes de concluir o procedimento.');
      return;
    }
    
    if (!confirm('Tem certeza que deseja marcar este procedimento como concluído?\n\nEsta ação não pode ser desfeita.')) {
      return;
    }
    
    try {
      const response = await fetch(
        `/api/atendimentos/${item.atendimento_id}/itens/${item.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'concluido' }),
        }
      );

      if (response.ok) {
        carregarItem();
      }
    } catch (error) {
      console.error('Erro ao marcar procedimento como concluído:', error);
    }
  }

  async function iniciarExecucao() {
    if (!item) return;
    try {
      const response = await fetch(
        `/api/atendimentos/${item.atendimento_id}/itens/${item.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'executando' }),
        }
      );

      if (response.ok) {
        carregarItem();
      }
    } catch (error) {
      console.error('Erro ao iniciar execução:', error);
    }
  }

  async function pegarProcedimento() {
    if (!item) return;
    try {
      const response = await fetch(
        `/api/atendimentos/${item.atendimento_id}/itens/${item.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executor_id: user?.id }),
        }
      );

      if (response.ok) {
        carregarItem();
      }
    } catch (error) {
      console.error('Erro ao pegar procedimento:', error);
    }
  }

  async function adicionarProcedimento() {
    if (!item || !novoProcedimento.procedimento_id) {
      toast.warning('Selecione um procedimento');
      return;
    }

    try {
      const response = await fetch(`/api/atendimentos/${item.atendimento_id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: parseInt(novoProcedimento.procedimento_id),
          executor_id: user?.id,
          criado_por_id: user?.id,
        }),
      });

      if (response.ok) {
        setShowNovoProcedimento(false);
        setNovoProcedimento({ procedimento_id: '' });
        toast.success(`Procedimento adicionado para ${item.cliente_nome}! Atendimento voltou para Aguardando Pagamento.`);
        router.push('/execucao');
      }
    } catch (error) {
      console.error('Erro ao adicionar procedimento:', error);
    }
  }

  if (loading) {
    return <LoadingState text="Carregando procedimento..." />;
  }

  if (!item) {
    return (
      <EmptyState
        icon={<Activity className="w-7 h-7" />}
        title="Procedimento não encontrado"
        actionLabel="Voltar para fila"
        onAction={() => router.push('/execucao')}
      />
    );
  }

  const isMeuProcedimento = item.executor_id === user?.id;
  const isDisponivel = item.executor_id === null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={item.procedimento_nome}
        icon={<Activity className="w-7 h-7" />}
        description={`${item.cliente_nome} · Atendimento #${item.atendimento_id}`}
        breadcrumb={[
          { label: 'Execução', href: '/execucao' },
          { label: item.procedimento_nome },
        ]}
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      {/* Card Principal do Procedimento */}
      <Card>
        <div className="flex justify-between items-start mb-4">
          <StatusBadge type="item" status={item.status} />
        </div>

        {/* Dentes selecionados */}
        {item.dentes && (() => {
          try {
            const dentesArray = JSON.parse(item.dentes) as string[];
            if (dentesArray.length > 0) {
              return (
                <div className="mb-4 p-4 bg-primary-50 border border-primary-200 rounded-lg">
                  <p className="text-sm font-semibold text-primary-800 mb-2">
                    Dentes a serem tratados ({dentesArray.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dentesArray.sort((a, b) => Number(a) - Number(b)).map((dente) => (
                      <span
                        key={dente}
                        className="px-3 py-1 bg-primary-600 text-white text-sm font-bold rounded-full"
                      >
                        {dente}
                      </span>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          } catch {
            return null;
          }
        })()}

        {/* Badges de estado */}
        <div className="mb-4">
          {isDisponivel && (
            <span className="inline-block px-3 py-1 text-sm font-semibold rounded bg-yellow-100 text-yellow-800">
              Disponível para execução
            </span>
          )}
          {isMeuProcedimento && item.status !== 'concluido' && (
            <span className="inline-block px-3 py-1 text-sm font-semibold rounded bg-info-100 text-info-800">
              Meu procedimento
            </span>
          )}
        </div>

        {/* Info de conclusão */}
        {item.concluido_at && (
          <div className="bg-success-50 border border-success-200 p-3 rounded mb-4">
            <p className="text-sm text-success-800">
              Concluído em {formatarDataHora(item.concluido_at)}
            </p>
          </div>
        )}

        {/* Info de adição */}
        <div className="text-sm text-muted mb-4">
          Adicionado em {formatarDataHora(item.created_at)}
          {item.criado_por_nome && ` por ${item.criado_por_nome}`}
        </div>

        {/* Botões de Ação */}
        <div className="space-y-3">
          {/* Procedimento disponível - pegar */}
          {isDisponivel && item.status === 'pago' && (
            <Button
              onClick={pegarProcedimento}
              className="w-full text-lg py-3"
              variant="secondary"
            >
              Pegar Este Procedimento
            </Button>
          )}

          {/* Procedimento meu e pago - iniciar */}
          {isMeuProcedimento && item.status === 'pago' && (
            <Button
              onClick={iniciarExecucao}
              className="w-full text-lg py-3"
            >
              Iniciar Execução
            </Button>
          )}

          {/* Procedimento em execução - concluir */}
          {isMeuProcedimento && item.status === 'executando' && (
            <div className="space-y-2">
              {!prontuario && (
                <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-sm text-yellow-800">
                  <strong>Prontuário pendente:</strong> Preencha o prontuário abaixo antes de concluir.
                </div>
              )}
              <Button
                onClick={marcarComoConcluido}
                disabled={!prontuario}
                className="w-full text-lg py-3"
              >
                {prontuario ? 'Marcar como Concluído' : 'Preencha o Prontuário para Concluir'}
              </Button>
            </div>
          )}

          {/* Procedimento concluído */}
          {item.status === 'concluido' && (
            <div className="w-full text-center text-neutral-600 py-3 bg-surface-muted rounded-lg">
              Procedimento concluído
            </div>
          )}
        </div>
      </Card>

      {/* Botão Adicionar Procedimento - apenas se for MEU procedimento */}
      {isMeuProcedimento && (
        <Card>
          <h2 className="text-lg font-bold text-neutral-800 mb-4">Ações Adicionais</h2>
          
          <Button
            onClick={() => setShowNovoProcedimento(true)}
            className="w-full"
          >
            Adicionar Procedimento para {item.cliente_nome}
          </Button>
        </Card>
      )}

      {/* Seção de Prontuário - OBRIGATÓRIO para conclusão */}
      {(isMeuProcedimento && item.status === 'executando') || prontuario ? (
        <Card className={!prontuario && item.status === 'executando' ? 'ring-2 ring-error-400' : ''}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-neutral-800">
              Prontuário {!prontuario && item.status === 'executando' && <span className="text-error-600">*</span>}
            </h2>
            {prontuario && (
              <span className="px-3 py-1 text-sm font-semibold rounded bg-success-100 text-success-800">
                Preenchido
              </span>
            )}
          </div>
          
          {!prontuario && item.status === 'executando' && (
            <div className="mb-4 p-3 bg-error-50 border border-error-200 rounded-lg">
              <p className="text-sm text-error-700">
                <strong>Obrigatório:</strong> Preencha a descrição do procedimento realizado com no mínimo {MIN_CARACTERES_PRONTUARIO} caracteres para poder concluir.
              </p>
            </div>
          )}

          {/* Formulário de prontuário (apenas durante execução se não concluído) */}
          {isMeuProcedimento && item.status === 'executando' && (
            <div className="space-y-4">
              {erroProntuario && (
                <div className="p-3 bg-error-50 border border-error-200 rounded-lg text-sm text-error-700">
                  {erroProntuario}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Descrição do Procedimento Realizado *
                </label>
                <textarea
                  value={descricaoProntuario}
                  onChange={(e) => setDescricaoProntuario(e.target.value)}
                  placeholder="Descreva detalhadamente o procedimento realizado, materiais utilizados, técnicas aplicadas..."
                  className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
                    descricaoProntuario.length < MIN_CARACTERES_PRONTUARIO ? 'border-error-300' : 'border-success-300'
                  }`}
                  rows={5}
                />
                <div className="flex justify-between mt-1">
                  <span className={`text-xs ${descricaoProntuario.length < MIN_CARACTERES_PRONTUARIO ? 'text-error-600' : 'text-success-600'}`}>
                    {descricaoProntuario.length}/{MIN_CARACTERES_PRONTUARIO} caracteres mínimos
                  </span>
                  {descricaoProntuario.length >= MIN_CARACTERES_PRONTUARIO && (
                    <span className="text-xs text-success-600">Mínimo atingido</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Observações Adicionais (opcional)
                </label>
                <textarea
                  value={observacoesProntuario}
                  onChange={(e) => setObservacoesProntuario(e.target.value)}
                  placeholder="Observações sobre cuidados pós-procedimento, retornos, etc..."
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  rows={3}
                />
              </div>

              <Button
                onClick={salvarProntuario}
                disabled={salvandoProntuario || descricaoProntuario.trim().length < MIN_CARACTERES_PRONTUARIO}
                loading={salvandoProntuario}
                className="w-full"
              >
                <Save className="w-4 h-4 mr-1.5 inline-block" aria-hidden="true" />
                {prontuario ? 'Atualizar Prontuário' : 'Salvar Prontuário'}
              </Button>

              {/* Anexos dentro do prontuário */}
              <div className="pt-4 border-t border-neutral-200">
                <h3 className="text-md font-semibold text-neutral-700 mb-3 flex items-center gap-2"><Paperclip className="w-4 h-4" aria-hidden="true" /> Anexos e Imagens</h3>
                
                <div className="p-4 border-2 border-dashed border-neutral-300 rounded-lg mb-4">
                  <div className="mb-2">
                    <input
                      type="text"
                      value={descricaoAnexo}
                      onChange={(e) => setDescricaoAnexo(e.target.value)}
                      placeholder="Descrição do arquivo (opcional)"
                      className="w-full border border-neutral-300 rounded px-3 py-2 text-sm mb-2"
                    />
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx"
                    onChange={enviarAnexo}
                    disabled={enviandoAnexo}
                    className="block w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                  />
                  <p className="mt-2 text-xs text-muted">
                    Imagens (máx. 10MB) · Vídeos (máx. 50MB) · Documentos (máx. 10MB)
                  </p>
                  {enviandoAnexo && (
                    <p className="mt-2 text-sm text-primary-600">Enviando arquivo...</p>
                  )}
                </div>

                {/* Lista de anexos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {anexos.length > 0 ? (
                    anexos.map((anexo) => {
                      const arquivoUrl = `/api/arquivos/${anexo.caminho}`;
                      const isImage = anexo.tipo_arquivo.startsWith('image/');
                      const isVideo = anexo.tipo_arquivo.startsWith('video/');
                      
                      return (
                        <div key={anexo.id} className="border rounded-lg overflow-hidden">
                          {isImage ? (
                            <a href={arquivoUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={arquivoUrl}
                                alt={anexo.nome_arquivo}
                                className="w-full h-32 object-cover hover:opacity-90"
                              />
                            </a>
                          ) : isVideo ? (
                            <video
                              src={arquivoUrl}
                              controls
                              className="w-full h-32 object-cover bg-black"
                            />
                          ) : (
                            <a
                              href={`${arquivoUrl}?download=true`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center h-32 bg-surface-muted hover:bg-neutral-200"
                            >
                              <FileText className="w-8 h-8 text-neutral-400" aria-hidden="true" />
                            </a>
                          )}
                          <div className="p-2">
                            <p className="font-medium text-xs truncate" title={anexo.nome_arquivo}>
                              {anexo.nome_arquivo}
                            </p>
                            <p className="text-xs text-neutral-400">
                              {(anexo.tamanho / 1024 / 1024).toFixed(2)} MB
                            </p>
                            <button
                              onClick={() => removerAnexo(anexo.id)}
                              className="mt-1 text-xs text-error-600 hover:text-error-800"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-muted text-xs col-span-2">Nenhum anexo adicionado</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Exibir prontuário salvo (para visualização) */}
          {prontuario && (item.status === 'concluido' || !isMeuProcedimento) && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Descrição do Procedimento</label>
                <div className="bg-surface-secondary p-4 rounded-lg border border-neutral-200">
                  <p className="text-neutral-800 whitespace-pre-wrap">{prontuario.descricao}</p>
                </div>
              </div>
              
              {prontuario.observacoes && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Observações</label>
                  <div className="bg-surface-secondary p-4 rounded-lg border border-neutral-200">
                    <p className="text-neutral-800 whitespace-pre-wrap">{prontuario.observacoes}</p>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted">
                Preenchido por <strong>{prontuario.usuario_nome}</strong> em {formatarDataHora(prontuario.created_at)}
                {prontuario.updated_at !== prontuario.created_at && (
                  <> · Atualizado em {formatarDataHora(prontuario.updated_at)}</>
                )}
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {/* Info para procedimentos disponíveis */}
      {isDisponivel && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p className="text-sm text-yellow-800">
            Este procedimento está disponível. <strong>Pegue-o primeiro</strong> para poder adicionar novos procedimentos para este cliente.
          </p>
        </div>
      )}

      {/* Modal Adicionar Procedimento */}
      <Modal
        isOpen={showNovoProcedimento}
        onClose={() => {
          setShowNovoProcedimento(false);
          setNovoProcedimento({ procedimento_id: '' });
        }}
        title="Adicionar Procedimento"
      >
        <p className="text-sm text-neutral-600 mb-4">
          Para: <strong>{item.cliente_nome}</strong>
        </p>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Procedimento</label>
          <select
            value={novoProcedimento.procedimento_id}
            onChange={(e) =>
              setNovoProcedimento({ ...novoProcedimento, procedimento_id: e.target.value })
            }
            className="w-full border border-neutral-300 rounded px-3 py-2"
          >
            <option value="">Selecione...</option>
            {procedimentos.map((proc) => (
              <option key={proc.id} value={proc.id}>
                {proc.nome}
              </option>
            ))}
          </select>
        </div>

        <Alert type="warning">Ao adicionar um procedimento, o atendimento voltará para Aguardando Pagamento.</Alert>

        <div className="flex gap-2 mt-4">
          <Button
            onClick={adicionarProcedimento}
            className="flex-1"
          >
            Adicionar
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setShowNovoProcedimento(false);
              setNovoProcedimento({ procedimento_id: '' });
            }}
            className="flex-1"
          >
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
