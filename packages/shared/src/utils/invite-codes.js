/**
 * Generate a human-friendly 6-character invite code.
 * Excludes ambiguous characters (0/O, 1/I/L).
 */
export function generateInviteCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
