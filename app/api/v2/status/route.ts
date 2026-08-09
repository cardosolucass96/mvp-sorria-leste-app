import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { isProcedureCentricFlowEnabled } from '@/lib/v2/config';

export const GET = withAuth(async () => NextResponse.json({
  enabled: isProcedureCentricFlowEnabled(),
  version: 'v2',
}));
