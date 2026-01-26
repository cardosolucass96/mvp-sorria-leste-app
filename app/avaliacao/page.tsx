'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface Atendimento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  avaliador_id: number | null;
  avaliador_nome: string | null;
  status: string;
  created_at: string;
}

export default function AvaliacaoPage() {
  const { user } = useAuth();
  const [atendimentosDisponiveis, setAtendimentosDisponiveis] = useState<Atendimento[]>([]);
  const [meusAtendimentos, setMeusAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarAtendimentos = useCallback(async () => {
    if (!user) return;
    
    try {
      const res = await fetch('/api/atendimentos');
      const data = await res.json();
      
      // Atendimentos disponíveis: em avaliação SEM avaliador definido
      const disponiveis = data.filter((a: Atendimento) => 
        a.status === 'avaliacao' && !a.avaliador_id
      );
      
      // Meus atendimentos: onde EU sou o avaliador (em avaliação ou triagem)
      const meus = data.filter((a: Atendimento) => 
        a.avaliador_id === user.id && 
        (a.status === 'triagem' || a.status === 'avaliacao')
      );
      
      setAtendimentosDisponiveis(disponiveis);
      setMeusAtendimentos(meus);
    } catch (error) {
      console.error('Erro ao carregar atendimentos:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    carregarAtendimentos();
  }, [carregarAtendimentos]);

  const handleAssumirAtendimento = async (atendimentoId: number) => {
    if (!user) return;
    
    try {
      const res = await fetch(`/api/atendimentos/${atendimentoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          avaliador_id: user.id 
        }),
      });
      
      if (res.ok) {
        // Recarrega a lista
        await carregarAtendimentos();
      }
    } catch (error) {
      console.error('Erro ao assumir atendimento:', error);
    }
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🔍 Avaliações</h1>
        <p className="text-gray-600">
          Gerencie suas avaliações odontológicas
        </p>
      </div>

      {/* Info do Avaliador */}
      <div className="card bg-blue-50 border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>👤 Avaliador:</strong> {user?.nome}
        </p>
        <p className="text-xs text-blue-600 mt-1">
          Você verá apenas o nome do cliente durante a avaliação. 
          Dados pessoais (CPF, telefone, email) ficam ocultos.
        </p>
      </div>

      {/* Seção: Meus Atendimentos */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900">📋 Meus Atendimentos</h2>
          <span className="badge badge-primary">{meusAtendimentos.length}</span>
        </div>

        {meusAtendimentos.length === 0 ? (
          <div className="card bg-gray-50 text-center py-8">
            <p className="text-gray-500">Você não tem atendimentos atribuídos</p>
            <p className="text-sm text-gray-400 mt-1">
              Assuma um atendimento da lista abaixo para começar
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {meusAtendimentos.map((atendimento) => (
              <div 
                key={atendimento.id} 
                className="card border-l-4 border-l-blue-500 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🦷</span>
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">
                          {atendimento.cliente_nome}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Atendimento #{atendimento.id} • {formatarData(atendimento.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="badge badge-info">
                      {atendimento.status === 'triagem' ? 'Triagem' : 'Em Avaliação'}
                    </span>
                    
                    <Link
                      href={`/avaliacao/${atendimento.id}`}
                      className="btn btn-primary"
                    >
                      {atendimento.status === 'triagem' ? 'Iniciar Avaliação' : 'Continuar'}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divisor */}
      <hr className="border-gray-200" />

      {/* Seção: Atendimentos Disponíveis */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900">🆓 Atendimentos Disponíveis</h2>
          <span className="badge badge-secondary">{atendimentosDisponiveis.length}</span>
        </div>
        
        <p className="text-sm text-gray-500">
          Atendimentos sem avaliador definido. Clique em "Assumir" para se tornar responsável.
        </p>

        {atendimentosDisponiveis.length === 0 ? (
          <div className="card bg-green-50 text-center py-8">
            <p className="text-green-700 text-lg">🎉 Nenhum atendimento disponível!</p>
            <p className="text-green-600 text-sm mt-1">
              Todos os atendimentos já têm um avaliador responsável.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {atendimentosDisponiveis.map((atendimento) => (
              <div 
                key={atendimento.id} 
                className="card border-l-4 border-l-yellow-500 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🆕</span>
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">
                          {atendimento.cliente_nome}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Atendimento #{atendimento.id} • {formatarData(atendimento.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="badge badge-warning">Sem Avaliador</span>
                    
                    <button
                      onClick={() => handleAssumirAtendimento(atendimento.id)}
                      className="btn btn-secondary"
                    >
                      ✋ Assumir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resumo */}
      <div className="text-sm text-gray-500 pt-4 border-t">
        <div className="flex gap-6">
          <span>Meus: <strong>{meusAtendimentos.length}</strong></span>
          <span>Disponíveis: <strong>{atendimentosDisponiveis.length}</strong></span>
        </div>
      </div>
    </div>
  );
}
