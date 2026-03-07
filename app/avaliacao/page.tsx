'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader, Card, Badge, Button, LoadingState, Alert } from '@/components/ui';
import { formatarDataHora } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

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
  usePageTitle('Avaliação');
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
      
      // Meus atendimentos: onde EU sou o avaliador (apenas em avaliação)
      const meus = data.filter((a: Atendimento) => 
        a.avaliador_id === user.id && a.status === 'avaliacao'
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

  if (loading) {
    return <LoadingState mode="spinner" text="Carregando..." />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="🔍 Avaliações"
        description="Gerencie suas avaliações odontológicas"
      />

      {/* Info do Avaliador */}
      <Alert type="info">
        <p className="text-sm">
          <strong>👤 Avaliador:</strong> {user?.nome}
        </p>
        <p className="text-xs mt-1 opacity-80">
          Você verá apenas o nome do cliente durante a avaliação. 
          Dados pessoais (CPF, telefone, email) ficam ocultos.
        </p>
      </Alert>

      {/* Seção: Meus Atendimentos */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900">📋 Meus Atendimentos</h2>
          <Badge color="blue">{meusAtendimentos.length}</Badge>
        </div>

        {meusAtendimentos.length === 0 ? (
          <Card variant="outlined">
            <div className="text-center py-4">
              <p className="text-gray-500">Você não tem atendimentos atribuídos</p>
              <p className="text-sm text-gray-400 mt-1">
                Assuma um atendimento da lista abaixo para começar
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {meusAtendimentos.map((atendimento) => (
              <Card 
                key={atendimento.id} 
                variant="outlined"
                borderColor="border-blue-500"
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
                          Atendimento #{atendimento.id} • {formatarDataHora(atendimento.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Badge color="blue">Em Avaliação</Badge>
                    
                    <Link href={`/avaliacao/${atendimento.id}`}>
                      <Button>Continuar</Button>
                    </Link>
                  </div>
                </div>
              </Card>
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
          <Badge color="gray">{atendimentosDisponiveis.length}</Badge>
        </div>
        
        <p className="text-sm text-gray-500">
          Atendimentos sem avaliador definido. Clique em &quot;Assumir&quot; para se tornar responsável.
        </p>

        {atendimentosDisponiveis.length === 0 ? (
          <Card variant="outlined">
            <div className="text-center py-4">
              <p className="text-green-700 text-lg">🎉 Nenhum atendimento disponível!</p>
              <p className="text-green-600 text-sm mt-1">
                Todos os atendimentos já têm um avaliador responsável.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {atendimentosDisponiveis.map((atendimento) => (
              <Card 
                key={atendimento.id} 
                variant="outlined"
                borderColor="border-yellow-500"
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
                          Atendimento #{atendimento.id} • {formatarDataHora(atendimento.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Badge color="amber">Sem Avaliador</Badge>
                    
                    <Button variant="secondary" onClick={() => handleAssumirAtendimento(atendimento.id)}>
                      ✋ Assumir
                    </Button>
                  </div>
                </div>
              </Card>
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
