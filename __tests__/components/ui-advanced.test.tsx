/**
 * Testes de componentes UI avançados com @testing-library/react
 * Ambiente: jsdom
 * Sprint 6 Revisão – Table, Tabs, FilterBar, Tooltip, SearchInput, LoadingState, Toast, Breadcrumb, Pagination
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// ─── Table ──────────────────────────────────────────────────────

import Table from '@/components/ui/Table';
import type { TableColumn } from '@/components/ui/Table';

interface TestItem {
  id: number;
  name: string;
  value: number;
}

const testData: TestItem[] = [
  { id: 1, name: 'Alpha', value: 100 },
  { id: 2, name: 'Beta', value: 200 },
  { id: 3, name: 'Gamma', value: 300 },
];

const testColumns: TableColumn<TestItem>[] = [
  { key: 'name', label: 'Nome' },
  { key: 'value', label: 'Valor', align: 'right', render: (item) => `R$${item.value}` },
];

describe('Table', () => {
  test('renderiza cabeçalhos e dados', () => {
    render(
      <Table columns={testColumns} data={testData} keyExtractor={(i) => i.id} />
    );
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('Valor')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('R$200')).toBeInTheDocument();
  });

  test('mostra emptyMessage quando data é vazio', () => {
    render(
      <Table columns={testColumns} data={[]} keyExtractor={(i) => i.id} emptyMessage="Sem registros" />
    );
    expect(screen.getByText('Sem registros')).toBeInTheDocument();
  });

  test('mostra skeleton no loading', () => {
    render(
      <Table columns={testColumns} data={[]} keyExtractor={(i) => i.id} loading />
    );
    // Table shows skeleton rows when loading
    const table = document.querySelector('table');
    expect(table).toHaveAttribute('aria-busy', 'true');
  });

  test('caption é sr-only', () => {
    render(
      <Table columns={testColumns} data={testData} keyExtractor={(i) => i.id} caption="Test table" />
    );
    const caption = document.querySelector('caption');
    expect(caption).toBeInTheDocument();
    expect(caption).toHaveClass('sr-only');
    expect(caption).toHaveTextContent('Test table');
  });

  test('th tem scope="col"', () => {
    render(
      <Table columns={testColumns} data={testData} keyExtractor={(i) => i.id} />
    );
    const headers = document.querySelectorAll('th');
    headers.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });
  });

  test('linhas clicáveis são focáveis', () => {
    const onClick = jest.fn();
    render(
      <Table
        columns={testColumns}
        data={testData}
        keyExtractor={(i) => i.id}
        onRowClick={onClick}
      />
    );
    const row = screen.getByText('Alpha').closest('tr')!;
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledWith(testData[0]);
  });

  test('linhas clicáveis respondem a Enter', () => {
    const onClick = jest.fn();
    render(
      <Table
        columns={testColumns}
        data={testData}
        keyExtractor={(i) => i.id}
        onRowClick={onClick}
      />
    );
    const row = screen.getByText('Alpha').closest('tr')!;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith(testData[0]);
  });
});

// ─── Tabs ───────────────────────────────────────────────────────

import Tabs from '@/components/ui/Tabs';

describe('Tabs', () => {
  const tabs = [
    { key: 'tab1', label: 'Tab 1' },
    { key: 'tab2', label: 'Tab 2' },
    { key: 'tab3', label: 'Tab 3' },
  ];

  test('renderiza todas as tabs', () => {
    render(<Tabs tabs={tabs} activeTab="tab1" onTabChange={() => {}} />);
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByText('Tab 3')).toBeInTheDocument();
  });

  test('tem role="tablist"', () => {
    render(<Tabs tabs={tabs} activeTab="tab1" onTabChange={() => {}} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  test('tabs têm role="tab"', () => {
    render(<Tabs tabs={tabs} activeTab="tab1" onTabChange={() => {}} />);
    const tabElements = screen.getAllByRole('tab');
    expect(tabElements).toHaveLength(3);
  });

  test('tab ativa tem aria-selected=true', () => {
    render(<Tabs tabs={tabs} activeTab="tab2" onTabChange={() => {}} />);
    const tab2 = screen.getByText('Tab 2');
    expect(tab2).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Tab 1')).toHaveAttribute('aria-selected', 'false');
  });

  test('roving tabindex: ativa tabIndex=0, outras -1', () => {
    render(<Tabs tabs={tabs} activeTab="tab1" onTabChange={() => {}} />);
    expect(screen.getByText('Tab 1')).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('Tab 2')).toHaveAttribute('tabindex', '-1');
  });

  test('onTabChange é chamado ao clicar', async () => {
    const onChange = jest.fn();
    render(<Tabs tabs={tabs} activeTab="tab1" onTabChange={onChange} />);
    await userEvent.click(screen.getByText('Tab 2'));
    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  test('navegação com setas ArrowRight/ArrowLeft', () => {
    const onChange = jest.fn();
    render(<Tabs tabs={tabs} activeTab="tab1" onTabChange={onChange} />);
    const tab1 = screen.getByText('Tab 1');
    fireEvent.keyDown(tab1, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  test('variante pills renderiza ok', () => {
    render(<Tabs tabs={tabs} activeTab="tab1" onTabChange={() => {}} variant="pills" />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});

// ─── LoadingState ───────────────────────────────────────────────

import LoadingState from '@/components/ui/LoadingState';

describe('LoadingState', () => {
  test('modo spinner renderiza com role="status"', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('mostra texto customizado', () => {
    render(<LoadingState text="Processando..." />);
    expect(screen.getByText('Processando...')).toBeInTheDocument();
  });

  test('mostra texto padrão "Carregando..."', () => {
    render(<LoadingState />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  test('modo skeleton renderiza aria-label', () => {
    render(<LoadingState mode="skeleton" />);
    expect(screen.getByLabelText('Carregando conteúdo')).toBeInTheDocument();
  });
});

// ─── Tooltip ────────────────────────────────────────────────────

import Tooltip from '@/components/ui/Tooltip';

describe('Tooltip', () => {
  test('não mostra tooltip por padrão', () => {
    render(
      <Tooltip content="Dica útil">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('mostra tooltip no hover', async () => {
    render(
      <Tooltip content="Dica útil">
        <button>Hover me</button>
      </Tooltip>
    );
    await userEvent.hover(screen.getByText('Hover me').closest('span')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Dica útil');
  });

  test('mostra tooltip no focus', () => {
    render(
      <Tooltip content="Dica útil">
        <button>Focus me</button>
      </Tooltip>
    );
    fireEvent.focus(screen.getByText('Focus me').closest('span')!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  test('Escape fecha tooltip', async () => {
    render(
      <Tooltip content="Dica útil">
        <button>Focus me</button>
      </Tooltip>
    );
    fireEvent.focus(screen.getByText('Focus me').closest('span')!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  test('trigger tem aria-describedby quando visível', () => {
    render(
      <Tooltip content="Dica útil">
        <button>Focus me</button>
      </Tooltip>
    );
    fireEvent.focus(screen.getByText('Focus me').closest('span')!);
    const trigger = screen.getByText('Focus me').closest('[aria-describedby]');
    expect(trigger).toBeInTheDocument();
  });
});

// ─── Breadcrumb ─────────────────────────────────────────────────

import Breadcrumb from '@/components/ui/Breadcrumb';

describe('Breadcrumb', () => {
  test('renderiza todos os itens', () => {
    render(
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Clientes', href: '/clientes' },
        { label: 'Detalhes' },
      ]} />
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Detalhes')).toBeInTheDocument();
  });

  test('tem nav com aria-label="Breadcrumb"', () => {
    render(
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Page' }]} />
    );
    expect(screen.getByLabelText('Breadcrumb')).toBeInTheDocument();
  });

  test('último item tem aria-current="page"', () => {
    render(
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Page' }]} />
    );
    expect(screen.getByText('Page')).toHaveAttribute('aria-current', 'page');
  });

  test('itens com href são links', () => {
    render(
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Current' }]} />
    );
    const link = screen.getByText('Home');
    expect(link.closest('a')).toHaveAttribute('href', '/');
  });

  test('separadores são aria-hidden', () => {
    render(
      <Breadcrumb items={[{ label: 'A', href: '/' }, { label: 'B' }]} />
    );
    const separators = document.querySelectorAll('[aria-hidden="true"]');
    expect(separators.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Pagination ─────────────────────────────────────────────────

import Pagination from '@/components/ui/Pagination';

describe('Pagination', () => {
  test('não renderiza quando totalPages <= 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  test('renderiza botões de páginas', () => {
    render(
      <Pagination page={1} totalPages={5} onPageChange={() => {}} />
    );
    expect(screen.getByLabelText('Página 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Página 5')).toBeInTheDocument();
  });

  test('tem nav com aria-label="Paginação"', () => {
    render(
      <Pagination page={1} totalPages={5} onPageChange={() => {}} />
    );
    expect(screen.getByLabelText('Paginação')).toBeInTheDocument();
  });

  test('página ativa tem aria-current="page"', () => {
    render(
      <Pagination page={3} totalPages={5} onPageChange={() => {}} />
    );
    expect(screen.getByLabelText('Página 3')).toHaveAttribute('aria-current', 'page');
  });

  test('botão "Anterior" desabilitado na primeira página', () => {
    render(
      <Pagination page={1} totalPages={5} onPageChange={() => {}} />
    );
    expect(screen.getByLabelText('Página anterior')).toBeDisabled();
  });

  test('botão "Próxima" desabilitado na última página', () => {
    render(
      <Pagination page={5} totalPages={5} onPageChange={() => {}} />
    );
    expect(screen.getByLabelText('Próxima página')).toBeDisabled();
  });

  test('onPageChange é chamado ao clicar', async () => {
    const onPageChange = jest.fn();
    render(
      <Pagination page={1} totalPages={5} onPageChange={onPageChange} />
    );
    await userEvent.click(screen.getByLabelText('Página 2'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  test('mostra ellipsis em paginação longa', () => {
    render(
      <Pagination page={5} totalPages={20} onPageChange={() => {}} />
    );
    const ellipses = document.querySelectorAll('[aria-hidden="true"]');
    // Deve ter ao menos 1 ellipsis
    const hasEllipsis = Array.from(ellipses).some(el => el.textContent === '…');
    expect(hasEllipsis).toBe(true);
  });
});

// ─── SearchInput ────────────────────────────────────────────────

import SearchInput from '@/components/ui/SearchInput';

describe('SearchInput', () => {
  test('renderiza input de busca', () => {
    render(
      <SearchInput value="" onChange={() => {}} onSearch={() => {}} placeholder="Buscar..." />
    );
    expect(screen.getByPlaceholderText('Buscar...')).toBeInTheDocument();
  });

  test('renderiza com label quando fornecida', () => {
    render(
      <SearchInput value="" onChange={() => {}} onSearch={() => {}} label="Pesquisar" />
    );
    expect(screen.getByLabelText('Pesquisar')).toBeInTheDocument();
  });

  test('mostra botão de limpar quando tem valor', () => {
    render(
      <SearchInput value="teste" onChange={() => {}} onSearch={() => {}} />
    );
    expect(screen.getByLabelText('Limpar busca')).toBeInTheDocument();
  });

  test('não mostra botão de limpar quando vazio', () => {
    render(
      <SearchInput value="" onChange={() => {}} onSearch={() => {}} />
    );
    expect(screen.queryByLabelText('Limpar busca')).not.toBeInTheDocument();
  });

  test('onChange é chamado ao digitar', async () => {
    const onChange = jest.fn();
    render(
      <SearchInput value="" onChange={onChange} onSearch={() => {}} placeholder="Busca" />
    );
    await userEvent.type(screen.getByPlaceholderText('Busca'), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  test('limpar chama onChange com vazio', async () => {
    const onChange = jest.fn();
    render(
      <SearchInput value="teste" onChange={onChange} onSearch={() => {}} />
    );
    await userEvent.click(screen.getByLabelText('Limpar busca'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});

// ─── FilterBar ──────────────────────────────────────────────────

import FilterBar from '@/components/ui/FilterBar';

describe('FilterBar', () => {
  const fields = [
    { type: 'date' as const, name: 'dataInicio', label: 'Data Início' },
    { type: 'date' as const, name: 'dataFim', label: 'Data Fim' },
  ];

  test('renderiza campos de filtro', () => {
    render(
      <FilterBar
        fields={fields}
        values={{ dataInicio: '', dataFim: '' }}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText('Data Início')).toBeInTheDocument();
    expect(screen.getByLabelText('Data Fim')).toBeInTheDocument();
  });

  test('mostra botão "Limpar filtros" quando há valores e onClear', () => {
    render(
      <FilterBar
        fields={fields}
        values={{ dataInicio: '2024-01-01', dataFim: '' }}
        onChange={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.getByText('Limpar filtros')).toBeInTheDocument();
  });

  test('não mostra "Limpar filtros" quando valores vazios', () => {
    render(
      <FilterBar
        fields={fields}
        values={{ dataInicio: '', dataFim: '' }}
        onChange={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.queryByText('Limpar filtros')).not.toBeInTheDocument();
  });

  test('onClear é chamado ao clicar "Limpar filtros"', async () => {
    const onClear = jest.fn();
    render(
      <FilterBar
        fields={fields}
        values={{ dataInicio: '2024-01-01', dataFim: '' }}
        onChange={() => {}}
        onClear={onClear}
      />
    );
    await userEvent.click(screen.getByText('Limpar filtros'));
    expect(onClear).toHaveBeenCalled();
  });

  test('suporta campo select', () => {
    render(
      <FilterBar
        fields={[
          { type: 'select', name: 'status', label: 'Status', options: [
            { value: 'ativo', label: 'Ativo' },
            { value: 'inativo', label: 'Inativo' },
          ] },
        ]}
        values={{ status: '' }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    // a select é renderizada
    expect(document.querySelector('select')).toBeInTheDocument();
  });

  test('toggle mobile existe com aria-expanded', () => {
    render(
      <FilterBar
        fields={fields}
        values={{ dataInicio: '', dataFim: '' }}
        onChange={() => {}}
      />
    );
    const toggle = screen.getByRole('button', { name: /filtros/i });
    expect(toggle).toHaveAttribute('aria-expanded');
  });
});

// ─── Toast ──────────────────────────────────────────────────────

import { ToastProvider, useToast } from '@/components/ui/Toast';

function ToastTestConsumer() {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Salvo!', 0)}>
        Add Toast
      </button>
      <button onClick={() => toast.error('Erro!')}>
        Add Error Toast
      </button>
    </div>
  );
}

describe('Toast', () => {
  test('ToastProvider renderiza sem erros', () => {
    render(
      <ToastProvider>
        <div>App</div>
      </ToastProvider>
    );
    expect(screen.getByText('App')).toBeInTheDocument();
  });

  test('addToast mostra toast', async () => {
    render(
      <ToastProvider>
        <ToastTestConsumer />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('Add Toast'));
    expect(screen.getByText('Salvo!')).toBeInTheDocument();
  });

  test('container tem aria-live', async () => {
    render(
      <ToastProvider>
        <ToastTestConsumer />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('Add Toast'));
    const container = document.querySelector('[aria-live]');
    expect(container).toBeInTheDocument();
  });

  test('toast de erro tem role="alert"', async () => {
    render(
      <ToastProvider>
        <ToastTestConsumer />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('Add Error Toast'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  test('toast pode ser fechado', async () => {
    render(
      <ToastProvider>
        <ToastTestConsumer />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('Add Toast'));
    expect(screen.getByText('Salvo!')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Fechar notificação'));
    await waitFor(() => {
      expect(screen.queryByText('Salvo!')).not.toBeInTheDocument();
    });
  });
});
