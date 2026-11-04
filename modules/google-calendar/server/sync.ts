import type { D1Database } from '../../../lib/db';
import type { Appointment, EventLink, GoogleConnection, GoogleEvent } from '../contracts';
import { decrypt, digest, randomToken } from './crypto';
import { assertEnabled, GoogleApi, GoogleFailure, tokenRequest, type GoogleConfig } from './google-api';
import { localSnapshot, remoteInterval, remoteSnapshot, shouldPublish, toGoogle } from './mapping';

export const APPOINTMENT_SQL = `SELECT a.*,c.nome AS cliente_nome,u.nome AS unidade_nome,p.nome AS procedimento_nome FROM agendamentos a
  JOIN clientes c ON c.id=a.cliente_id JOIN unidades u ON u.id=a.unidade_id LEFT JOIN procedimentos p ON p.id=a.procedimento_id WHERE a.id=? AND a.unidade_id=?`;
export async function loadAppointment(db: D1Database, id: number, unit: number) {
  return db.prepare(APPOINTMENT_SQL).bind(id, unit).first<Appointment>();
}
export async function loadOwnedAppointment(db: D1Database, id: number, owner: number) {
  return db.prepare(`SELECT a.*,c.nome AS cliente_nome,u.nome AS unidade_nome,p.nome AS procedimento_nome FROM agendamentos a
    JOIN clientes c ON c.id=a.cliente_id JOIN unidades u ON u.id=a.unidade_id LEFT JOIN procedimentos p ON p.id=a.procedimento_id
    JOIN usuarios owner ON owner.id=a.executor_id AND owner.ativo=1
    WHERE a.id=? AND a.executor_id=? AND (owner.role='admin'
      OR EXISTS(SELECT 1 FROM usuario_roles r WHERE r.usuario_id=owner.id AND r.role='admin')
      OR EXISTS(SELECT 1 FROM usuario_unidades m WHERE m.usuario_id=owner.id AND m.unidade_id=a.unidade_id))`)
    .bind(id, owner).first<Appointment>();
}
export async function cacheEvent(db: D1Database, connection: string, event: GoogleEvent) {
  // Keep only calendar fields: never persist attendee lists or clinical descriptions.
  const safe: GoogleEvent = { id: event.id, etag: event.etag, summary: event.summary, status: event.status,
    start: event.start, end: event.end, recurrence: event.recurrence, recurringEventId: event.recurringEventId };
  await db.prepare(`INSERT INTO google_user_calendar_events(connection_id,event_id,summary,start_at,end_at,all_day,recurring,status,etag,payload)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(connection_id,event_id) DO UPDATE SET summary=excluded.summary,
    start_at=excluded.start_at,end_at=excluded.end_at,all_day=excluded.all_day,recurring=excluded.recurring,
    status=excluded.status,etag=excluded.etag,payload=excluded.payload`).bind(connection, event.id,
    event.summary ?? '(Sem título)', event.start?.dateTime ?? event.start?.date ?? null,
    event.end?.dateTime ?? event.end?.date ?? null, event.start?.date ? 1 : 0,
    event.recurrence?.length || event.recurringEventId ? 1 : 0, event.status ?? 'confirmed', event.etag ?? null, JSON.stringify(safe)).run();
}
interface PendingWrite { deleted?: boolean; token: string; snapshot: string; local: string; revision: number; duration: number; }
async function acknowledgeWrite(db: D1Database, connection: GoogleConnection, link: EventLink, event: GoogleEvent, write: PendingWrite) {
  await db.batch([
    db.prepare('INSERT INTO google_user_calendar_suppressions(agendamento_id) VALUES (?)').bind(link.agendamento_id),
    db.prepare(`UPDATE agendamentos SET duracao_minutos=? WHERE id=? AND executor_id=? AND duracao_minutos IS NULL
      AND NOT EXISTS(SELECT 1 FROM google_user_calendar_outbox WHERE connection_id=? AND agendamento_id=? AND id>?)`)
      .bind(write.duration, link.agendamento_id, connection.usuario_id, connection.id, link.agendamento_id, write.revision),
    db.prepare(`UPDATE google_user_calendar_links SET etag=?,remote_snapshot=?,local_snapshot=?,pending_write=NULL,conflict=NULL
      WHERE connection_id=? AND agendamento_id=?`)
      .bind(event.etag ?? null, remoteSnapshot(event), write.local, connection.id, link.agendamento_id),
    db.prepare('DELETE FROM google_user_calendar_outbox WHERE connection_id=? AND agendamento_id=? AND id<=?')
      .bind(connection.id, link.agendamento_id, write.revision),
    db.prepare('DELETE FROM google_user_calendar_suppressions WHERE agendamento_id=?').bind(link.agendamento_id),
  ]);
}
async function recoverWrite(db: D1Database, connection: GoogleConnection, link: EventLink, event: GoogleEvent) {
  if (!link.pending_write) return false;
  const write = JSON.parse(link.pending_write) as PendingWrite;
  if (write.deleted && event.status === 'cancelled') {
    await db.batch([
      db.prepare('DELETE FROM google_user_calendar_links WHERE connection_id=? AND agendamento_id=?').bind(connection.id, link.agendamento_id),
      db.prepare('DELETE FROM google_user_calendar_events WHERE connection_id=? AND event_id=?').bind(connection.id, link.event_id),
      db.prepare('DELETE FROM google_user_calendar_outbox WHERE connection_id=? AND agendamento_id=? AND id<=?')
        .bind(connection.id, link.agendamento_id, write.revision),
    ]);
    return true;
  }
  if (event.extendedProperties?.private?.sorriaWrite !== write.token || remoteSnapshot(event) !== write.snapshot) return false;
  await acknowledgeWrite(db, connection, link, event, write);
  return true;
}
async function archiveConnection(db: D1Database, connection: GoogleConnection, owner: string) {
  const links = await db.prepare('SELECT * FROM google_user_calendar_links WHERE connection_id=?').bind(connection.id).all<EventLink>();
  await db.batch([
    db.prepare(`INSERT INTO google_user_calendar_archives(usuario_id,google_subject,connection_id,calendar_id,calendar_name,default_duration,links)
      SELECT usuario_id,google_subject,id,calendar_id,calendar_name,default_duration,? FROM google_user_calendar_connections WHERE id=? AND lease_owner=?
      ON CONFLICT(usuario_id,google_subject) DO UPDATE SET connection_id=excluded.connection_id,calendar_id=excluded.calendar_id,calendar_name=excluded.calendar_name,
      default_duration=excluded.default_duration,links=excluded.links`).bind(JSON.stringify(links.results), connection.id, owner),
    db.prepare('DELETE FROM google_user_calendar_connections WHERE id=? AND lease_owner=?').bind(connection.id, owner),
  ]);
}
export async function applyRemote(db: D1Database, connection: GoogleConnection, event: GoogleEvent) {
  await cacheEvent(db, connection.id, event);
  const link = await db.prepare('SELECT * FROM google_user_calendar_links WHERE connection_id=? AND event_id=?')
    .bind(connection.id, event.id).first<EventLink>();
  if (!link) return;
  if (await recoverWrite(db, connection, link, event)) return;
  const snapshot = remoteSnapshot(event);
  if (link.remote_snapshot === snapshot) {
    await db.prepare('UPDATE google_user_calendar_links SET etag=? WHERE connection_id=? AND event_id=?')
      .bind(event.etag ?? link.etag, connection.id, event.id).run();
    return;
  }
  // An insert may have reached Google before its response was saved. push() recovers that id.
  if (!link.remote_snapshot) return;
  const appointment = await loadOwnedAppointment(db, link.agendamento_id, connection.usuario_id);
  if (!appointment) return; // Reassignment/deletion is handled by the old owner's outbox, never imported back.
  const interval = remoteInterval(event);
  const terminal = appointment && !['agendado', 'pendente'].includes(appointment.status);
  const unsupported = event.status !== 'cancelled' && !interval;
  const conflict = !appointment || terminal || unsupported
    ? 'Alteração externa exige revisão: compromisso concluído, ausente, recorrente ou sem horário compatível.'
    : 'O compromisso foi alterado nos dois sistemas. Escolha qual versão manter.';
  const pending = await db.prepare('SELECT id FROM google_user_calendar_outbox WHERE connection_id=? AND agendamento_id=? LIMIT 1')
    .bind(connection.id, link.agendamento_id).first();
  if (!appointment || terminal || unsupported || pending || link.conflict) {
    await db.prepare('UPDATE google_user_calendar_links SET conflict=? WHERE connection_id=? AND event_id=?')
      .bind(conflict, connection.id, event.id).run();
    return;
  }
  const cancelled = event.status === 'cancelled';
  const next: Appointment = { ...appointment, status: cancelled ? 'cancelado' : 'agendado',
    data_agendada: cancelled ? appointment.data_agendada : interval!.start,
    duracao_minutos: cancelled ? appointment.duracao_minutos : interval!.minutes };
  const guard = `NOT EXISTS(SELECT 1 FROM google_user_calendar_outbox WHERE connection_id=? AND agendamento_id=?)`;
  await db.batch([
    db.prepare('INSERT INTO google_user_calendar_suppressions(agendamento_id) VALUES (?)').bind(appointment.id),
    db.prepare(`UPDATE agendamentos SET data_agendada=?,duracao_minutos=?,status=?,motivo_cancelamento=CASE WHEN ? THEN 'Cancelado no Google Agenda' ELSE motivo_cancelamento END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND unidade_id=? AND ${guard}`)
      .bind(next.data_agendada, next.duracao_minutos, next.status, cancelled ? 1 : 0, appointment.id, appointment.unidade_id, connection.id, appointment.id),
    db.prepare(`UPDATE google_user_calendar_links SET etag=?,remote_snapshot=?,local_snapshot=? WHERE connection_id=? AND agendamento_id=? AND ${guard}`)
      .bind(event.etag ?? null, snapshot, localSnapshot(next), connection.id, appointment.id, connection.id, appointment.id),
    db.prepare(`UPDATE google_user_calendar_links SET conflict=? WHERE connection_id=? AND agendamento_id=? AND NOT (${guard})`)
      .bind(conflict, connection.id, appointment.id, connection.id, appointment.id),
    db.prepare('DELETE FROM google_user_calendar_suppressions WHERE agendamento_id=?').bind(appointment.id),
  ]);
}

