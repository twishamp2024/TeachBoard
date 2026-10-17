// Minimal GitHub REST helper for release chores, using the login that Git
// Credential Manager stores for a specific account. The token is never
// printed or written to disk, and every call first confirms the token
// belongs to the expected account.
//
//   node scripts/dev/gh-api.mjs <account> <METHOD> <path> [jsonBody]
//   node scripts/dev/gh-api.mjs <account> UPLOAD <uploadUrl> <file> <assetName>
//   node scripts/dev/gh-api.mjs <account> DOWNLOAD <url> <outFile>
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [account, method, target, ...rest] = process.argv.slice(2)
if (!account || !method || !target) {
  console.error('usage: gh-api.mjs <account> <METHOD|UPLOAD|DOWNLOAD> <path|url> [...]')
  process.exit(2)
}

const cred = execFileSync('git', ['credential', 'fill'], {
  input: `protocol=https\nhost=github.com\nusername=${account}\n\n`,
  encoding: 'utf8'
})
const token = /^password=(.*)$/m.exec(cred)?.[1]
if (!token) throw new Error(`No stored GitHub credential for ${account}`)
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': `${account}-teachboard-release`
}

const me = await fetch('https://api.github.com/user', { headers }).then((r) => r.json())
if (me.login?.toLowerCase() !== account.toLowerCase()) {
  throw new Error(`Stored token belongs to "${me.login ?? 'unknown'}", not "${account}"; refusing to continue.`)
}

if (method === 'UPLOAD') {
  const [file, name] = rest
  const url = target.replace(/\{\?name,label\}$/, '') + `?name=${encodeURIComponent(name)}`
  const res = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: readFileSync(file) })
  const body = await res.json()
  console.log(res.status, body.name ?? '', body.size ?? '', body.browser_download_url ?? body.message ?? '')
} else if (method === 'DOWNLOAD') {
  const [outFile] = rest
  const res = await fetch(target, { headers, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  writeFileSync(outFile, Buffer.from(await res.arrayBuffer()))
  console.log(res.status, outFile)
} else {
  const url = target.startsWith('http') ? target : `https://api.github.com${target}`
  const res = await fetch(url, { method, headers, body: rest[0] })
  const text = await res.text()
  console.log(res.status)
  console.log(text)
}
