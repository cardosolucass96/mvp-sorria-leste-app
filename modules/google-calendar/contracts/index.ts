export interface GoogleEvent {
  id: string;
  etag?: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  recurrence?: string[];
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
}
export interface GoogleConnection {
  visible_calendar_ids?: string | null;
  usuario_id: number;
  id: string;
  unidade_id: number;
  connected_by: number;
  google_subject: string;
  email: string;
  calendar_id: string;
  calendar_name?: string;
  refresh_token: string;
  status: 'connected' | 'error' | 'reconnect' | 'disconnecting';
  default_duration: number;
  sync_token: string | null;
  sync_page_token: string | null;
  sync_requested: number;
  last_sync_at: string | null;
  last_error: string | null;
  lease_owner: string | null;
  lease_until: number;
}
export interface Appointment {
  id: number;
  unidade_id: number;
  cliente_id: number;
  cliente_nome: string;
  unidade_nome?: string;
  procedimento_id?: number | null;
  procedimento_nome?: string | null;
  observacoes?: string | null;
  executor_id: number | null;
  data_agendada: string | null;
  duracao_minutos: number | null;
  status: string;
}
export interface EventLink {
  connection_id: string;
  agendamento_id: number;
  event_id: string;
  etag: string | null;
  pending_write?: string | null;
  remote_snapshot: string | null;
  local_snapshot: string | null;
  conflict: string | null;
}
export interface ConnectionStatus {
  owner_id?: number;
  owner_name?: string;
  can_manage?: boolean;
  calendar_id?: string;
  calendar_name?: string;
  connected: boolean;
  email?: string;
  status?: string;
  last_sync_at?: string | null;
  last_error?: string | null;
  default_duration?: number;
  pending?: number;
  conflicts?: { agendamento_id: number; conflict: string }[];
}
export interface ExternalEvent {
  can_link?: boolean;
  calendar_name?: string;
  event_id: string;
  summary: string;
  start_at: string | null;
  end_at: string | null;
  all_day: number;
  recurring: number;
}
