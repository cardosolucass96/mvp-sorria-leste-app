import { oauthProvider } from './oauth';
import type { Env } from './types';

export default {
  fetch(request, env, context) {
    return oauthProvider.fetch(request, env, context);
  },
} satisfies ExportedHandler<Env>;