async function pull(db: D1Database, connection: GoogleConnection, api: GoogleApi, deadline: number) {
  let cursor = connection.sync_token;
  let page: string | undefined = connection.sync_page_token ?? undefined;
  let restarted = false;
  do {
    if (Date.now() > deadline) throw new Error('Sincronização extensa; continuará na próxima tentativa.');
    try {
      const result = await api.list(cursor, page);
      for (const event of result.items ?? []) await applyRemote(db, connection, event);
      page = result.nextPageToken;
      if (!page && result.nextSyncToken) {
        await db.prepare('UPDATE google_user_calendar_connections SET sync_token=?,sync_page_token=NULL,last_sync_at=? WHERE id=?')
          .bind(result.nextSyncToken, new Date().toISOString(), connection.id).run();
      } else if (page) {
        await db.prepare('UPDATE google_user_calendar_connections SET sync_page_token=? WHERE id=?').bind(page, connection.id).run();
      }
    } catch (error) {
      if (error instanceof GoogleFailure && error.status === 410 && !restarted) {
        restarted = true; cursor = null; page = undefined;
        await db.batch([
          db.prepare('UPDATE google_user_calendar_connections SET sync_token=NULL,sync_page_token=NULL WHERE id=?').bind(connection.id),
          db.prepare('DELETE FROM google_user_calendar_events WHERE connection_id=?').bind(connection.id),
        ]);
        // Retry immediately, including when the expired cursor was on the first page.
        page = '';
      } else throw error;
    }
  } while (page !== undefined);
}

