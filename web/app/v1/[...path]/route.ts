import { demoEngineOrigin, localDemoEnabled } from '../../../lib/local-demo';

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (!localDemoEnabled(process.env.READY_LOCAL_DEMO)) {
    return Response.json({ error: 'demo_off' }, { status: 404 });
  }
  const { path } = await context.params;
  const url = new URL(`/v1/${path.map((segment) => encodeURIComponent(segment)).join('/')}`, demoEngineOrigin());
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType !== null) headers.set('content-type', contentType);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: await request.text(),
    });
  } catch {
    return Response.json({ error: 'demo_off' }, { status: 404 });
  }
  const responseHeaders = new Headers();
  const responseType = response.headers.get('content-type');
  if (responseType !== null) responseHeaders.set('content-type', responseType);
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: responseHeaders,
  });
}
