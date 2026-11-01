import 'server-only';
import { getOptionalRuntimeEnv } from '@/lib/env';

export function assertExternalSideEffectsEnabled() {
  if (getOptionalRuntimeEnv('ENVIRONMENT') === 'refactor'
    || getOptionalRuntimeEnv('EXTERNAL_SIDE_EFFECTS_ENABLED') === 'false') {
    throw new Error('Integrações externas desativadas neste ambiente de validação.');
  }
}
