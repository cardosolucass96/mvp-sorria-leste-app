import { oauthProvider } from './oauth';
import type { Env } from './types';

export default {
  fetch(request: Request, env: Env, context: ExecutionContext) {
    return oauthProvider.fetch(request, env, context);
  },
} satisfies ExportedHandler<Env>;
