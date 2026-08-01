'use client';

import { useEffect, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Modal,
  Spinner,
  Textarea,
} from '@/components/ui';

const MIN_CARACTERES = 10;

export interface EvolucaoConclusaoItem {
  id: number;
  label: string;
  executor_id: number | null;
  executor_nome: string | null;
  status: string;
  possui_agendamento_ativo?: number;
}

export interface EvolucaoConclusaoResultado {
  atendimento_id: number;
  item_ids: number[];
  executor_id: number;
  registrado_por_id: number;
  atendimento_finalizado: boolean;
  atendimento_voltou_para_pagamento: boolean;
}

export interface EvolucaoConclusaoModalProps {
  open: boolean;
  onClose: () => void;
  itens: EvolucaoConclusaoItem[];
  itemIdsIniciais: number[];
  registradorNome: string;
  registroAssistido?: boolean;
  onSuccess: (resultado: EvolucaoConclusaoResultado) => void | Promise<void>;
}

function itemElegivel(item: EvolucaoConclusaoItem): boolean {
  return item.executor_id !== null
    && ['pago', 'executando'].includes(item.status)
    && Number(item.possui_agendamento_ativo ?? 0) !== 1;
}

export default function EvolucaoConclusaoModal({
  open,
  onClose,
  itens,
  itemIdsIniciais,
  registradorNome,
  registroAssistido = false,
  onSuccess,
}: EvolucaoConclusaoModalProps) {
  const unitFetch = useUnitFetch();
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [descricao, setDescricao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const idsIniciaisKey = itemIdsIniciais.join(',');
  const itemInicial = itens.find((item) => itemIdsIniciais.includes(item.id));
  const executorId = itemInicial?.executor_id ?? null;
  const executorNome = itemInicial?.executor_nome ?? 'Executor não identificado';
  const idsObrigatorios = new Set(itemIdsIniciais);
  const elegiveis = itens.filter((item) => itemElegivel(item) && item.executor_id === executorId);

  useEffect(() => {
    if (!open) return;

    const elegiveisIds = new Set(elegiveis.map((item) => item.id));
    setSelecionados(itemIdsIniciais.filter((id) => elegiveisIds.has(id)));
    setDescricao('');
    setObservacoes('');
    setErro('');
    setConfirmando(false);
    // A abertura do modal define uma nova operação; mudanças posteriores na lista não devem apagar o formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsIniciaisKey]);

  const fechar = () => {
    if (salvando) return;
    setConfirmando(false);
    onClose();
  };

  const prepararConfirmacao = () => {
    if (salvando || confirmando) return;
    if (selecionados.length === 0) {
      setErro('Selecione ao menos um procedimento.');
      return;
    }
    if (descricao.trim().length < MIN_CARACTERES) {
      setErro(`A descrição da evolução deve ter no mínimo ${MIN_CARACTERES} caracteres.`);
      return;
    }

    setErro('');
    setConfirmando(true);
  };

  const concluir = async () => {
    if (salvando) return;
    setSalvando(true);
    setErro('');
    try {
      const response = await unitFetch('/api/execucao/evolucoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_ids: selecionados,
          descricao: descricao.trim(),
          observacoes: observacoes.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || 'Não foi possível concluir os procedimentos.');
        setConfirmando(false);
        return;
      }

      await onSuccess(data as EvolucaoConclusaoResultado);
      setConfirmando(false);
      onClose();
    } catch {
      setErro('Não foi possível concluir os procedimentos. Tente novamente.');
      setConfirmando(false);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={open}
        onClose={fechar}
        title="Nova evolução clínica"
        description="Registre o atendimento clínico antes de concluir os procedimentos."
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={fechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={prepararConfirmacao} disabled={salvando || confirmando || selecionados.length === 0}>
              {salvando ? <Spinner size="sm" /> : <FileCheck2 data-icon="inline-start" />}
              Salvar prontuário e concluir
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-4">
          {registroAssistido && (
            <Alert type="info" title="Registro assistido pela recepção">
              <span className="block">Executor responsável: <strong>{executorNome}</strong></span>
              <span className="block">Registrado por: <strong>{registradorNome}</strong></span>
            </Alert>
          )}

          {erro && <Alert type="error">{erro}</Alert>}

          <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-foreground">Procedimentos desta evolução</legend>
            {elegiveis.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
                <Checkbox
                  name={`evolucao_item_${item.id}`}
                  label={item.label}
                  hint={idsObrigatorios.has(item.id) ? 'Procedimento que iniciou este registro' : 'Mesmo executor responsável'}
                  checked={selecionados.includes(item.id)}
                  disabled={idsObrigatorios.has(item.id) || salvando}
                  onChange={(checked) => {
                    setSelecionados((atuais) => checked
                      ? [...new Set([...atuais, item.id])]
                      : atuais.filter((id) => id !== item.id));
                  }}
                />
                <Badge color={item.status === 'executando' ? 'orange' : 'blue'} size="sm">
                  {item.status === 'executando' ? 'Em execução' : 'Pago'}
                </Badge>
              </div>
            ))}
          </fieldset>

          <Textarea
            label="Descrição clínica"
            name="descricao_evolucao"
            value={descricao}
            onChange={setDescricao}
            placeholder="Descreva os procedimentos realizados, materiais, técnicas e condutas..."
            minLength={MIN_CARACTERES}
            hint={`Mínimo de ${MIN_CARACTERES} caracteres.`}
            required
            disabled={salvando}
            rows={6}
          />

          <Textarea
            label="Observações"
            name="observacoes_evolucao"
            value={observacoes}
            onChange={setObservacoes}
            placeholder="Cuidados pós-procedimento, retornos ou orientações..."
            disabled={salvando}
            rows={3}
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmando}
        onClose={() => !salvando && setConfirmando(false)}
        onConfirm={concluir}
        title="Confirmar conclusão clínica"
        message={`Salvar esta evolução e concluir ${selecionados.length} procedimento${selecionados.length === 1 ? '' : 's'} de ${executorNome}? A conclusão não pode ser desfeita por esta tela.`}
        confirmLabel="Salvar e concluir"
        type="warning"
        loading={salvando}
      />
    </>
  );
}
