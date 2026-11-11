import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import AvaliacaoDetalhePage from '@/app/avaliacao/[id]/page';

const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, nome: 'Avaliador de teste' } }),
}));
jest.mock('@/lib/hooks/useUnitFetch', () => ({ useUnitFetch: () => mockUnitFetch }));
jest.mock('@/lib/utils/usePageTitle', () => jest.fn());
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/components/domain', () => ({ AnexosGallery: () => null }));
jest.mock('@/components/ui', () => ({
  Alert: jest.requireActual('@/components/ui/Alert').default,
  Button: jest.requireActual('@/components/ui/Button').default,
  Card: jest.requireActual('@/components/ui/Card').default,
  Input: jest.requireActual('@/components/ui/Input').default,
  Select: jest.requireActual('@/components/ui/Select').default,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  LoadingState: ({ text }: { text: string }) => <p>{text}</p>,
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  ConfirmDialog: () => null,
}));

const montagem = {
  id: 101,
  procedimento_id: 73,
  procedimento_nome: 'Montagem de aparelho',
  valor: 200,
  valor_original: 200,
  status: 'pendente',
  executor_id: null,
  executor_nome: null,
  criado_por_id: 3,
  criado_por_nome: null,
  dentes: null,
  dente_unico: null,
  etapa_label: null,
  tem_etapas: 0,
  observacoes: null,
};
const limpeza = { ...montagem, id: 102, procedimento_id: 1, procedimento_nome: 'Limpeza Completa', valor: 100 };
let itensSalvos = [montagem];
let salvarItem: () => Promise<Response>;
let finalizar: () => Promise<Response>;

function resposta(data: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 400, json: async () => data } as Response;
}

function respostaPendente() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function alteracoes() {
  return mockUnitFetch.mock.calls.filter(([, init]) => init?.method);
}

async function abrirAvaliacao() {
  const params = Promise.resolve({ id: '10' });
  await act(async () => { render(<AvaliacaoDetalhePage params={params} />); });
  await screen.findByRole('heading', { name: 'Paciente de teste' });
}

async function selecionarLimpeza(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Selecione...' }));
  await user.click(screen.getByRole('button', { name: /^Limpeza Completa/ }));
}

function botaoFinalizar() {
  return screen.getByRole('button', { name: /Finalizar Avaliação/ });
}

beforeEach(() => {
  jest.clearAllMocks();
  itensSalvos = [montagem];
  salvarItem = async () => {
    itensSalvos = [...itensSalvos, limpeza];
    return resposta(limpeza);
  };
  finalizar = async () => resposta({ status: 'aguardando_pagamento' });
  mockUnitFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/atendimentos/10/itens' && init?.method === 'POST') return salvarItem();
    if (url === '/api/atendimentos/10' && init?.method === 'PUT') return finalizar();
    if (url.endsWith('/anexos')) return resposta([]);
    if (url === '/api/atendimentos/10') {
      return resposta({
        id: 10, cliente_id: 7, cliente_nome: 'Paciente de teste', status: 'avaliacao',
        avaliador_id: 3, avaliador_nome: 'Avaliador de teste', itens: itensSalvos, total: 200,
      });
    }
    throw new Error(`Requisição inesperada: ${url}`);
  });
  global.fetch = jest.fn(async (url: string) => {
    if (url === '/api/procedimentos') return resposta([
      { id: 1, nome: 'Limpeza Completa', valor: 100, por_dente: 0, tem_etapas: 0, tem_face: 0 },
      { id: 73, nome: 'Montagem de aparelho', valor: 200, por_dente: 0, tem_etapas: 0, tem_face: 0 },
    ]);
    if (url === '/api/usuarios?roles=executor,ortodontista') return resposta([{ id: 4, nome: 'Executor de teste', role: 'executor' }]);
    if (url === '/api/clientes/7/anexos') return resposta([]);
    throw new Error(`Requisição inesperada: ${url}`);
  }) as jest.Mock;
});

