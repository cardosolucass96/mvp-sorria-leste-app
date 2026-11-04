import type { D1Database } from '@/lib/db';
import type { EventLink, GoogleConnection } from '../contracts';
import { decrypt } from './crypto';
import { GoogleApi, GoogleFailure, tokenRequest, type GoogleConfig } from './google-api';
import { CalendarRequestError } from './runtime';
import { withConnectionLock } from './actions';

type Calendar = { id: string; summary?: string; summaryOverride?: string; accessRole: string; primary?: boolean; deleted?: boolean };
export async function calendarChoices(config: GoogleConfig, connection: GoogleConnection) {
  const tokens = await tokenRequest(config, { grant_type: 'refresh_token', refresh_token: await decrypt(connection.refresh_token, config.encryptionKey, connection.id) });
  const api = new GoogleApi(tokens.access_token, connection.calendar_id);
  const items: { id: string; name: string }[] = [];
  let page: string | undefined;
  do {
    const query = new URLSearchParams({ minAccessRole: 'writer', maxResults: '250' });
    if (page) query.set('pageToken', page);
    let result: { items?: Calendar[]; nextPageToken?: string };
    try { result = await api.request('users/me/calendarList?' + query); }
    catch (error) {
      if (error instanceof GoogleFailure && error.status === 403) throw new CalendarRequestError('Reconecte o Google e autorize a leitura da lista de agendas.', 403);
      throw error;
    }
    for (const calendar of result.items ?? []) {
      if (!calendar.deleted && ['writer', 'owner'].includes(calendar.accessRole)) {
        items.push({ id: calendar.primary ? 'primary' : calendar.id, name: calendar.summaryOverride || calendar.summary || '(Sem título)' });
      }
    }
    page = result.nextPageToken;
  } while (page);
  return { items, api };
}
export async function selectCalendar(db: D1Database, config: GoogleConfig, owner: number, calendarId: string) {
  return withConnectionLock(db, owner, async connection => {
    const { items, api } = await calendarChoices(config, connection);
    const selected = items.find(item => item.id === calendarId);
    if (!selected) throw new CalendarRequestError('Selecione uma agenda em que esta conta tenha permissão de edição.', 400);
    if (selected.id === connection.calendar_id) {
      await db.prepare('UPDATE google_user_calendar_connections SET calendar_name=? WHERE id=?').bind(selected.name, connection.id).run();
      return;
    }
    const pending = await db.prepare('SELECT 1 FROM google_user_calendar_outbox WHERE connection_id=? LIMIT 1').bind(connection.id).first();
    if (pending) throw new CalendarRequestError('Conclua as sincronizações pendentes e resolva os conflitos antes de trocar a agenda.', 409);
    const links = await db.prepare('SELECT * FROM google_user_calendar_links WHERE connection_id=?').bind(connection.id).all<EventLink>();
    const saved = await db.prepare('SELECT links FROM google_user_calendar_saved_calendars WHERE usuario_id=? AND google_subject=? AND calendar_id=?')
      .bind(owner, connection.google_subject, selected.id).first<{ links: string }>();
    const channels = await db.prepare('SELECT id,resource_id FROM google_user_calendar_channels WHERE connection_id=?').bind(connection.id).all<{ id: string; resource_id: string | null }>();
    // If a later step fails, maintenance must renew any channel already stopped.
    await db.prepare('UPDATE google_user_calendar_channels SET expires_at=0 WHERE connection_id=?').bind(connection.id).run();
    for (const channel of channels.results) {
      if (!channel.resource_id) continue;
      try { await api.stop(channel.id, channel.resource_id); }
      catch (error) { if (!(error instanceof GoogleFailure && [404, 410].includes(error.status))) throw error; }
    }
    try {
      await db.batch([
        // The trigger rejects concurrent appointment writes, rolling back the entire switch.
        db.prepare(`UPDATE google_user_calendar_connections SET calendar_id=?,calendar_name=?,sync_token=NULL,sync_page_token=NULL,
          last_sync_at=NULL,last_error=NULL,sync_requested=1,status='connected' WHERE id=?`)
          .bind(selected.id, selected.name, connection.id),
        db.prepare(`INSERT INTO google_user_calendar_saved_calendars(usuario_id,google_subject,calendar_id,links) VALUES (?,?,?,?)
          ON CONFLICT(usuario_id,google_subject,calendar_id) DO UPDATE SET links=excluded.links`)
          .bind(owner, connection.google_subject, connection.calendar_id, JSON.stringify(links.results)),
        db.prepare('DELETE FROM google_user_calendar_links WHERE connection_id=?').bind(connection.id),
        db.prepare('DELETE FROM google_user_calendar_events WHERE connection_id=?').bind(connection.id),
        db.prepare('DELETE FROM google_user_calendar_channels WHERE connection_id=?').bind(connection.id),
        db.prepare(`INSERT INTO google_user_calendar_links(connection_id,agendamento_id,event_id,etag,remote_snapshot,local_snapshot,conflict,pending_write)
          SELECT ?,json_extract(value,'$.agendamento_id'),json_extract(value,'$.event_id'),json_extract(value,'$.etag'),
            json_extract(value,'$.remote_snapshot'),json_extract(value,'$.local_snapshot'),json_extract(value,'$.conflict'),json_extract(value,'$.pending_write')
          FROM json_each(?)`).bind(connection.id, saved?.links ?? '[]'),
        db.prepare(`INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id)
          SELECT l.connection_id,l.agendamento_id FROM google_user_calendar_links l LEFT JOIN agendamentos a ON a.id=l.agendamento_id AND a.executor_id=?
          WHERE l.connection_id=? AND (l.pending_write IS NOT NULL OR l.remote_snapshot IS NULL OR a.id IS NULL OR
            json_array(a.data_agendada,a.duracao_minutos,a.status,a.cliente_id,a.executor_id,a.unidade_id,a.procedimento_id,a.observacoes)!=l.local_snapshot)`)
          .bind(owner, connection.id),
        db.prepare('DELETE FROM google_user_calendar_saved_calendars WHERE usuario_id=? AND google_subject=? AND calendar_id=?')
          .bind(owner, connection.google_subject, selected.id),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('calendar_sync_pending')) throw new CalendarRequestError('Um agendamento foi alterado durante a troca. Aguarde a sincronização e tente novamente.', 409);
      throw error;
    }
  });
}
