import { processConnection } from '../../../modules/google-calendar/server/sync';
import type { GoogleConfig } from '../../../modules/google-calendar/server/google-api';

function configuration(env: Env): GoogleConfig {
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
    encryptionKey: env.GOOGLE_TOKEN_ENCRYPTION_KEY, baseUrl: env.GOOGLE_APP_BASE_URL,
    enabled: String(env.GOOGLE_CALENDAR_ENABLED) === 'true' };
}
export default {
  async scheduled(_event, env) {
    if (String(env.GOOGLE_CALENDAR_ENABLED) !== 'true') return;
    // Durable outbox is the source of truth; a failed queue send is retried on the next tick.
    const due = await env.DB.prepare(`SELECT c.id FROM google_user_calendar_connections c WHERE c.status!='reconnect' AND c.lease_until<? AND
      (c.sync_requested=1 OR c.last_sync_at IS NULL OR c.last_sync_at<? OR c.status='disconnecting'
       OR EXISTS(SELECT 1 FROM google_user_calendar_outbox o LEFT JOIN google_user_calendar_links l
         ON l.connection_id=o.connection_id AND l.agendamento_id=o.agendamento_id
         LEFT JOIN agendamentos a ON a.id=o.agendamento_id
         WHERE o.connection_id=c.id AND (l.conflict IS NULL OR a.id IS NULL OR a.executor_id IS NOT c.usuario_id))) ORDER BY c.last_sync_at LIMIT 100`)
      .bind(Date.now(), new Date(Date.now() - 15 * 60000).toISOString()).all<{ id: string }>();
    for (const connection of due.results) await env.CALENDAR_QUEUE.send({ connectionId: connection.id });
  },
  async queue(batch, env) {
    if (String(env.GOOGLE_CALENDAR_ENABLED) !== 'true') { batch.ackAll(); return; }
    for (const message of batch.messages) {
      const body = message.body as { connectionId?: unknown };
      if (typeof body?.connectionId !== 'string') { message.ack(); continue; }
      try {
        await processConnection(env.DB, configuration(env), body.connectionId);
        message.ack();
      } catch {
        console.error(JSON.stringify({ event: 'google_user_calendar_sync_failed', connectionId: body.connectionId }));
        message.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<Env>;
