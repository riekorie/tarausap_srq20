import { sheetsRequest } from './_google'

const LOG_ID = process.env.LOG_SPREADSHEET_ID || '1paCZ_Y_ksFUUlbo8-N4E7zhjhlYoct9Spzy8c597Lyc'
const LOG_TAB = process.env.LOG_SHEET_NAME || 'Sheet1'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  try {
    const range = encodeURIComponent(`'${LOG_TAB}'!A:C`)
    await sheetsRequest(
      `spreadsheets/${LOG_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        body: JSON.stringify({ values: [[new Date().toISOString(), email, 'Dashboard opened']] }),
      },
    )
    return res.status(200).json({ ok: true })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Unable to record dashboard access.' })
  }
}
