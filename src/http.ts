import { InputError } from './errors.ts';

const MAX_BODY_CHARS = 16_384;

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type');
  if (type === null || !type.toLowerCase().includes('application/json')) throw new InputError();
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_BODY_CHARS) throw new InputError();
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw new InputError();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InputError();
  }
}
