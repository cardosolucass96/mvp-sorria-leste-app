import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { withUnitRole } from '@/lib/auth/middleware';
import { getOptionalRuntimeEnv } from '@/lib/env';

export const GET = withUnitRole(['admin'], async () => {
  const { env } = getCloudflareContext();
  const metadata = (env as Partial<CloudflareRefactorEnv>).CF_VERSION_METADATA;
  return NextResponse.json({
    environment: getOptionalRuntimeEnv('ENVIRONMENT'),
    revision: getOptionalRuntimeEnv('CODE_REVISION'),
    schema_revision: getOptionalRuntimeEnv('SCHEMA_REVISION'),
    worker_version: metadata?.id ?? null,
    deployed_at: metadata?.timestamp ?? null,
  });
});
