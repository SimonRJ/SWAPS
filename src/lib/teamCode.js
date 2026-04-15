export function randomCode(length) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export function createTeamCredentials() {
  return {
    teamId: randomCode(8),
    passcode: randomCode(6)
  }
}

export async function hashPasscode(teamId, passcode) {
  const data = new TextEncoder().encode(`${teamId}:${passcode}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
