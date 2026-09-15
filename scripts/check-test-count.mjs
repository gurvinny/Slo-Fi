#!/usr/bin/env node
// Guards against tests disappearing silently.
// Author: gurvinny
//
// SPECTRE's bundler-based runner once executed 4 of 28 test files and reported
// success: the glob quietly stopped matching after a directory moved, and a
// green check said nothing was wrong. Nothing throws when a test file is simply
// never collected, which makes it the one failure a test suite cannot catch by
// testing harder.
//
// This compares the files on disk against the files Vitest reports running.
import { readdirSync, statSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const ROOT = 'tests/unit'

function collect(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return collect(full)
    return entry.endsWith('.test.ts') ? [full] : []
  })
}

const onDisk = collect(ROOT).sort()

// --reporter=json writes to a file, not stdout -- reading stdout gets an empty
// string and a confusing JSON parse error.
const out = join(tmpdir(), `slofi-vitest-${process.pid}.json`)
execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['ignore', 'ignore', 'inherit'],
})
const report = JSON.parse(readFileSync(out, 'utf8'))
rmSync(out, { force: true })

const executed = [...new Set(report.testResults.map((r) => r.name))]
  .map((p) => p.replace(`${process.cwd()}/`, ''))
  .sort()

const missing = onDisk.filter((f) => !executed.includes(f))

console.log(`test files on disk: ${onDisk.length}`)
console.log(`test files executed: ${executed.length}`)
console.log(`assertions run:      ${report.numTotalTests}`)

if (missing.length > 0) {
  console.error('\nthese test files exist but were never executed:')
  for (const f of missing) console.error(`  ${f}`)
  process.exit(1)
}
if (report.numTotalTests === 0) {
  console.error('\nno assertions ran at all')
  process.exit(1)
}
console.log('\nevery test file on disk was executed')