async function reconcileMissing(db: D1Database, connection: GoogleConnection, api: GoogleApi) {
  const missing = await db.prepare(`SELECT l.event_id FROM google_user_calendar_links l WHERE l.connection_id=?
    AND l.remote_snapshot IS NOT NULL AND NOT EXISTS(SELECT 1 FROM google_user_calendar_events e
      WHERE e.connection_id=l.connection_id AND e.event_id=l.event_id) LIMIT 20`).bind(connection.id).all<{ event_id: string }>();
  for (const link of missing.results) {
    let event: GoogleEvent;
    try { event = await api.get(link.event_id); }
    catch (error) {
      if (!(error instanceof GoogleFailure && [404, 410].includes(error.status))) throw error;
      event = { id: link.event_id, status: 'cancelled' };
    }
    await applyRemote(db, connection, event);
  }
}

async function push(db: D1Database, connection: GoogleConnection, api: GoogleApi, deadline: number, baseUrl: string) {
  const pending = await db.prepare(`SELECT o.agendamento_id,MAX(o.id) AS revision FROM google_user_calendar_outbox o
    LEFT JOIN google_user_calendar_links l ON l.connection_id=o.connection_id AND l.agendamento_id=o.agendamento_id
    LEFT JOIN agendamentos a ON a.id=o.agendamento_id
    WHERE o.connection_id=? AND (l.conflict IS NULL OR a.id IS NULL OR a.executor_id IS NOT ?) GROUP BY o.agendamento_id ORDER BY MIN(o.id) LIMIT 20`)
    .bind(connection.id, connection.usuario_id).all<{ agendamento_id: number; revision: number }>();
  for (const job of pending.results) {
    if (Date.now() > deadline) return;
    const appointment = await loadOwnedAppointment(db, job.agendamento_id, connection.usuario_id);
    let link = await db.prepare('SELECT * FROM google_user_calendar_links WHERE connection_id=? AND agendamento_id=?')
      .bind(connection.id, job.agendamento_id).first<EventLink>();
    const publish = shouldPublish(appointment);
    if (publish && await db.prepare('SELECT 1 FROM google_user_calendar_links WHERE agendamento_id=? AND connection_id!=? LIMIT 1')
      .bind(job.agendamento_id, connection.id).first()) continue; // Old owner's removal must finish before creating the new mirror.
    if (!link && publish) {
      const id = randomToken();
      await db.prepare('INSERT INTO google_user_calendar_links(connection_id,agendamento_id,event_id) VALUES (?,?,?)')
        .bind(connection.id, job.agendamento_id, id).run();
      link = { connection_id: connection.id, agendamento_id: job.agendamento_id, event_id: id,
        etag: null, remote_snapshot: null, local_snapshot: null, conflict: null };
    }
    try {
      if (link) {
        let remote: GoogleEvent | null = null;
        try { remote = await api.get(link.event_id); }
        catch (error) { if (!(error instanceof GoogleFailure && [404, 410].includes(error.status))) throw error; }
        if (await recoverWrite(db, connection, link, remote ?? { id: link.event_id, status: 'cancelled' })) {
          // Preserve later local edits; the next pass sends their own revision.
          continue;
        }
        if (publish && remote && link.remote_snapshot && remoteSnapshot(remote) !== link.remote_snapshot) {
          await applyRemote(db, connection, remote);
          continue;
        }
        if (publish && appointment) {
          if ((link.remote_snapshot && !remote) || remote?.status === 'cancelled') {
            await db.prepare('UPDATE google_user_calendar_links SET conflict=? WHERE connection_id=? AND agendamento_id=?')
              .bind('Evento removido no Google. Escolha a versão que deseja manter.', connection.id, appointment.id).run();
            continue;
          }
          const body = toGoogle(appointment, connection, link.event_id, baseUrl);
          // Only adopt a previously-created ID if it carries this integration's ownership markers.
          if (remote && !link.remote_snapshot &&
            (remote.extendedProperties?.private?.sorriaConnection !== connection.id ||
              remote.extendedProperties?.private?.sorriaAppointment !== String(appointment.id))) {
            throw new Error('Identificador do evento já pertence a outro compromisso.');
          }
          if (remote && !remote.etag) throw new Error('Evento Google sem versão para atualização segura.');
          const resolved = { ...appointment, duracao_minutos: appointment.duracao_minutos ?? connection.default_duration };
          const write: PendingWrite = { token: randomToken(), snapshot: remoteSnapshot(body), local: localSnapshot(resolved),
            revision: job.revision, duration: resolved.duracao_minutos };
          body.extendedProperties!.private!.sorriaWrite = write.token;
          await db.prepare('UPDATE google_user_calendar_links SET pending_write=? WHERE connection_id=? AND agendamento_id=?')
            .bind(JSON.stringify(write), connection.id, appointment.id).run();
          const written = remote ? await api.patch(link.event_id, body, remote.etag!) : await api.insert(body);
          await cacheEvent(db, connection.id, written);
          await acknowledgeWrite(db, connection, link, written, write);
        } else {
          if (remote && remote.status !== 'cancelled') {
            if (!remote.etag) throw new Error('Evento Google sem versão para exclusão segura.');
            const write: PendingWrite = { deleted: true, token: randomToken(), revision: job.revision, snapshot: '', local: '', duration: 0 };
            await db.prepare('UPDATE google_user_calendar_links SET pending_write=? WHERE connection_id=? AND agendamento_id=?')
              .bind(JSON.stringify(write), connection.id, job.agendamento_id).run();
            await api.delete(link.event_id, remote.etag);
          }
          await db.batch([
            db.prepare('DELETE FROM google_user_calendar_links WHERE connection_id=? AND agendamento_id=?').bind(connection.id, job.agendamento_id),
            db.prepare('DELETE FROM google_user_calendar_events WHERE connection_id=? AND event_id=?').bind(connection.id, link.event_id),
          ]);
        }
      }
      await db.prepare('DELETE FROM google_user_calendar_outbox WHERE connection_id=? AND agendamento_id=? AND id<=?')
        .bind(connection.id, job.agendamento_id, job.revision).run();
    } catch (error) {
      if (error instanceof GoogleFailure && [409, 412].includes(error.status)) {
        // A concurrent Google edit (or uncertain insert) is re-read on the next attempt.
        throw new Error('Evento mudou durante a sincronização. Será consultado novamente.');
      }
      throw error;
    }
  }
}

