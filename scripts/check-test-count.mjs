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

const ROOTS = ['tests/unit', 'tests/browser', 'tests/dom']

function collect(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return collect(full)
    return entry.endsWith('.test.ts') ? [full] : []
  })
}

const onDisk = ROOTS.flatMap(collect).sort()

// --reporter=json writes to a file, not stdout -- reading stdout gets an empty
// string and a confusing JSON parse error.
//
// Every suite is counted: the browser and DOM tests live in their own configs,
// and a guard that only knows about one of them would miss the others
// disappearing.
//
// The temp file is keyed by a caller-supplied label, not by the shape of
// configArgs -- the browser and DOM invocations are the same length, so
// deriving the name from the arguments hands them the same path.
function runSuite(label, configArgs) {
  const file = join(tmpdir(), `slofi-vitest-${process.pid}-${label}.json`)
  execFileSync('npx', ['vitest', 'run', ...configArgs, '--reporter=json', `--outputFile=${file}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  rmSync(file, { force: true })
  return parsed
}

const reports = [
  runSuite('unit', []),
  runSuite('browser', ['--config', 'vitest.browser.config.ts']),
  runSuite('dom', ['--config', 'vitest.dom.config.ts']),
]
const report = {
  testResults: reports.flatMap((r) => r.testResults),
  numTotalTests: reports.reduce((n, r) => n + r.numTotalTests, 0),
}

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
