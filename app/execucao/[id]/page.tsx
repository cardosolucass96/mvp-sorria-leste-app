'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number | null;
  valor: number;
  valor_pago: number;
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

interface Nota {
  id: number;
  texto: string;
  usuario_nome: string;
  created_at: string;
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

export default function ExecucaoProcedimentoPage() {
  const params = useParams();
  const { user } = useAuth();
  const router = useRouter();
  const [item, setItem] = useState<ItemAtendimento | null>(null);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNovoProcedimento, setShowNovoProcedimento] = useState(false);
  const [novoProcedimento, setNovoProcedimento] = useState({
    procedimento_id: '',
  });
  const [novaNota, setNovaNota] = useState('');
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [descricaoAnexo, setDescricaoAnexo] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (params.id) {
      carregarItem();
      carregarProcedimentos();
      carregarNotas();
      carregarAnexos();
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

  async function carregarNotas() {
    try {
      const response = await fetch(`/api/execucao/item/${params.id}/notas`);
      const data = await response.json();
      setNotas(data);
    } catch (error) {
      console.error('Erro ao carregar notas:', error);
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

  async function adicionarNota() {
    if (!novaNota.trim() || !user) return;
    
    setEnviandoNota(true);
    try {
      const response = await fetch(`/api/execucao/item/${params.id}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: user.id,
          texto: novaNota,
        }),
      });

      if (response.ok) {
        setNovaNota('');
        carregarNotas();
      }
    } catch (error) {
      console.error('Erro ao adicionar nota:', error);
    }
    setEnviandoNota(false);
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
        alert(data.error || 'Erro ao enviar arquivo');
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
      alert('Selecione um procedimento');
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
        alert(`Procedimento adicionado para ${item.cliente_nome}! O atendimento voltou para Aguardando Pagamento.`);
        router.push('/execucao');
      }
    } catch (error) {
      console.error('Erro ao adicionar procedimento:', error);
    }
  }

  function getStatusBadge(status: string) {
    const badges: Record<string, string> = {
      pago: 'bg-green-100 text-green-800',
      executando: 'bg-blue-100 text-blue-800',
      concluido: 'bg-gray-100 text-gray-800',
    };
    
    const labels: Record<string, string> = {
      pago: 'Aguardando Execução',
      executando: 'Em Execução',
      concluido: 'Concluído',
    };

    return (
      <span className={`px-3 py-1 text-sm font-semibold rounded ${badges[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  }

  function formatarData(dataString: string) {
    const data = new Date(dataString);
    return data.toLocaleString('pt-BR');
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded">
          Procedimento não encontrado
        </div>
        <button
          onClick={() => router.push('/execucao')}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          ← Voltar para a fila
        </button>
      </div>
    );
  }

  const isMeuProcedimento = item.executor_id === user?.id;
  const isDisponivel = item.executor_id === null;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => router.push('/execucao')}
        className="text-blue-600 hover:text-blue-800 mb-4"
      >
        ← Voltar para a fila
      </button>

      {/* Card Principal do Procedimento */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{item.procedimento_nome}</h1>
            <p className="text-lg text-gray-600 mt-1">{item.cliente_nome}</p>
            <p className="text-sm text-gray-400">Atendimento #{item.atendimento_id}</p>
          </div>
          {getStatusBadge(item.status)}
        </div>

        {/* Badges de estado */}
        <div className="mb-4">
          {isDisponivel && (
            <span className="inline-block px-3 py-1 text-sm font-semibold rounded bg-yellow-100 text-yellow-800">
              📋 Disponível para execução
            </span>
          )}
          {isMeuProcedimento && item.status !== 'concluido' && (
            <span className="inline-block px-3 py-1 text-sm font-semibold rounded bg-blue-100 text-blue-800">
              👤 Meu procedimento
            </span>
          )}
        </div>

        {/* Info de conclusão */}
        {item.concluido_at && (
          <div className="bg-green-50 border border-green-200 p-3 rounded mb-4">
            <p className="text-sm text-green-800">
              ✓ Concluído em {formatarData(item.concluido_at)}
            </p>
          </div>
        )}

        {/* Info de adição */}
        <div className="text-sm text-gray-500 mb-4">
          Adicionado em {formatarData(item.created_at)}
          {item.criado_por_nome && ` por ${item.criado_por_nome}`}
        </div>

        {/* Botões de Ação */}
        <div className="space-y-3">
          {/* Procedimento disponível - pegar */}
          {isDisponivel && item.status === 'pago' && (
            <button
              onClick={pegarProcedimento}
              className="w-full bg-yellow-500 text-white px-4 py-3 rounded-lg hover:bg-yellow-600 font-semibold text-lg"
            >
              🙋 Pegar Este Procedimento
            </button>
          )}

          {/* Procedimento meu e pago - iniciar */}
          {isMeuProcedimento && item.status === 'pago' && (
            <button
              onClick={iniciarExecucao}
              className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 font-semibold text-lg"
            >
              ▶️ Iniciar Execução
            </button>
          )}

          {/* Procedimento em execução - concluir */}
          {isMeuProcedimento && item.status === 'executando' && (
            <button
              onClick={marcarComoConcluido}
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 font-semibold text-lg"
            >
              ✅ Marcar como Concluído
            </button>
          )}

          {/* Procedimento concluído */}
          {item.status === 'concluido' && (
            <div className="w-full text-center text-gray-600 py-3 bg-gray-100 rounded-lg">
              ✓ Procedimento concluído
            </div>
          )}
        </div>
      </div>

      {/* Botão Adicionar Procedimento - apenas se for MEU procedimento */}
      {isMeuProcedimento && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Ações Adicionais</h2>
          
          <button
            onClick={() => setShowNovoProcedimento(true)}
            className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 font-semibold"
          >
            ➕ Adicionar Procedimento para {item.cliente_nome}
          </button>
        </div>
      )}

      {/* Seção de Notas */}
      {(isMeuProcedimento || item.status === 'concluido') && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-bold text-gray-800 mb-4">📝 Notas de Execução</h2>
          
          {/* Formulário para adicionar nota */}
          {isMeuProcedimento && item.status !== 'concluido' && (
            <div className="mb-4">
              <textarea
                value={novaNota}
                onChange={(e) => setNovaNota(e.target.value)}
                placeholder="Adicione uma nota sobre este procedimento..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                rows={3}
              />
              <button
                onClick={adicionarNota}
                disabled={enviandoNota || !novaNota.trim()}
                className="mt-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {enviandoNota ? 'Salvando...' : '💾 Salvar Nota'}
              </button>
            </div>
          )}

          {/* Lista de notas */}
          <div className="space-y-3">
            {notas.length > 0 ? (
              notas.map((nota) => (
                <div key={nota.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="text-gray-800 whitespace-pre-wrap">{nota.texto}</p>
                  <div className="mt-2 text-xs text-gray-500">
                    Por <strong>{nota.usuario_nome}</strong> em {formatarData(nota.created_at)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">Nenhuma nota registrada</p>
            )}
          </div>
        </div>
      )}

      {/* Seção de Anexos */}
      {(isMeuProcedimento || item.status === 'concluido') && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-bold text-gray-800 mb-4">📎 Anexos e Imagens</h2>
          
          {/* Upload de arquivos */}
          {isMeuProcedimento && item.status !== 'concluido' && (
            <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="mb-2">
                <input
                  type="text"
                  value={descricaoAnexo}
                  onChange={(e) => setDescricaoAnexo(e.target.value)}
                  placeholder="Descrição do arquivo (opcional)"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={enviarAnexo}
                disabled={enviandoAnexo}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              />
              <p className="mt-2 text-xs text-gray-500">
                Formatos aceitos: JPG, PNG, GIF, WebP, PDF (máx. 10MB)
              </p>
              {enviandoAnexo && (
                <p className="mt-2 text-sm text-orange-600">⏳ Enviando arquivo...</p>
              )}
            </div>
          )}

          {/* Lista de anexos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {anexos.length > 0 ? (
              anexos.map((anexo) => (
                <div key={anexo.id} className="border rounded-lg overflow-hidden">
                  {anexo.tipo_arquivo.startsWith('image/') ? (
                    <a href={anexo.caminho} target="_blank" rel="noopener noreferrer">
                      <Image
                        src={anexo.caminho}
                        alt={anexo.nome_arquivo}
                        width={300}
                        height={200}
                        className="w-full h-40 object-cover hover:opacity-90"
                      />
                    </a>
                  ) : (
                    <a
                      href={anexo.caminho}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center h-40 bg-gray-100 hover:bg-gray-200"
                    >
                      <span className="text-4xl">📄</span>
                    </a>
                  )}
                  <div className="p-3">
                    <p className="font-medium text-sm truncate" title={anexo.nome_arquivo}>
                      {anexo.nome_arquivo}
                    </p>
                    {anexo.descricao && (
                      <p className="text-xs text-gray-600 mt-1">{anexo.descricao}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {(anexo.tamanho / 1024).toFixed(1)} KB • {formatarData(anexo.created_at)}
                    </p>
                    <p className="text-xs text-gray-400">Por {anexo.usuario_nome}</p>
                    {isMeuProcedimento && item.status !== 'concluido' && (
                      <button
                        onClick={() => removerAnexo(anexo.id)}
                        className="mt-2 text-xs text-red-600 hover:text-red-800"
                      >
                        🗑️ Remover
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm col-span-2">Nenhum anexo</p>
            )}
          </div>
        </div>
      )}

      {/* Info para procedimentos disponíveis */}
      {isDisponivel && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p className="text-sm text-yellow-800">
            📋 Este procedimento está disponível. <strong>Pegue-o primeiro</strong> para poder adicionar novos procedimentos para este cliente.
          </p>
        </div>
      )}

      {/* Modal Adicionar Procedimento */}
      {showNovoProcedimento && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-2">Adicionar Procedimento</h3>
            <p className="text-sm text-gray-600 mb-4">
              Para: <strong>{item.cliente_nome}</strong>
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Procedimento</label>
              <select
                value={novoProcedimento.procedimento_id}
                onChange={(e) =>
                  setNovoProcedimento({ ...novoProcedimento, procedimento_id: e.target.value })
                }
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">Selecione...</option>
                {procedimentos.map((proc) => (
                  <option key={proc.id} value={proc.id}>
                    {proc.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded mb-4">
              <p className="text-sm text-yellow-800">
                ⚠️ Ao adicionar um procedimento, o atendimento voltará para <strong>Aguardando Pagamento</strong>.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={adicionarProcedimento}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Adicionar
              </button>
              <button
                onClick={() => {
                  setShowNovoProcedimento(false);
                  setNovoProcedimento({ procedimento_id: '' });
                }}
                className="flex-1 bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
