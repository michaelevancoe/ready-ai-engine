import { ROBOTS_TXT } from '../../lib/public-demo';

export function GET(): Response {
  return new Response(ROBOTS_TXT, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
