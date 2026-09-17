#!/usr/bin/env node
// Run the curated mutation catalogues. A test that cannot fail is not a test.
// Author: gurvinny
//
// Each catalogue in tests/mutations/ declares the defects its suite must catch,
// as [label, old, new, expectedTest] tuples. This applies each one, runs the
// suite, and reports caught/survived -- and whether the test that failed was the
// one that CLAIMED to cover it, since a mutation caught only by an unrelated
// test is a weaker signal than it looks.
//
//   ISOLATION IS THE POINT, not a convenience.
//
// This never edits the working tree. A dev server, a watcher, or a stray
// `npm test` running against a mutated source would report a verdict for code
// nobody is about to ship. So the tracked files are exported to a throwaway
// directory and mutated only there -- and it refuses to run if that export
// looks wrong.
//
// node_modules is SYMLINKED rather than copied: copying it costs minutes per
// run, and nothing under it is ever mutated. The Python original's .pyc hazard
// (two mutants of equal size within one second reusing stale bytecode) has a
// direct analogue here in Vitest's on-disk module cache, which would live under
// that shared symlink. Vitest 5 leaves --fsModuleCache off by default; we pass
// --no-fsModuleCache explicitly rather than depend on a default that may flip.
import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, rmSync,
         readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const STAGED = args.includes('--staged')
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null

// Copy the code under test into `dest`.
//
// --staged uses `git checkout-index`, which writes exactly what is in the
// INDEX: the thing actually being committed. That is the right revision for a
// pre-commit gate -- `git worktree add HEAD` would test the PREVIOUS commit and
// happily pass a broken change.
function exportTree(dest) {
  if (STAGED) {
    execSync(`git checkout-index -a --prefix="${dest}/"`, { cwd: ROOT })
    return
  }
  // Tracked files AND untracked-but-not-ignored ones: new work is usually
  // untracked, and exporting only the tracked half would silently test an older
  // shape of the code. --exclude-standard keeps ignored build output out, which
  // is the same boundary .gitignore already draws.
  const rels = []
  for (const cmd of [['ls-files', '-z'], ['ls-files', '-o', '--exclude-standard', '-z']]) {
    const out = execFileSync('git', cmd, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    rels.push(...out.toString().split('\0').filter(Boolean))
  }
  for (const rel of rels) {
    const src = join(ROOT, rel)
    if (!existsSync(src)) continue
    const dst = join(dest, rel)
    mkdirSync(dirname(dst), { recursive: true })
    copyFileSync(src, dst)
  }
}

async function loadCatalogues() {
  const dir = join(ROOT, 'tests', 'mutations')
  if (!existsSync(dir)) return []
  const out = []
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.mutations.mjs') || f.startsWith('_')) continue
    const stem = f.replace(/\.mutations\.mjs$/, '')
    if (ONLY && !stem.includes(ONLY)) continue
    out.push([stem, await import(pathToFileURL(join(dir, f)).href)])
  }
  return out
}

// Returns the names of tests that FAILED, via the json reporter rather than by
// scraping stdout: a parametrised or renamed test would slip past a regex, and
// the whole point of this rig is knowing exactly WHICH test caught a defect.
function failingTests(work, cat) {
  const outFile = join(work, `.mutate-report-${process.pid}-${Date.now()}.json`)
  try {
    execFileSync('npx', ['vitest', 'run', '--config', cat.CONFIG, cat.TESTS,
                         '--no-fsModuleCache', '--reporter=json',
                         `--outputFile=${outFile}`],
                 { cwd: work, stdio: 'ignore', env: { ...process.env, CI: '1' } })
  } catch {
    // Non-zero exit is the expected path for a caught mutation.
  }
  if (!existsSync(outFile)) return { failed: [], ran: 0 }
  const report = JSON.parse(readFileSync(outFile, 'utf8'))
  rmSync(outFile, { force: true })
  const failed = []
  let ran = 0
  for (const file of report.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      ran++
      if (a.status === 'failed') failed.push(a.title)
    }
  }
  return { failed, ran }
}

const work = mkdtempSync(join(tmpdir(), 'slofi-mutate-'))
let caught = 0, survived = 0, weak = 0, anchors = 0
try {
  exportTree(work)
  if (!existsSync(join(work, 'src')) || !existsSync(join(work, 'package.json'))) {
    console.error('export produced no src/ or package.json -- refusing to run')
    process.exit(2)
  }
  symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'), 'dir')

  const catalogues = await loadCatalogues()
  if (catalogues.length === 0) {
    console.error(ONLY ? `no catalogue matching "${ONLY}"` : 'no catalogues in tests/mutations/')
    process.exit(2)
  }

  for (const [name, cat] of catalogues) {
    const target = join(work, cat.TARGET)
    const pristine = readFileSync(target, 'utf8')
    console.log(`\n=== ${name} (${cat.TARGET}) ===`)

    // A baseline run: if the suite is already red, every "caught" verdict below
    // is meaningless. Cheaper to find out once than to misread a whole report.
    const base = failingTests(work, cat)
    if (base.failed.length) {
      console.error(`  suite is already failing before any mutation: ${base.failed.join(', ')}`)
      process.exit(2)
    }
    console.log(`  baseline: ${base.ran} tests green\n`)

    for (const [label, oldSrc, newSrc, expect] of cat.MUTATIONS) {
      const hits = pristine.split(oldSrc).length - 1
      if (hits !== 1) {
        // An anchor matching 0 or 2+ times mutates nothing, or mutates more than
        // it claims. Either way the verdict would be a lie, so it is a failure.
        console.log(`  ANCHOR   ${label}: ${hits} matches for its anchor`)
        anchors++
        continue
      }
      writeFileSync(target, pristine.replace(oldSrc, newSrc))
      const { failed } = failingTests(work, cat)
      writeFileSync(target, pristine)

      const intentional = expect === null
      if (failed.length === 0) {
        if (intentional) console.log(`  ALLOWED  ${label}\n             ${cat.SURVIVORS[label]}`)
        else { console.log(`  SURVIVED ${label}  (expected "${expect}" to fail)`); survived++ }
      } else if (intentional) {
        console.log(`  CAUGHT   ${label}  (recorded as allowed, but "${failed[0]}" caught it)`)
        caught++
      } else if (failed.includes(expect)) {
        console.log(`  CAUGHT   ${label}  -> ${expect}`)
        caught++
      } else {
        console.log(`  WEAK     ${label}  -> caught by "${failed[0]}", not "${expect}"`)
        caught++; weak++
      }
    }
  }

  const notes = [weak && `${weak} caught by a different test than claimed`,
                 anchors && `${anchors} stale anchor(s)`].filter(Boolean)
  console.log(`\ncaught ${caught}, survived ${survived}${notes.length ? ', ' + notes.join(', ') : ''}`)
  process.exit(survived || anchors ? 1 : 0)
} finally {
  rmSync(work, { recursive: true, force: true })
}