test('aguarda a segunda inclusão antes de permitir finalizar e mantém os dois procedimentos', async () => {
  const user = userEvent.setup();
  const pendente = respostaPendente();
  salvarItem = () => pendente.promise;
  await abrirAvaliacao();
  await selecionarLimpeza(user);
  await user.click(screen.getByRole('button', { name: 'Adicionar' }));

  expect(botaoFinalizar()).toBeDisabled();
  expect(screen.getByRole('button', { name: /^Limpeza Completa/ })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Executor' })).toBeDisabled();
  expect(screen.getByRole('spinbutton', { name: 'Valor (R$)' })).toBeDisabled();
  expect(screen.getByRole('textbox')).toBeDisabled();
  await user.click(botaoFinalizar());
  // Mesmo um segundo submit antes da resposta não deve duplicar o procedimento.
  fireEvent.submit(screen.getByRole('button', { name: 'Adicionar' }).closest('form')!);
  expect(alteracoes()).toHaveLength(1);
  expect(mockPush).not.toHaveBeenCalled();

  await act(async () => {
    itensSalvos = [...itensSalvos, limpeza];
    pendente.resolve(resposta(limpeza));
  });
  expect(await screen.findByText('2 itens')).toBeInTheDocument();
  expect(screen.getByText('Montagem de aparelho')).toBeInTheDocument();
  expect(screen.getByText('Limpeza Completa')).toBeInTheDocument();
  expect(botaoFinalizar()).toBeEnabled();
  await user.click(botaoFinalizar());
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/avaliacao'));
  expect(alteracoes()).toHaveLength(2);
});

test('avisa sobre a seleção não adicionada e permite limpá-la sem excluir o item salvo', async () => {
  const user = userEvent.setup();
  await abrirAvaliacao();
  await selecionarLimpeza(user);

  expect(screen.getByRole('alert')).toHaveTextContent(/ainda não foi adicionado/i);
  expect(botaoFinalizar()).toBeDisabled();
  await user.click(botaoFinalizar());
  expect(alteracoes()).toHaveLength(0);
  expect(mockPush).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Limpar seleção' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Montagem de aparelho')).toBeInTheDocument();
  expect(screen.getByText('1 item')).toBeInTheDocument();
  expect(botaoFinalizar()).toBeEnabled();
  await user.click(botaoFinalizar());
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/avaliacao'));
  expect(alteracoes()).toEqual([['/api/atendimentos/10', expect.objectContaining({ method: 'PUT' })]]);
});

test.each(['http', 'rede'])('preserva a seleção quando a inclusão falha (%s) e permite tentar novamente', async (falha) => {
  const user = userEvent.setup();
  const pendente = respostaPendente();
  salvarItem = () => pendente.promise;
  await abrirAvaliacao();
  await selecionarLimpeza(user);
  await user.click(screen.getByRole('button', { name: 'Adicionar' }));
  await act(async () => {
    if (falha === 'http') pendente.resolve(resposta({ error: 'Falha ao salvar procedimento' }, false));
    else pendente.reject(new Error('Falha ao salvar procedimento'));
  });

  expect(await screen.findByText('Falha ao salvar procedimento')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Limpeza Completa/ })).toBeEnabled();
  expect(botaoFinalizar()).toBeDisabled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockToast.success).not.toHaveBeenCalled();

  salvarItem = async () => {
    itensSalvos = [...itensSalvos, limpeza];
    return resposta(limpeza);
  };
  await user.click(screen.getByRole('button', { name: 'Adicionar' }));
  expect(await screen.findByText('2 itens')).toBeInTheDocument();
  expect(botaoFinalizar()).toBeEnabled();
});

test('bloqueia novas inclusões durante a finalização e libera o formulário se ela falhar', async () => {
  const user = userEvent.setup();
  const pendente = respostaPendente();
  finalizar = () => pendente.promise;
  await abrirAvaliacao();
  await user.click(botaoFinalizar());

  expect(screen.getByRole('button', { name: 'Selecione...' })).toBeDisabled();
  expect(botaoFinalizar()).toBeDisabled();
  await user.click(botaoFinalizar());
  expect(alteracoes()).toHaveLength(1);

  await act(async () => {
    pendente.resolve(resposta({ error: 'Falha ao finalizar avaliação' }, false));
  });
  expect(await screen.findByText('Falha ao finalizar avaliação')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Selecione...' })).toBeEnabled();
  expect(botaoFinalizar()).toBeEnabled();
  expect(mockPush).not.toHaveBeenCalled();
});
