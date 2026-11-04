import type { D1Database } from '@/lib/db';
import type { EventLink, GoogleConnection, GoogleEvent } from '../contracts';
import { randomToken, decrypt } from './crypto';
import { CalendarRequestError } from './runtime';
import { GoogleApi, GoogleFailure, tokenRequest, type GoogleConfig } from './google-api';
import { applyRemote, cacheEvent, loadAppointment } from './sync';
import { localSnapshot, remoteInterval, remoteSnapshot } from './mapping';

export async function withConnectionLock<T>(db: D1Database, ownerId: number, work: (connection: GoogleConnection) => Promise<T>): Promise<T> {
  const owner = randomToken();
  const row = await db.prepare(`UPDATE google_user_calendar_connections SET lease_owner=?,lease_until=? WHERE usuario_id=?
    AND lease_until<? AND status IN ('connected','error') RETURNING *`).bind(owner, Date.now() + 600000, ownerId, Date.now()).first<GoogleConnection>();
  if (!row) throw new CalendarRequestError('Integração indisponível ou ocupada. Aguarde e tente novamente.', 409);
  try { return await work(row); }
  finally { await db.prepare('UPDATE google_user_calendar_connections SET lease_owner=NULL,lease_until=0 WHERE id=? AND lease_owner=?').bind(row.id, owner).run(); }
}
async function freshEvent(config: GoogleConfig, connection: GoogleConnection, id: string) {
  const tokens = await tokenRequest(config, { grant_type: 'refresh_token', refresh_token: await decrypt(connection.refresh_token, config.encryptionKey, connection.id) });
  const api = new GoogleApi(tokens.access_token, connection.calendar_id);
  try { return await api.get(id); }
  catch (error) {
    if (error instanceof GoogleFailure && [404, 410].includes(error.status)) return { id, status: 'cancelled' } as GoogleEvent;
    throw error;
  }
}
export async function linkExternal(db: D1Database, config: GoogleConfig, unit: number, appointmentId: number, eventId: string, owner: number) {
  return withConnectionLock(db, owner, async connection => {
    const event = await freshEvent(config, connection, eventId);
    if (event.status === 'cancelled' || !remoteInterval(event)) throw new CalendarRequestError('Selecione um evento com horário, sem recorrência, entre 5 e 480 minutos.');
    const appointment = await loadAppointment(db, appointmentId, unit);
    if (!appointment || appointment.executor_id !== connection.usuario_id || appointment.status !== 'agendado' || !appointment.data_agendada) throw new CalendarRequestError('Selecione um agendamento ativo desta unidade.', 404);
    const exists = await db.prepare('SELECT 1 FROM google_user_calendar_links WHERE (connection_id=? AND event_id=?) OR agendamento_id=?')
      .bind(connection.id, eventId, appointmentId).first();
    if (exists) throw new CalendarRequestError('Evento ou agendamento já vinculado.', 409);
    await cacheEvent(db, connection.id, event);
    await db.batch([
      db.prepare('INSERT INTO google_user_calendar_links(connection_id,agendamento_id,event_id,etag,remote_snapshot,local_snapshot) VALUES (?,?,?,?,?,?)')
        .bind(connection.id, appointmentId, eventId, event.etag ?? null, remoteSnapshot(event), localSnapshot(appointment)),
      db.prepare('INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id) VALUES (?,?)').bind(connection.id, appointmentId),
    ]);
  });
}
export async function resolveConflict(db: D1Database, config: GoogleConfig, unit: number, appointmentId: number, choice: 'local' | 'google', owner: number) {
  return withConnectionLock(db, owner, async connection => {
    const link = await db.prepare('SELECT * FROM google_user_calendar_links WHERE connection_id=? AND agendamento_id=? AND conflict IS NOT NULL')
      .bind(connection.id, appointmentId).first<EventLink>();
    if (!link) throw new CalendarRequestError('Conflito não encontrado.', 404);
    const owned = await loadAppointment(db, appointmentId, unit);
    if (!owned || owned.executor_id !== connection.usuario_id) throw new CalendarRequestError('Agendamento não pertence a este responsável nesta unidade.', 404);
    const revision = await db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM google_user_calendar_outbox WHERE connection_id=? AND agendamento_id=?')
      .bind(connection.id, appointmentId).first<{ id: number }>();
    const event = await freshEvent(config, connection, link.event_id);
    await cacheEvent(db, connection.id, event);
    if (choice === 'local') {
      const id = event.status === 'cancelled' ? randomToken() : link.event_id;
      await db.batch([
        db.prepare('UPDATE google_user_calendar_links SET pending_write=NULL,conflict=NULL,event_id=?,etag=?,remote_snapshot=? WHERE connection_id=? AND agendamento_id=?')
          .bind(id, id === link.event_id ? event.etag ?? null : null, id === link.event_id ? remoteSnapshot(event) : null, connection.id, appointmentId),
        db.prepare('INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id) VALUES (?,?)').bind(connection.id, appointmentId),
      ]);
    } else {
      const appointment = await loadAppointment(db, appointmentId, unit);
      if (!appointment || appointment.executor_id !== connection.usuario_id || !['agendado','pendente'].includes(appointment.status)) throw new CalendarRequestError('Compromissos concluídos não podem ser alterados pelo Google.');
      if (event.status !== 'cancelled' && !remoteInterval(event)) throw new CalendarRequestError('Evento recorrente ou de dia inteiro não pode substituir uma consulta.');
      await db.batch([
        db.prepare('DELETE FROM google_user_calendar_outbox WHERE connection_id=? AND agendamento_id=? AND id<=?').bind(connection.id, appointmentId, revision?.id ?? 0),
        // Force comparison even if the remote event reverted to the previous baseline.
        db.prepare("UPDATE google_user_calendar_links SET pending_write=NULL,conflict=NULL,remote_snapshot='resolve' WHERE connection_id=? AND agendamento_id=?").bind(connection.id, appointmentId),
      ]);
      await applyRemote(db, connection, event);
    }
    await db.prepare('UPDATE google_user_calendar_connections SET sync_requested=1 WHERE id=?').bind(connection.id).run();
  });
}
