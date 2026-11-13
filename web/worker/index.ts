import { env } from 'cloudflare:workers';
import pageHandler from 'vinext/server/fetch-handler';
import { DemoContext } from '../../scripts/demo-engine.ts';
import { ConfigError } from '../../src/errors.ts';
import { dispatchDemo } from '../lib/public-demo.ts';
import { readWorkerBindings } from '../lib/worker-bindings.ts';

let demo: DemoContext | undefined;

function engine(): DemoContext {
  if (demo === undefined) demo = DemoContext.fromBindings(readWorkerBindings(env));
  return demo;
}

interface PageHandler {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> | Response;
}

const pages = pageHandler as PageHandler;

export default {
  async fetch(request: Request, workerEnv: unknown, ctx: unknown): Promise<Response> {
    return dispatchDemo(request, {
      page: (incoming) => Promise.resolve(pages.fetch(incoming, workerEnv, ctx)),
      engine: async (incoming) => {
        try {
          return await engine().handle(incoming);
        } catch (error) {
          if (!(error instanceof ConfigError)) throw error;
          return Response.json({ error: 'misconfigured' }, { status: 500 });
        }
      },
    });
  },
};
