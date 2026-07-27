import { oauthProvider } from './oauth';
import { handleSdrApi } from './sdr-api';
import type { Env, WorkerExecutionContext } from './types';

interface WorkerHandler {
  fetch(request: Request, env: Env, context: WorkerExecutionContext): Response | Promise<Response>;
}

export default {
  fetch(request: Request, env: Env, context: WorkerExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/sdr/')) {
      return handleSdrApi(request, env);
    }
    return oauthProvider.fetch(request, env, context as never);
  },
} satisfies WorkerHandler;
