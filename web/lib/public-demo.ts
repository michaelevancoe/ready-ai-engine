export const NOINDEX = 'noindex';

export const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

export type DemoRoute = 'robots' | 'engine' | 'page';

export function classifyDemoPath(pathname: string): DemoRoute {
  if (pathname === '/robots.txt') return 'robots';
  if (pathname === '/v1' || pathname.startsWith('/v1/')) return 'engine';
  return 'page';
}

export function withNoindex(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', NOINDEX);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function dispatchDemo(
  request: Request,
  handlers: {
    page: (request: Request) => Promise<Response>;
    engine: (request: Request) => Promise<Response>;
  },
): Promise<Response> {
  const kind = classifyDemoPath(new URL(request.url).pathname);
  switch (kind) {
    case 'robots':
      return withNoindex(
        new Response(ROBOTS_TXT, {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
      );
    case 'engine':
      return withNoindex(await handlers.engine(request));
    case 'page':
      return withNoindex(await handlers.page(request));
    default: {
      const leftover: never = kind;
      return leftover;
    }
  }
}
