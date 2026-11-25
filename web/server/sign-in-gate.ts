export function signInOpen(): boolean {
  return process.env.READY_SIGN_IN === 'on';
}