async function maintainChannels(db: D1Database, connection: GoogleConnection, api: GoogleApi, baseUrl: string) {
  const channels = (await db.prepare('SELECT * FROM google_user_calendar_channels WHERE connection_id=? ORDER BY expires_at DESC')
    .bind(connection.id).all<{ id: string; resource_id: string | null; expires_at: number }>()).results;
  if (!channels.some(channel => channel.resource_id && channel.expires_at > Date.now() + 86400000)) {
    const id = crypto.randomUUID(); const token = randomToken();
    // Persist before watch: Google's initial notification may arrive before the HTTP response.
    await db.prepare('INSERT INTO google_user_calendar_channels(id,connection_id,token_hash,expires_at) VALUES (?,?,?,?)')
      .bind(id, connection.id, await digest(token), Date.now() + 600000).run();
    const created = await api.watch({ id, token, type: 'web_hook',
      address: `${baseUrl}/api/integracoes/google/webhook`, expiration: String(Date.now() + 7 * 86400000) });
    await db.prepare('UPDATE google_user_calendar_channels SET resource_id=?,expires_at=? WHERE id=?')
      .bind(created.resourceId, Number(created.expiration), id).run();
  }
  // Keep old channels until the replacement is confirmed; overlap is safe and avoids a gap.
  for (const channel of channels.slice(channels[0]?.expires_at > Date.now() + 86400000 ? 1 : 0)) {
    if (channel.resource_id) {
      try { await api.stop(channel.id, channel.resource_id); }
      catch (error) { if (!(error instanceof GoogleFailure && [404, 410].includes(error.status))) continue; }
    }
    await db.prepare('DELETE FROM google_user_calendar_channels WHERE id=?').bind(channel.id).run();
  }
}
export async function processConnection(db: D1Database, config: GoogleConfig, id: string) {
  assertEnabled(config);
  const owner = randomToken(); const now = Date.now();
  const connection = await db.prepare(`UPDATE google_user_calendar_connections SET lease_owner=?,lease_until=?
    WHERE id=? AND lease_until<? AND status!='reconnect' RETURNING *`)
    .bind(owner, now + 600000, id, now).first<GoogleConnection>();
  if (!connection) return;
  const deadline = now + 180000;
  try {
    const tokens = await tokenRequest(config, { grant_type: 'refresh_token', refresh_token: await decrypt(connection.refresh_token, config.encryptionKey, connection.id) });
    const api = new GoogleApi(tokens.access_token, connection.calendar_id);
    if (connection.status === 'disconnecting') {
      const channels = await db.prepare('SELECT id,resource_id FROM google_user_calendar_channels WHERE connection_id=?').bind(id)
        .all<{ id: string; resource_id: string | null }>();
      for (const channel of channels.results) {
        if (channel.resource_id) {
          try { await api.stop(channel.id, channel.resource_id); }
          catch (error) { if (!(error instanceof GoogleFailure && [404, 410].includes(error.status))) throw error; }
        }
      }
      await archiveConnection(db, connection, owner);
      return;
    }
    // Clear request before I/O; a webhook arriving during sync sets it again and is retained.
    await db.prepare('UPDATE google_user_calendar_connections SET sync_requested=0 WHERE id=?').bind(id).run();
    await pull(db, connection, api, deadline);
    await reconcileMissing(db, connection, api);
    await push(db, connection, api, deadline, config.baseUrl);
    await maintainChannels(db, connection, api, config.baseUrl);
    await db.prepare("UPDATE google_user_calendar_connections SET status='connected',last_error=NULL WHERE id=? AND status!='disconnecting'").bind(id).run();
  } catch (error) {
    const reconnect = error instanceof GoogleFailure && error.reconnect;
    if (connection.status === 'disconnecting' && reconnect) {
      // Revoked credentials cannot stop channels; deletion prevents further processing locally.
      await archiveConnection(db, connection, owner);
      return;
    }
    const message = reconnect ? 'Reconecte a conta Google.' : 'Falha ao sincronizar. Uma nova tentativa será feita automaticamente.';
    await db.prepare(`UPDATE google_user_calendar_connections SET status=CASE WHEN status='disconnecting' THEN status ELSE ? END,
      last_error=?,sync_requested=1 WHERE id=? AND lease_owner=?`)
      .bind(reconnect ? 'reconnect' : 'error', message, id, owner).run();
    throw error;
  } finally {
    await db.prepare('UPDATE google_user_calendar_connections SET lease_owner=NULL,lease_until=0 WHERE id=? AND lease_owner=?').bind(id, owner).run();
  }
}
