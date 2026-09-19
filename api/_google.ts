import { createSign } from 'node:crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

export async function getGoogleAccessToken() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey)
    throw new Error('Google service-account credentials are not configured in Vercel.')

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(
    JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  )
  const unsigned = `${header}.${claim}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey)
  const assertion = `${unsigned}.${base64url(signature)}`
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const payload = (await response.json()) as { access_token?: string; error_description?: string }
  if (!response.ok || !payload.access_token)
    throw new Error(payload.error_description || 'Google authentication failed.')
  return payload.access_token
}

export async function sheetsRequest(path: string, init?: RequestInit) {
  const token = await getGoogleAccessToken()
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || 'Google Sheets request failed.')
  return payload
}
