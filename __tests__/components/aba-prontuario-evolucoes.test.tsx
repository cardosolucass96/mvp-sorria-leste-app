import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AbaProntuario from '@/components/domain/prontuario/AbaProntuario';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('AbaProntuario — evoluções agrupadas', () => {
  it('mostra uma evolução uma vez e lista os procedimentos associados', () => {
    render(
      <AbaProntuario
        prontuarios={[
          {
            evolucao_id: 8,
            item_id: 10,
            atendimento_id: 50,
            concluido_at: '2026-07-25T12:00:00.000Z',
            dentes: null,
            quantidade: 2,
            item_observacoes: null,
            procedimento_nome: '2 procedimentos',
            etapa_label: null,
            executor_nome: 'Dra. Ana',
            prontuario_id: null,
            prontuario_descricao: 'Descrição clínica compartilhada entre procedimentos.',
            prontuario_observacoes: 'Sem intercorrências',
            prontuario_data: '2026-07-25T12:00:00.000Z',
            prontuario_updated_at: '2026-07-25T12:00:00.000Z',
            prontuario_autor: 'Dra. Ana',
            itens: [
              {
                item_id: 10,
                procedimento_nome: 'Restauração',
                etapa_label: null,
                executor_nome: 'Dra. Ana',
                dentes: null,
                quantidade: 1,
                item_observacoes: null,
                concluido_at: '2026-07-25T12:00:00.000Z',
              },
              {
                item_id: 11,
                procedimento_nome: 'Limpeza',
                etapa_label: null,
                executor_nome: 'Dra. Ana',
                dentes: null,
                quantidade: 1,
                item_observacoes: null,
                concluido_at: '2026-07-25T12:05:00.000Z',
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText('Evolução com 2 procedimentos')).toBeInTheDocument();
    expect(screen.getByText('Restauração')).toBeInTheDocument();
    expect(screen.getByText('Limpeza')).toBeInTheDocument();
    expect(screen.getByText('Descrição clínica compartilhada entre procedimentos.')).toBeInTheDocument();
    expect(screen.getAllByText('Descrição clínica compartilhada entre procedimentos.')).toHaveLength(1);
  });

  it('mantém a exibição individual para evolução com um procedimento', () => {
    render(
      <AbaProntuario
        prontuarios={[
          {
            evolucao_id: 9,
            item_id: 12,
            atendimento_id: 51,
            concluido_at: '2026-07-25T13:00:00.000Z',
            dentes: null,
            quantidade: 1,
            item_observacoes: null,
            procedimento_nome: 'Consulta',
            etapa_label: null,
            executor_nome: 'Dr. Bruno',
            prontuario_id: 21,
            prontuario_descricao: 'Evolução individual legada.',
            prontuario_observacoes: null,
            prontuario_data: '2026-07-25T13:00:00.000Z',
            prontuario_updated_at: '2026-07-25T13:00:00.000Z',
            prontuario_autor: 'Dr. Bruno',
            itens: [
              {
                item_id: 12,
                procedimento_nome: 'Consulta',
                etapa_label: null,
                executor_nome: 'Dr. Bruno',
                dentes: null,
                quantidade: 1,
                item_observacoes: null,
                concluido_at: '2026-07-25T13:00:00.000Z',
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText('Consulta')).toBeInTheDocument();
    expect(screen.queryByText('Procedimentos vinculados')).not.toBeInTheDocument();
    expect(screen.getByText('Evolução individual legada.')).toBeInTheDocument();
  });
});
