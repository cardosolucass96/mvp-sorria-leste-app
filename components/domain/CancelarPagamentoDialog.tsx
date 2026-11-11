'use client';

import { useRef, useState } from 'react';
import { Alert, Button, Input, Modal } from '@/components/ui';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { formatarMoeda } from '@/lib/utils/formatters';
import { criarChavesOperacao } from '@/modules/financeiro/public';

const MOTIVOS = ['Pagamento duplicado', 'Valor incorreto', 'Forma de pagamento incorreta', 'Outro'];

export interface PagamentoParaCancelar {
  atendimentoId: number;
  pagamentoId: number;
  valorTotal: number;
  quantidadeFormas: number;
}

interface CancelarPagamentoDialogProps {
  pagamento: PagamentoParaCancelar | null;
  onClose: () => void;
  onCancelado: () => void;
}

export default function CancelarPagamentoDialog({ pagamento, onClose, onCancelado }: CancelarPagamentoDialogProps) {
  const unitFetch = useUnitFetch();
  const [chaves] = useState(criarChavesOperacao);
  const [motivo, setMotivo] = useState('');
  const [outroMotivo, setOutroMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const envioEmAndamento = useRef(false);

  const motivoFinal = motivo === 'Outro' ? outroMotivo.trim() : motivo;

  const limparFormulario = () => {
    setMotivo('');
    setOutroMotivo('');
    setErro('');
  };

  const confirmar = async () => {
    if (!pagamento || !motivoFinal || envioEmAndamento.current) return;

    envioEmAndamento.current = true;
    setEnviando(true);
    setErro('');
    const rota = `/api/atendimentos/${pagamento.atendimentoId}/pagamentos/${pagamento.pagamentoId}`;
    const body = JSON.stringify({ motivo: motivoFinal });

    try {
      const res = await unitFetch(rota, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': chaves.obter(rota, body) },
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        setErro(data?.error || 'Erro ao cancelar pagamento.');
        return;
      }
      chaves.concluir(rota, body);
    } catch {
      setErro('Erro de conexão. Tente novamente.');
      return;
    } finally {
      envioEmAndamento.current = false;
      setEnviando(false);
    }

    limparFormulario();
    onCancelado();
  };

  if (!pagamento) return null;

  const formas = pagamento.quantidadeFormas;
  const valor = formatarMoeda(pagamento.valorTotal);
  const fechar = () => {
    if (envioEmAndamento.current) return;
    limparFormulario();
    onClose();
  };

  return (
    <Modal
      isOpen
      title="Cancelar pagamento"
      size="sm"
      description={formas > 1
        ? `O lançamento de ${valor} será cancelado no sistema, incluindo as ${formas} formas de pagamento.`
        : `O lançamento de ${valor} será cancelado no sistema.`}
      onClose={fechar}
      footer={
        <>
          <Button variant="secondary" onClick={fechar} disabled={enviando}>Voltar</Button>
          <Button variant="danger" onClick={() => void confirmar()} loading={enviando} disabled={!motivoFinal}>
            Confirmar cancelamento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">A devolução ao paciente é feita separadamente.</p>
        {erro && <Alert type="error">{erro}</Alert>}
        <fieldset className="space-y-2" disabled={enviando}>
          <legend className="text-sm font-medium">Motivo do cancelamento</legend>
          {MOTIVOS.map((opcao) => (
            <label key={opcao} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary">
              <input
                type="radio"
                name="motivo-cancelamento"
                value={opcao}
                checked={motivo === opcao}
                onChange={() => setMotivo(opcao)}
              />
              {opcao}
            </label>
          ))}
          {motivo === 'Outro' && (
            <Input label="Qual foi o motivo?" name="outro-motivo" value={outroMotivo} onChange={setOutroMotivo} required />
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
