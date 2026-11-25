import { envValue } from './local-api.ts';

export function signInOpen(): boolean {
  return envValue('READY_SIGN_IN') === 'on';
}
