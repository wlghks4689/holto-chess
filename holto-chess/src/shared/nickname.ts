/** Public profile nickname. Match the existing Unicode room-name alphabet and code-point limit. */
export function normalizeNickname(value: unknown): string | null {
  // Reject controls before trim, including leading/trailing tabs and line breaks.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return null;
  const name = value.trim();
  return /^[\p{L}\p{N} _-]{1,8}$/u.test(name) ? name : null;
}
