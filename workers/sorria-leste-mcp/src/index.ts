import { oauthProvider } from './oauth';
import type { Env, WorkerExecutionContext } from './types';

interface WorkerHandler {
  fetch(request: Request, env: Env, context: WorkerExecutionContext): Response | Promise<Response>;
}

export default {
  fetch(request: Request, env: Env, context: WorkerExecutionContext) {
    return oauthProvider.fetch(request, env, context as never);
  },
} satisfies WorkerHandler;
