/** Maps a failed collaboration commit to HTTP. `null` means applied or duplicate. */
export function httpStatusForCollaboration(status: string): number | null {
  if (status === 'conflict') return 409;
  if (status === 'forbidden') return 403;
  if (status === 'not_found') return 404;
  if (status === 'invalid') return 400;
  return null;
}
