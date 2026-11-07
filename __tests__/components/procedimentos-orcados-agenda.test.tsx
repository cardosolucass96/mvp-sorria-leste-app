import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProcedimentosOrcadosAgenda from '@/components/domain/ProcedimentosOrcadosAgenda';

test('mostra orçamento não pago sem oferecer ações clínicas ou estorno de um item inexistente', () => {
  render(<ProcedimentosOrcadosAgenda itens={[{
    agendamento_id:4890,atendimento_id:879,procedimento_nome:'Procedimento teste',etapa_label:null,
    executor_nome:null,valor:750,valor_pago:0,status:'pendente',data_agendada:null,created_at:'2026-11-05T13:46:36Z',
  }]} />);
  expect(screen.getByText('Orçado — não pago')).toBeInTheDocument();
  expect(screen.getByText(/Sem data definida/)).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Atendimento #879'})).toHaveAttribute('href','/atendimentos/879');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('lista vazia não exibe seção adicional', () => {
  const { container } = render(<ProcedimentosOrcadosAgenda itens={[]} />);
  expect(container).toBeEmptyDOMElement();
});
