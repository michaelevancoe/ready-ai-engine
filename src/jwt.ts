import { isUuid } from './ids.ts';
import { isRecord } from './schema.ts';

export interface JwtClaims {
  sub: string;
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + '='.repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signHs256(claims: JwtClaims, secret: string): Promise<string> {
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(claims)));
  const data = encoder.encode(`${header}.${payload}`);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), data));
  return `${header}.${payload}.${bytesToBase64Url(signature)}`;
}

export async function verifyHs256(
  token: string,
  secret: string,
  nowMs: number,
): Promise<JwtClaims | null> {
  if (secret.trim() === '') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (encodedHeader === undefined || encodedPayload === undefined || encodedSignature === undefined) {
    return null;
  }

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(decoder.decode(base64UrlToBytes(encodedHeader))) as unknown;
    payload = JSON.parse(decoder.decode(base64UrlToBytes(encodedPayload))) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(header) || header.alg !== 'HS256') return null;
  if (header.typ !== undefined && header.typ !== 'JWT') return null;
  if (!isRecord(payload) || typeof payload.sub !== 'string' || !isUuid(payload.sub)) return null;
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
  if (payload.exp * 1000 <= nowMs) return null;

  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64UrlToBytes(encodedSignature);
  } catch {
    return null;
  }
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), signature, data);
  } catch {
    return null;
  }
  if (!valid) return null;
  return { sub: payload.sub, exp: payload.exp };
}
