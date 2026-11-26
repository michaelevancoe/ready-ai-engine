export function pendingApprovalCopy(
  leader: string,
  child: string,
): { readonly button: string; readonly status: string } {
  return {
    button: `Sharing with ${leader}\u2026`,
    status: `Sharing ${child}'s brief with ${leader}. This takes a few seconds.`,
  };
}
