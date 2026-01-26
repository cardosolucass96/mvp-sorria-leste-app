'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { user, hasRole } = useAuth();

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          🦷 Bem-vindo, {user?.nome?.split(' ')[0]}!
        </h1>
        <p className="mt-2 text-gray-600">
          Sistema de Gestão Odontológica - MVP
        </p>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-full">
              <span className="text-2xl">👥</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Clientes</p>
              <p className="text-2xl font-bold">--</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-full">
              <span className="text-2xl">📋</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Atendimentos Hoje</p>
              <p className="text-2xl font-bold">--</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-full">
              <span className="text-2xl">⏳</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Aguardando Pagamento</p>
              <p className="text-2xl font-bold">--</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-full">
              <span className="text-2xl">✅</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Finalizados Hoje</p>
              <p className="text-2xl font-bold">--</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ações Rápidas - Baseado no role */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {hasRole(['admin', 'atendente']) && (
            <>
              <Link 
                href="/clientes/novo" 
                className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <span className="text-3xl">➕</span>
                <span className="text-sm font-medium">Novo Cliente</span>
              </Link>
              
              <Link 
                href="/atendimentos/novo" 
                className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <span className="text-3xl">📝</span>
                <span className="text-sm font-medium">Novo Atendimento</span>
              </Link>
            </>
          )}
          
          {hasRole(['admin', 'avaliador']) && (
            <Link 
              href="/avaliacao" 
              className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="text-3xl">🔍</span>
              <span className="text-sm font-medium">Fila Avaliação</span>
            </Link>
          )}
          
          {hasRole(['admin', 'executor']) && (
            <Link 
              href="/execucao" 
              className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="text-3xl">🦷</span>
              <span className="text-sm font-medium">Fila Execução</span>
            </Link>
          )}

          {hasRole(['admin']) && (
            <Link 
              href="/usuarios" 
              className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="text-3xl">👤</span>
              <span className="text-sm font-medium">Gerenciar Usuários</span>
            </Link>
          )}
        </div>
      </div>

      {/* Status do Sistema */}
      <div className="card bg-green-50 border border-green-200">
        <h2 className="text-lg font-semibold text-green-900 mb-2">
          ✅ Status do MVP - Sprint 5 Concluída
        </h2>
        <ul className="text-sm text-green-800 space-y-1">
          <li>✅ Sprint 1: Setup inicial, banco SQLite, seed de dados</li>
          <li>✅ Sprint 2: Login, autenticação, CRUD de usuários</li>
          <li>✅ Sprint 3: CRUD completo de clientes</li>
          <li>✅ Sprint 4: Catálogo de procedimentos</li>
          <li>✅ Sprint 5: Atendimentos e Pipeline (Kanban)</li>
          <li className="mt-2 font-medium">⏳ Próximo: Sprint 6 - Avaliação (Dentista Avaliador)</li>
        </ul>
      </div>
    </div>
  );
}
