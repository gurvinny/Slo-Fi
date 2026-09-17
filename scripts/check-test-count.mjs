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

// Per-suite assertion floors.
//
// Proving every file on disk ran does not prove the files still contain
// anything. A suite that collapsed from 196 assertions to 3 -- a bad merge, a
// describe block accidentally emptied, a helper throwing in beforeEach so every
// test is skipped -- would satisfy the collection check and report green.
//
// The floors are per suite rather than one total on purpose: a global floor
// lets a collapse in one layer hide behind another layer's volume. 348 total
// stays 348 whether the DOM suite has 196 assertions or 0 and the unit suite
// grew to compensate.
//
// Set to the counts measured when each floor was armed. A floor is a minimum,
// so adding tests never trips it; only a net removal does, and that should be
// a deliberate act -- lower the number in the same commit that removes them.
const FLOORS = {
  unit: 156,
  browser: 31,
  dom: 281,
}

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

const suites = {
  unit: runSuite('unit', []),
  browser: runSuite('browser', ['--config', 'vitest.browser.config.ts']),
  dom: runSuite('dom', ['--config', 'vitest.dom.config.ts']),
}
const reports = Object.values(suites)
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
for (const [suite, floor] of Object.entries(FLOORS)) {
  console.log(`  ${suite.padEnd(8)} ${String(suites[suite].numTotalTests).padStart(4)}  (floor ${floor})`)
}

if (missing.length > 0) {
  console.error('\nthese test files exist but were never executed:')
  for (const f of missing) console.error(`  ${f}`)
  process.exit(1)
}
const below = Object.entries(FLOORS)
  .map(([suite, floor]) => ({ suite, floor, actual: suites[suite].numTotalTests }))
  .filter(({ actual, floor }) => actual < floor)

if (below.length > 0) {
  console.error('\nsuites ran fewer assertions than their floor:')
  for (const { suite, floor, actual } of below) {
    console.error(`  ${suite}: ${actual} < ${floor}`)
  }
  console.error('\nIf tests were removed on purpose, lower the floor in the same commit.')
  process.exit(1)
}
console.log('\nevery test file on disk was executed, and every suite met its floor')
