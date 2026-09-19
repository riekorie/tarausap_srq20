import { sheetsRequest } from './_google'

const SOURCE_ID =
  process.env.SOURCE_SPREADSHEET_ID || '1argkPTQyXumcZ5SQE7oGXUv6i1KfW7wKMXYzWzxYPwc'
const SOURCE_TAB = process.env.SOURCE_SHEET_NAME || 'Sheet1'
const CUTOFF = 8

const value = (row: string[], index: number) => (index >= 0 ? String(row[index] || '').trim() : '')
const find = (headers: string[], patterns: RegExp[]) =>
  headers.findIndex((h) => patterns.some((p) => p.test(h.trim())))
const normalize = (answer: string) =>
  /^(yes|oo)$/i.test(answer.trim()) ? 'yes' : /^(no|hindi)$/i.test(answer.trim()) ? 'no' : ''
const maskEmail = (email: string) => {
  const [local, domain] = email.split('@')
  return domain ? `${local.slice(0, 2)}***@${domain}` : email
}
const maskContact = (text: string) =>
  text.length > 4 ? `${text.slice(0, 2)}****${text.slice(-2)}` : text
const age = (text: string) => {
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return 0
  const now = new Date()
  let years = now.getFullYear() - date.getFullYear()
  if (now < new Date(now.getFullYear(), date.getMonth(), date.getDate())) years--
  return years >= 0 && years <= 120 ? years : 0
}

export default async function handler(_req: any, res: any) {
  try {
    const range = encodeURIComponent(`'${SOURCE_TAB}'`)
    const data = await sheetsRequest(
      `spreadsheets/${SOURCE_ID}/values/${range}?majorDimension=ROWS`,
    )
    const rows: string[][] = data.values || []
    if (!rows.length) return res.status(200).json({ participants: [] })
    const headers = rows[0].map((h) =>
      String(h || '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    const col = {
      timestamp: find(headers, [/^timestamp$/i]),
      email: find(headers, [/^email address$/i, /^email$/i]),
      last: find(headers, [/^last name/i]),
      first: find(headers, [/^first name/i]),
      middle: find(headers, [/^middle name/i]),
      extension: find(headers, [/^extension/i]),
      birthdate: find(headers, [/^birthdate/i, /^birth date/i]),
      civil: find(headers, [/^civil status/i]),
      sex: find(headers, [/^sex$/i]),
      gender: find(headers, [/^gender$/i]),
      contact: find(headers, [/^contact number/i, /^mobile/i, /^phone/i]),
      school: find(headers, [/^name of school/i]),
      course: find(headers, [/^program\/course/i, /^program|course/i]),
      year: find(headers, [/^year level/i]),
      role: find(headers, [/^current role/i, /role in the tara basa/i]),
      participation: find(headers, [/^i would like to participate as/i]),
    }
    const itemCols = headers
      .map((header, index) => {
        const match = header.match(/^\s*(\d+)\.\s*(.*)$/)
        return match && +match[1] >= 1 && +match[1] <= 20
          ? { number: +match[1], index, label: match[2].trim() }
          : null
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.number - b.number) as {
      number: number
      index: number
      label: string
    }[]
    const submissions = rows
      .slice(1)
      .filter((row) => row.some((v) => String(v || '').trim()))
      .map((row, rowIndex) => {
        const items = itemCols.map((item) => {
          const response = value(row, item.index)
          const answer = normalize(response)
          return {
            number: item.number,
            label: item.label,
            response,
            score: answer === 'yes' ? 1 : answer === 'no' ? 0 : null,
            isCritical: item.number === 17,
            isYes: answer === 'yes',
          }
        })
        const answered = items.filter((i) => i.score !== null),
          score = answered.reduce((n, i) => n + (i.score || 0), 0),
          complete = items.length === 20 && answered.length === 20,
          item17Yes = items.some((i) => i.number === 17 && i.isYes)
        const result = !complete
          ? 'incomplete'
          : item17Yes
            ? 'critical'
            : score >= CUTOFF
              ? 'above'
              : 'below'
        const resultLabel =
          result === 'incomplete'
            ? 'Incomplete response'
            : result === 'critical'
              ? 'Item 17 flagged'
              : result === 'above'
                ? 'Above selected cut-off'
                : 'Below selected cut-off'
        const recommendation =
          result === 'incomplete'
            ? 'Complete all 20 items before interpreting the score.'
            : result === 'critical'
              ? 'Immediate confidential safety review according to the approved referral protocol.'
              : result === 'above'
                ? 'Confidential follow-up and further assessment recommended.'
                : 'No elevated screen based on the selected cut-off. Continue appropriate monitoring.'
        const name =
          [
            value(row, col.first),
            value(row, col.middle),
            value(row, col.last),
            value(row, col.extension),
          ]
            .filter(Boolean)
            .join(' ') ||
          value(row, col.email) ||
          'Unnamed participant'
        return {
          rowNumber: rowIndex + 2,
          name,
          email: value(row, col.email),
          timestamp: value(row, col.timestamp),
          age: age(value(row, col.birthdate)),
          sex: value(row, col.sex),
          gender: value(row, col.gender),
          civilStatus: value(row, col.civil),
          contact: maskContact(value(row, col.contact)),
          school: value(row, col.school),
          course: value(row, col.course),
          yearLevel: value(row, col.year),
          role: value(row, col.role),
          participation: value(row, col.participation),
          score,
          yesCount: items.filter((i) => i.score === 1).length,
          noCount: items.filter((i) => i.score === 0).length,
          answeredCount: answered.length,
          item17Yes,
          result,
          resultLabel,
          recommendation,
          items,
        }
      })
    const groups = new Map<string, typeof submissions>()
    submissions.forEach((s) => {
      const key = (s.email || s.name || `row-${s.rowNumber}`).toLowerCase().replace(/\s+/g, '')
      groups.set(key, [...(groups.get(key) || []), s])
    })
    const participants = [...groups.entries()].map(([key, attempts], index) => {
      const latest = attempts[attempts.length - 1]
      return {
        ...latest,
        key,
        participantId: `P-${String(index + 1).padStart(3, '0')}`,
        displayEmail: maskEmail(latest.email),
        totalAttempts: attempts.length,
      }
    })
    res.setHeader('cache-control', 'private, no-store')
    return res.status(200).json({ participants })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Unable to load dashboard data.' })
  }
}
