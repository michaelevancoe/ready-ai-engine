import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { demoEngineOrigin } from '../web/lib/local-demo.ts';
import { loadDevVarsFile } from './dev-vars-file.ts';
import { DemoContext, type DemoOpenOptions } from './demo-engine.ts';

export { DemoContext, type DemoOpenOptions } from './demo-engine.ts';

export async function openDemo(envValue: string | undefined, options?: DemoOpenOptions): Promise<DemoContext> {
  return DemoContext.open(envValue, {
    ...options,
    loadDevVars: options?.loadDevVars ?? loadDevVarsFile,
  });
}

export async function listen(demo: DemoContext): Promise<void> {
  const server = createServer((req, res) => {
    void respond(demo, req, res);
  });
  const origin = new URL(demoEngineOrigin());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: Number(origin.port), host: origin.hostname }, () => {
      resolve();
    });
  });
}

async function respond(demo: DemoContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const method = req.method ?? 'GET';
    const headers = new Headers();
    const contentType = req.headers['content-type'];
    if (typeof contentType === 'string') headers.set('content-type', contentType);
    const url = new URL(req.url ?? '/', demoEngineOrigin());
    const body = Buffer.concat(chunks);
    const request = new Request(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
    });
    const response = await demo.handle(request);
    const payload = Buffer.from(await response.arrayBuffer());
    const out: Record<string, string> = {};
    const responseType = response.headers.get('content-type');
    if (responseType !== null) out['content-type'] = responseType;
    res.writeHead(response.status, out);
    res.end(payload);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}
