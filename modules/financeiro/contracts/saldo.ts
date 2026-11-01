export interface SaldoRow { saldo: number; updated_at?: string; }
export interface ItemSaldo {
  id: number; atendimento_id: number; valor: number; valor_final: number | null; valor_pago: number; status: string;
}
export interface ItemEstorno {
  id: number; valor_pago: number; status: string; procedimento_nome: string; atendimento_cliente_id: number;
}
export interface MovimentacaoSaldo {
  id: number; cliente_id: number; tipo: string; valor: number; saldo_anterior: number; saldo_novo: number;
  pagamento_id: number | null; item_atendimento_id: number | null; atendimento_id: number | null;
  cliente_destino_id: number | null; observacoes: string | null; created_at: string;
}
export interface CreditarSaldoInput { valor: number; pagamento_id?: number | null; observacoes?: string | null; }
export interface DebitarSaldoInput { item_atendimento_id: number; atendimento_id: number; observacoes?: string | null; }
export interface EstornarSaldoInput { valor: number; observacoes?: string | null; }
export interface TransferirSaldoInput extends EstornarSaldoInput { cliente_destino_id: number; }
export interface EstornarProcedimentoInput { item_atendimento_id: number; }
