import { getOptionalRuntimeEnv } from '@/lib/env';

export function isProcedureCentricFlowEnabled(): boolean {
  return getOptionalRuntimeEnv('PROCEDURE_CENTRIC_FLOW')?.trim().toLowerCase() === 'true';
}
