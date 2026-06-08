'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/_shadcn/sheet';
import Tabs from '@/components/ui/Tabs';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Alert from '@/components/ui/Alert';
import { apiFetch } from '@/lib/utils/apiFetch';
import type { Cliente, VinculoCliente } from '@/lib/types';
import type { FichaData } from './prontuario/types';
import AbaDados from './prontuario/AbaDados';
import AbaAtendimentos from './prontuario/AbaAtendimentos';
import AbaProcedimentos from './prontuario/AbaProcedimentos';
import AbaPagamentos from './prontuario/AbaPagamentos';
import AbaProntuario from './prontuario/AbaProntuario';
import AbaHistorico from './prontuario/AbaHistorico';
import AbaVinculos from './prontuario/AbaVinculos';

export interface ProntuarioDrawerProps {
  clienteId: number | null;
  open: boolean;
  onClose: () => void;
  ctaLabel?: string;
  onCta?: () => void | Promise<void>;
  ctaLoading?: boolean;
  initialTab?: 'dados' | 'atendimentos' | 'procedimentos' | 'pagamentos' | 'prontuario' | 'historico' | 'vinculados';
}

export default function ProntuarioDrawer({
  clienteId,
  open,
  onClose,
  ctaLabel,
  onCta,
  ctaLoading,
  initialTab = 'prontuario',
}: ProntuarioDrawerProps) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [ficha, setFicha] = useState<FichaData | null>(null);
  const [vinculos, setVinculos] = useState<VinculoCliente[]>([]);
  const [saldo, setSaldo] = useState<{ saldo: number; saldo_calculado: number } | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [abaAtiva, setAbaAtiva] = useState<string>(initialTab);

  const carregar = useCallback(async (id: number) => {
    setLoading(true);
    setError('');
    try {
      const [resCliente, resFicha, resVinculos, resSaldo] = await Promise.all([
        apiFetch(`/api/clientes/${id}`),
        apiFetch(`/api/clientes/${id}/ficha`),
        apiFetch(`/api/clientes/${id}/vinculos`),
        apiFetch(`/api/clientes/${id}/saldo`),
      ]);
      if (!resCliente.ok) {
        setError('Cliente não encontrado');
        return;
      }
      setCliente(await resCliente.json());
      if (resFicha.ok) setFicha(await resFicha.json());
      if (resVinculos.ok) setVinculos(await resVinculos.json());
      if (resSaldo.ok) {
        const s = await resSaldo.json();
        setSaldo({ saldo: s.saldo ?? 0, saldo_calculado: s.saldo_calculado ?? 0 });
      }
    } catch {
      setError('Erro ao carregar ficha do cliente');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && clienteId) {
      setAbaAtiva(initialTab);
      carregar(clienteId);
    } else if (!open) {
      // reset ao fechar
      setCliente(null);
      setFicha(null);
      setVinculos([]);
      setSaldo(undefined);
      setError('');
    }
  }, [open, clienteId, carregar, initialTab]);

  const abas = [
    { key: 'dados', label: 'Dados' },
    { key: 'atendimentos', label: 'Atendim.', count: ficha?.atendimentos.length },
    { key: 'procedimentos', label: 'Proced.', count: ficha?.procedimentos.length },
    { key: 'prontuario', label: 'Prontuário', count: ficha?.prontuarios.length },
    { key: 'historico', label: 'Histórico', count: ficha?.historico.length },
    { key: 'pagamentos', label: 'Pagam.', count: ficha?.pagamentos.filter(p => !p.cancelado).length },
    { key: 'vinculados', label: 'Vínculos', count: vinculos.length || undefined },
  ];

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0 gap-0"
      >
        <SheetHeader className="border-b border-border px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4 text-primary" />
            <span className="truncate">{cliente ? cliente.nome : 'Prontuário'}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {cliente?.telefone ? `${cliente.telefone} • ` : ''}Ficha completa do paciente
          </SheetDescription>
        </SheetHeader>

        {!loading && cliente && (
          <div className="border-b border-border px-4">
            <Tabs
              tabs={abas}
              activeTab={abaAtiva}
              onTabChange={setAbaAtiva}
              variant="underline"
              size="sm"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Spinner />
            </div>
          )}
          {error && (
            <Alert type="error">
              {error}
            </Alert>
          )}
          {!loading && cliente && ficha && (
            <>
              {abaAtiva === 'dados' && <AbaDados cliente={cliente} saldo={saldo} />}
              {abaAtiva === 'atendimentos' && (
                <AbaAtendimentos atendimentos={ficha.atendimentos} />
              )}
              {abaAtiva === 'procedimentos' && (
                <AbaProcedimentos procedimentos={ficha.procedimentos} />
              )}
              {abaAtiva === 'prontuario' && (
                <AbaProntuario prontuarios={ficha.prontuarios} />
              )}
              {abaAtiva === 'historico' && <AbaHistorico historico={ficha.historico} />}
              {abaAtiva === 'pagamentos' && (
                <AbaPagamentos
                  pagamentos={ficha.pagamentos}
                  movimentacoes={ficha.movimentacoes}
                />
              )}
              {abaAtiva === 'vinculados' && <AbaVinculos vinculos={vinculos} />}
            </>
          )}
        </div>

        <div className="border-t border-border px-4 py-3 bg-card/95 flex gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
            Fechar
          </Button>
          {onCta && ctaLabel && (
            <Button onClick={onCta} disabled={ctaLoading || loading} className="flex-1">
              {ctaLoading ? 'Aguarde...' : ctaLabel}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
