import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { digest } from '@/modules/google-calendar/server/crypto';
export async function POST(request: NextRequest) {
  const channel = request.headers.get('x-goog-channel-id');
  const token = request.headers.get('x-goog-channel-token');
  const resource = request.headers.get('x-goog-resource-id');
  if (!channel || !token || !resource || token.length > 256 || channel.length > 256) return new Response(null, { status: 204 });
  try {
    // Hash lookup authenticates the random channel secret without comparing raw secrets.
    await getDb().prepare(`UPDATE google_user_calendar_connections SET sync_requested=1 WHERE id IN
      (SELECT connection_id FROM google_user_calendar_channels WHERE id=? AND token_hash=? AND expires_at>?
        AND (resource_id IS NULL OR resource_id=?)) AND status!='disconnecting'`)
      .bind(channel, await digest(token), Date.now(), resource).run();
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
}
