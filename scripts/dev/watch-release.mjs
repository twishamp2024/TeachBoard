// Waits (gently: one check every 3 minutes) for the workflow run started by a
// tag, then prints its jobs, failing steps and artifacts. Uses the GitHub
// login Git Credential Manager stores for the given account; the token is
// never printed.
//
//   node scripts/dev/watch-release.mjs <owner/repo> <account> <tag>
import { execFileSync } from 'node:child_process'

const [repo, account, tag] = process.argv.slice(2)
const cred = execFileSync('git', ['credential', 'fill'], { input: `protocol=https\nhost=github.com\nusername=${account}\n\n`, encoding: 'utf8' })
const token = /^password=(.*)$/m.exec(cred)?.[1]
if (!token) throw new Error(`No stored credential for ${account}`)
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': `${account}-teachboard-release` }
const api = (p) => fetch(`https://api.github.com/repos/${repo}${p}`, { headers }).then((r) => r.json())

const started = Date.now()
const pause = () => new Promise((r) => setTimeout(r, 180_000))
let runId = null
for (;;) {
  if (!runId) {
    const runs = await api(`/actions/runs?event=push&branch=${encodeURIComponent(tag)}&per_page=5`)
    runId = runs.workflow_runs?.[0]?.id ?? null
    if (runId) console.log(`run ${runId}: ${runs.workflow_runs[0].html_url}`)
  }
  if (runId) {
    const run = await api(`/actions/runs/${runId}`)
    if (run.status === 'completed') {
      console.log(`RUN ${run.conclusion} after ${Math.round((Date.now() - started) / 60000)} min`)
      const jobs = await api(`/actions/runs/${runId}/jobs`)
      for (const j of jobs.jobs ?? []) {
        console.log(`JOB ${j.name} (${j.id}): ${j.conclusion}`)
        for (const s of j.steps ?? []) if (!['success', 'skipped'].includes(s.conclusion)) console.log(`  step "${s.name}": ${s.conclusion}`)
      }
      const arts = await api(`/actions/runs/${runId}/artifacts`)
      for (const a of arts.artifacts ?? []) console.log(`ARTIFACT ${a.name} ${a.id} ${(a.size_in_bytes / 1e6).toFixed(1)} MB`)
      break
    }
  }
  if (Date.now() - started > 150 * 60_000) {
    console.log(`Gave up waiting after 150 min (run ${runId ?? 'not found'}).`)
    break
  }
  await pause()
}
