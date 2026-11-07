import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import ExecucaoProcedimentoPage from '@/app/execucao/[id]/page';

let mockUser = { id: 4, nome: 'Executor de teste', role: 'executor', roles: ['executor'] };
const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockToastWarning = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '10' }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    hasRole: (roles: string[]) => roles.some(role => mockUser.roles.includes(role)),
  }),
}));

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/lib/utils/usePageTitle', () => jest.fn());

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: {
      success: jest.fn(),
      error: jest.fn(),
      warning: mockToastWarning,
      info: jest.fn(),
    },
  }),
}));

jest.mock('@/components/domain', () => ({
  EvolucaoConclusaoModal: jest.requireActual('@/components/domain/EvolucaoConclusaoModal').default,
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  ProntuarioDrawer: () => null,
}));


function mockJsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

function itemEmExecucao(possuiAgendamentoAtivo: number) {
  return {
    id: 10,
    atendimento_id: 50,
    procedimento_id: 20,
    executor_id: 4,
    criado_por_id: 3,
    valor: 250,
    valor_final: 250,
    valor_pago: 250,
    adicionado_em_execucao: 0,
    dentes: null,
    quantidade: 1,
    por_dente: 0,
    status: 'executando',
    created_at: '2026-07-30T12:00:00.000Z',
    concluido_at: null,
    procedimento_nome: 'Limpeza',
    executor_nome: 'Dra. Marina',
    criado_por_nome: 'Dr. Paulo',
    cliente_nome: 'Maria Silva',
    cliente_id: 7,
    etapas: [],
    etapa_label: null,
    tem_etapas: 0,
    possui_agendamento_ativo: possuiAgendamentoAtivo,
    itens_elegiveis_evolucao: [
      {
        id: 10,
        atendimento_id: 50,
        procedimento_nome: 'Limpeza',
        etapa_label: null,
        status: 'executando',
        concluido_at: null,
        possui_agendamento_ativo: possuiAgendamentoAtivo,
      },
    ],
  };
}


const prontuarioLegado = { id: 62, legacy_prontuario_id: 77, descricao: 'Descrição fictícia de teste', observacoes: null, usuario_nome: 'Executor teste', created_at: '2026-07-18T22:19:30Z' };
function prepararCaso(overrides: Record<string, unknown> = {}, prontuario: unknown = null) {
  const item = { ...itemEmExecucao(0), ...overrides };
  mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return mockJsonResponse({ ...item, status: 'concluido' });
    if (url.endsWith('/anexos')) return mockJsonResponse([]);
    if (url.endsWith('/prontuario')) return mockJsonResponse({ prontuario });
    return mockJsonResponse(item);
  });
  global.fetch = jest.fn(() => mockJsonResponse([])) as jest.Mock;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 4, nome: 'Executor de teste', role: 'executor', roles: ['executor'] };
});
test('conclui item com prontuário legado sem tentar criar outra evolução', async () => {
  prepararCaso({ itens_elegiveis_evolucao: [] }, prontuarioLegado);
  render(<ExecucaoProcedimentoPage />);
  const button = await screen.findByRole('button', { name: 'Concluir Procedimento' });
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByText('Descrição fictícia de teste')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Criar Evolução e Concluir' })).not.toBeInTheDocument();
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('button', { name: /^Concluir$/ }));
  await waitFor(() => expect(mockUnitFetch).toHaveBeenCalledWith('/api/atendimentos/50/itens/10', expect.objectContaining({ method:'PUT', body:JSON.stringify({status:'concluido'}) })));
  expect(mockUnitFetch.mock.calls.some(([url]) => url === '/api/execucao/evolucoes')).toBe(false);
});
test('não permite concluir enquanto edição do prontuário não foi salva', async () => {
  prepararCaso({}, prontuarioLegado);
  render(<ExecucaoProcedimentoPage />);
  await screen.findByRole('button', { name:'Atualizar Prontuário' });
  fireEvent.change(screen.getByDisplayValue(prontuarioLegado.descricao), {target:{value:'Descrição alterada ainda não salva'}});
  expect(screen.getByRole('button', {name:'Concluir Procedimento'})).toBeDisabled();
});
test.each(['recusa', 'rede'])('mostra falha ao iniciar execução: %s', async tipo => {
  prepararCaso({status:'pago'});
  const original = mockUnitFetch.getMockImplementation()!;
  mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return tipo === 'rede' ? Promise.reject(new Error('Falha de rede')) : Promise.resolve({ok:false,json:async()=>({error:'O atendimento precisa estar em execução'})});
    return original(url, init);
  });
  render(<ExecucaoProcedimentoPage />);
  const button = await screen.findByRole('button', {name:'Iniciar Execução'});
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent(tipo === 'rede' ? 'Falha de rede' : 'O atendimento precisa estar em execução');
  expect(button).toBeEnabled();
});
test('mostra orientação e não oferece início ao responsável administrativo', async () => {
  mockUser = {...mockUser,role:'admin',roles:['admin','atendente']};
  prepararCaso({status:'pago',executor_habilitado:0,tem_etapas:1});
  render(<ExecucaoProcedimentoPage />);
  expect(await screen.findByText('Executor precisa ser revisado')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Iniciar Execução'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Revisar executor no atendimento'})).toBeInTheDocument();
});
test('explica agendamento vencido sem permitir conclusão', async () => {
  prepararCaso({possui_agendamento_ativo:1,possui_agendamento_vencido:1});
  render(<ExecucaoProcedimentoPage />);
  expect(await screen.findByText(/Existe um agendamento de data passada/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Criar Evolução e Concluir'})).not.toBeInTheDocument();
});
test('mantém o fluxo de implante com prontuário individual', async () => {
  prepararCaso({tem_etapas:1},prontuarioLegado);
  render(<ExecucaoProcedimentoPage />);
  const button=await screen.findByRole('button',{name:/Concluir Sessão/});
  await waitFor(()=>expect(button).toBeEnabled());
});

test('falha ao consultar prontuário bloqueia conclusão até tentar novamente', async () => {
  prepararCaso();
  const original = mockUnitFetch.getMockImplementation()!;
  let falhar = true;
  mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/prontuario') && falhar) return Promise.resolve({ok:false,json:async()=>({error:'Não foi possível consultar o prontuário'})});
    return original(url, init);
  });
  render(<ExecucaoProcedimentoPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar o prontuário');
  expect(screen.getByRole('button',{name:'Criar Evolução e Concluir'})).toBeDisabled();
  falhar = false;
  fireEvent.click(screen.getByRole('button',{name:'Tentar carregar prontuário novamente'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Criar Evolução e Concluir'})).toBeEnabled());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
test('retorna motivo quando a conclusão com prontuário existente é recusada', async () => {
  prepararCaso({}, prontuarioLegado);
  const original = mockUnitFetch.getMockImplementation()!;
  mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'PUT'
    ? Promise.resolve({ok:false,json:async()=>({error:'Revise o agendamento ativo antes de concluir o procedimento'})})
    : original(url, init));
  render(<ExecucaoProcedimentoPage />);
  const button = await screen.findByRole('button',{name:'Concluir Procedimento'});
  await waitFor(()=>expect(button).toBeEnabled());
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('button',{name:/^Concluir$/}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Revise o agendamento ativo');
  expect(mockPush).not.toHaveBeenCalled();
});
