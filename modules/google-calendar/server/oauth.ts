import type { D1Database } from '@/lib/db';
import type { GoogleConnection } from '../contracts';
import { digest, encrypt, randomToken } from './crypto';
import { callbackUrl, EVENT_SCOPE, GoogleFailure, SCOPES, tokenRequest, type GoogleConfig } from './google-api';
import { CalendarRequestError } from './runtime';

export async function authorize(db: D1Database, config: GoogleConfig, unit: number, user: number) {
  const exists = await db.prepare('SELECT id FROM unidades WHERE id=?').bind(unit).first();
  if (!exists) throw new CalendarRequestError('Unidade não encontrada.', 404);
  const state = randomToken(); const browser = randomToken();
  await db.batch([
    db.prepare('DELETE FROM google_calendar_oauth_states WHERE expires_at<?').bind(Date.now()),
    db.prepare('INSERT INTO google_calendar_oauth_states(state_hash,browser_hash,unidade_id,usuario_id,expires_at) VALUES (?,?,?,?,?)')
      .bind(await digest(state), await digest(browser), unit, user, Date.now() + 600000),
  ]);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: callbackUrl(config), response_type: 'code',
    scope: SCOPES, access_type: 'offline', prompt: 'consent', state }).toString();
  return { url: url.toString(), browser };
}
export async function completeAuthorization(db: D1Database, config: GoogleConfig, state: string, browser: string, code: string) {
  const context = await db.prepare(`DELETE FROM google_calendar_oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *`)
    .bind(await digest(state), await digest(browser), Date.now()).first<{ unidade_id: number; usuario_id: number }>();
  if (!context) throw new CalendarRequestError('Autorização expirada. Conecte a conta novamente.');
  // Re-check the administrator's current role, not just the JWT used when starting OAuth.
  const admin = await db.prepare(`SELECT id FROM usuarios WHERE id=? AND ativo=1 AND
    (role='admin' OR EXISTS(SELECT 1 FROM usuario_roles WHERE usuario_id=usuarios.id AND role='admin'))`)
    .bind(context.usuario_id).first();
  if (!admin) throw new CalendarRequestError('Acesso de administrador necessário.', 403);
  const tokens = await tokenRequest(config, { grant_type: 'authorization_code', code, redirect_uri: callbackUrl(config) });
  if (!tokens.scope?.split(' ').includes(EVENT_SCOPE) || !tokens.refresh_token) {
    throw new CalendarRequestError('Autorize o acesso de leitura e escrita à agenda e conecte novamente.');
  }
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new GoogleFailure(response.status);
  const profile = await response.json() as { sub?: string; email?: string; email_verified?: boolean };
  if (!profile.sub || !profile.email || !profile.email_verified) throw new CalendarRequestError('Conta Google sem e-mail verificado.');
  const existing = await db.prepare('SELECT * FROM google_calendar_connections WHERE unidade_id=?').bind(context.unidade_id).first<GoogleConnection>();
  if (existing && existing.google_subject !== profile.sub) throw new CalendarRequestError('Desconecte a conta anterior antes de trocar de conta Google.', 409);
  if (existing && (existing.lease_until > Date.now() || existing.status === 'disconnecting')) throw new CalendarRequestError('Aguarde a sincronização terminar e conecte novamente.', 409);
  const other = await db.prepare('SELECT id FROM google_calendar_connections WHERE google_subject=? AND unidade_id!=?').bind(profile.sub, context.unidade_id).first();
  if (other) throw new CalendarRequestError('Esta agenda já está vinculada a outra unidade.', 409);
  const archive = !existing ? await db.prepare('SELECT * FROM google_calendar_archives WHERE unidade_id=? AND google_subject=?')
    .bind(context.unidade_id, profile.sub).first<{ connection_id: string; calendar_id: string; default_duration: number; links: string }>() : null;
  const id = existing?.id ?? archive?.connection_id ?? crypto.randomUUID();
  const encrypted = await encrypt(tokens.refresh_token, config.encryptionKey, id);
  if (existing) {
    const saved = await db.prepare(`UPDATE google_calendar_connections SET refresh_token=?,connected_by=?,email=?,status='connected',last_error=NULL,sync_requested=1
      WHERE id=? AND lease_until<? AND status!='disconnecting' RETURNING id`).bind(encrypted, context.usuario_id, profile.email, id, Date.now()).first();
    if (!saved) throw new CalendarRequestError('Integração ocupada. Tente novamente.', 409);
  } else {
    const statements = [db.prepare(`INSERT INTO google_calendar_connections(id,unidade_id,connected_by,google_subject,email,calendar_id,refresh_token,default_duration)
      VALUES (?,?,?,?,?,?,?,?)`).bind(id, context.unidade_id, context.usuario_id, profile.sub, profile.email, archive?.calendar_id ?? 'primary', encrypted, archive?.default_duration ?? 30)];
    statements.push(db.prepare(`INSERT INTO google_calendar_links(connection_id,agendamento_id,event_id,etag,remote_snapshot,local_snapshot,conflict,pending_write)
      SELECT ?,json_extract(value,'$.agendamento_id'),json_extract(value,'$.event_id'),json_extract(value,'$.etag'),
        json_extract(value,'$.remote_snapshot'),json_extract(value,'$.local_snapshot'),json_extract(value,'$.conflict'),json_extract(value,'$.pending_write')
      FROM json_each(?)`).bind(id, archive?.links ?? '[]'));
    statements.push(db.prepare(`INSERT INTO google_calendar_outbox(connection_id,agendamento_id)
      SELECT l.connection_id,l.agendamento_id FROM google_calendar_links l
      LEFT JOIN agendamentos a ON a.id=l.agendamento_id AND a.unidade_id=?
      WHERE l.connection_id=? AND (l.pending_write IS NOT NULL OR l.remote_snapshot IS NULL OR a.id IS NULL
        OR json_array(a.data_agendada,a.duracao_minutos,a.status,a.cliente_id,a.executor_id,a.unidade_id)!=l.local_snapshot)`)
      .bind(context.unidade_id, id));
    statements.push(db.prepare('DELETE FROM google_calendar_archives WHERE unidade_id=? AND google_subject=?').bind(context.unidade_id, profile.sub));
    await db.batch(statements);
  }
}
