#!/usr/bin/env bun
/**
 * CI test-coverage guard.
 *
 * Fails when a test file under source/ is run by no GitHub Actions job.
 *
 * A test file counts as run when a live workflow (.github/workflows/*.yml or
 * *.yaml, not *.todo) has a `run:` step that reaches it through one of:
 *   - `vitest run [filters]` (also via bunx/npx), using the include/exclude
 *     globs of the vitest config the command selects;
 *   - `bun test [filters]`, using bun's default test-file discovery;
 *   - `bun run <script>` / `npm run <script>` / `npm test`, whose package.json
 *     script resolves to one of the commands above.
 * The step's `working-directory` and any `cd <dir>` earlier in the same step
 * set the package directory.
 *
 * Files that no job runs yet must be listed in
 * .github/test-coverage-exemptions.yaml with a reason. The guard also fails
 * when an exemption names a missing file or a file a job already runs, so the
 * list can only shrink.
 *
 * Usage: bun scripts/check-test-coverage.js [--verbose]
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative, resolve, posix } from "path";

const ROOT = resolve(import.meta.dir, "..");
const WORKFLOW_DIR = join(ROOT, ".github", "workflows");
const EXEMPTIONS_FILE = join(ROOT, ".github", "test-coverage-exemptions.yaml");
const VERBOSE = process.argv.includes("--verbose");

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "target", "lib"]);
const TEST_FILE = /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/;
// bun test discovers *.test.*, *_test.*, *.spec.*, *_spec.* files.
const BUN_TEST_FILE = /(\.|_)(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const VITEST_DEFAULT_INCLUDE = ["**/*.{test,spec}.?(c|m)[jt]s?(x)"];
const VITEST_DEFAULT_EXCLUDE = ["**/node_modules/**", "**/dist/**"];

const errors = [];

function toPosix(p) {
  return p.split("\\").join("/");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/** Files under a package directory, relative to the repo root. */
const fileCache = new Map();
function filesUnder(absDir) {
  if (!fileCache.has(absDir)) {
    fileCache.set(
      absDir,
      existsSync(absDir)
        ? walk(absDir).map((f) => toPosix(relative(ROOT, f)))
        : [],
    );
  }
  return fileCache.get(absDir);
}

/** Splits a shell `run:` block into simple commands. */
function splitCommands(script) {
  return script
    .replace(/\\\n/g, " ")
    .split(/\n|&&|\|\||;/)
    .map((c) => c.trim())
    .filter((c) => c && !c.startsWith("#"));
}

function tokenize(cmd, vars = {}) {
  const out = [];
  for (const raw of cmd.match(/"[^"]*"|'[^']*'|\S+/g) || []) {
    const t = raw.replace(/^["']|["']$/g, "");
    const v = t.match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/);
    if (v && vars[v[1]]) out.push(...vars[v[1]]);
    else out.push(t);
  }
  return out;
}

/** Records `for VAR in WORDS` so later `$VAR` expands to WORDS (globs). */
function recordForLoop(cmd, vars) {
  const m = cmd.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/);
  if (!m) return false;
  vars[m[1]] = tokenize(m[2]);
  return true;
}

/** Strips leading `VAR=value` assignments and returns the rest. */
function stripEnv(tokens) {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  return tokens.slice(i);
}

/**
 * Pulls string literals out of the `key: [ ... ]` array in a config's `test:`
 * block (or the whole file when it has no `test:` block).
 */
function readArray(fullText, key, configPath) {
  const testBlock = fullText.search(/\btest\s*:\s*\{/);
  const text = testBlock >= 0 ? fullText.slice(testBlock) : fullText;
  const re = new RegExp(`\\b${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`, "g");
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    errors.push(
      `${configPath}: more than one "${key}:" array; teach scripts/check-test-coverage.js how to read it`,
    );
  }
  return [...matches[0][1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

function findVitestConfig(absDir, explicit) {
  if (explicit) {
    const p = resolve(absDir, explicit);
    if (!existsSync(p)) {
      errors.push(`vitest config not found: ${toPosix(relative(ROOT, p))}`);
      return null;
    }
    return p;
  }
  for (const base of ["vitest.config", "vite.config"]) {
    for (const ext of [".ts", ".mts", ".js", ".mjs", ".cts", ".cjs"]) {
      const p = join(absDir, base + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function globMatchAny(patterns, rel) {
  return patterns.some((p) => new Bun.Glob(p).match(rel));
}

/** A CLI file filter: a glob when it has glob characters, else a substring. */
function filterMatches(filter, rel) {
  const f = filter.replace(/^\.\//, "");
  return /[*?[{]/.test(f) ? new Bun.Glob(f).match(rel) : rel.includes(f);
}

/** Test files a `vitest run` command in absDir executes. */
function vitestFiles(absDir, args) {
  let configArg = null;
  const filters = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--config" || a === "-c") configArg = args[++i];
    else if (a.startsWith("--config=")) configArg = a.slice("--config=".length);
    else if (
      a === "--project" ||
      a === "--dir" ||
      a === "--root" ||
      a === "-r"
    ) {
      errors.push(
        `vitest flag ${a} in ${toPosix(relative(ROOT, absDir))} is not supported by the guard`,
      );
      i++;
    } else if (a.startsWith("-")) continue;
    else filters.push(a);
  }
  const configPath = findVitestConfig(absDir, configArg);
  let include = VITEST_DEFAULT_INCLUDE;
  let exclude = VITEST_DEFAULT_EXCLUDE;
  if (configPath) {
    const text = readFileSync(configPath, "utf8");
    const rel = toPosix(relative(ROOT, configPath));
    include = readArray(text, "include", rel) ?? include;
    const ex = readArray(text, "exclude", rel);
    if (ex) exclude = ex;
  }
  return filesUnder(absDir).filter((repoRel) => {
    const rel = toPosix(relative(absDir, join(ROOT, repoRel)));
    if (!globMatchAny(include, rel)) return false;
    if (globMatchAny(exclude, rel)) return false;
    if (filters.length === 0) return true;
    return filters.some((f) => filterMatches(f, rel));
  });
}

/** Test files a `bun test` command in absDir executes. */
function bunTestFiles(absDir, args) {
  const filters = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--timeout" || a === "-t" || a === "--test-name-pattern") i++;
    else if (a.startsWith("-")) continue;
    else filters.push(a);
  }
  return filesUnder(absDir).filter((repoRel) => {
    const rel = toPosix(relative(absDir, join(ROOT, repoRel)));
    if (!BUN_TEST_FILE.test(rel)) return false;
    if (filters.length === 0) return true;
    return filters.some((f) => filterMatches(f, rel));
  });
}

function readScripts(absDir) {
  const pkg = join(absDir, "package.json");
  if (!existsSync(pkg)) return {};
  return JSON.parse(readFileSync(pkg, "utf8")).scripts || {};
}

/**
 * Resolves one simple command to the test files it runs.
 * Returns { files, cwd } where cwd may change for `cd`.
 */
function resolveCommand(absDir, cmd, depth = 0, vars = {}) {
  if (depth > 5) return [];
  let tokens = stripEnv(tokenize(cmd, vars));
  if (tokens.length === 0) return [];

  // npx/bunx/bun x prefixes
  if (tokens[0] === "npx" || tokens[0] === "bunx" || tokens[0] === "pnpx") {
    tokens = tokens.slice(1);
  } else if (tokens[0] === "bun" && tokens[1] === "x") {
    tokens = tokens.slice(2);
  }

  if (tokens[0] === "vitest") {
    const rest = tokens.slice(1);
    if (rest[0] === "run") return vitestFiles(absDir, rest.slice(1));
    if (rest.length === 0 || rest[0].startsWith("-") || rest[0] === "related") {
      // `vitest` alone watches locally but runs once in CI.
      return vitestFiles(absDir, rest);
    }
    return [];
  }

  if (tokens[0] === "bun") {
    // bun [--flags] test [args] | bun run <script> [args] | bun <script>
    let i = 1;
    while (i < tokens.length && tokens[i].startsWith("-")) i++;
    const sub = tokens[i];
    if (sub === "test") return bunTestFiles(absDir, tokens.slice(i + 1));
    if (sub === "run")
      return runScript(absDir, tokens[i + 1], tokens.slice(i + 2), depth);
    if (sub && readScripts(absDir)[sub] !== undefined) {
      return runScript(absDir, sub, tokens.slice(i + 1), depth);
    }
    return [];
  }

  if (tokens[0] === "npm" || tokens[0] === "pnpm" || tokens[0] === "yarn") {
    if (tokens[1] === "test" || tokens[1] === "t") {
      return runScript(absDir, "test", tokens.slice(2), depth);
    }
    if (tokens[1] === "run" || tokens[1] === "run-script") {
      return runScript(absDir, tokens[2], tokens.slice(3), depth);
    }
    return [];
  }

  return [];
}

function runScript(absDir, name, extraArgs, depth) {
  const scripts = readScripts(absDir);
  const body = scripts[name];
  if (body === undefined) return [];
  const extra = extraArgs.filter((a) => a !== "--").join(" ");
  let cwd = absDir;
  const files = [];
  const cmds = splitCommands(body);
  cmds.forEach((c, idx) => {
    const t = tokenize(c);
    if (t[0] === "cd" && t[1]) {
      cwd = resolve(cwd, t[1]);
      return;
    }
    // Extra args apply to the last command of the script.
    const full = idx === cmds.length - 1 && extra ? `${c} ${extra}` : c;
    files.push(...resolveCommand(cwd, full, depth + 1));
  });
  return files;
}

function loadWorkflows() {
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({
      file: f,
      doc: Bun.YAML.parse(readFileSync(join(WORKFLOW_DIR, f), "utf8")),
    }));
}

function coveredFiles() {
  /** Map of test file -> list of "workflow / job" names that run it. */
  const covered = new Map();
  for (const { file, doc } of loadWorkflows()) {
    const jobs = (doc && doc.jobs) || {};
    for (const [jobId, job] of Object.entries(jobs)) {
      const defaultDir = job?.defaults?.run?.["working-directory"] || ".";
      for (const step of job.steps || []) {
        if (typeof step.run !== "string") continue;
        let cwd = resolve(ROOT, step["working-directory"] || defaultDir);
        const vars = {};
        for (const cmd of splitCommands(step.run)) {
          if (recordForLoop(cmd, vars)) continue;
          const t = tokenize(cmd, vars);
          if (t[0] === "cd" && t[1]) {
            cwd = resolve(cwd, t[1]);
            continue;
          }
          for (const f of resolveCommand(cwd, cmd, 0, vars)) {
            if (!covered.has(f)) covered.set(f, new Set());
            covered.get(f).add(`${file} / ${jobId}`);
          }
        }
      }
    }
  }
  return covered;
}

function loadExemptions() {
  if (!existsSync(EXEMPTIONS_FILE)) return new Map();
  const doc = Bun.YAML.parse(readFileSync(EXEMPTIONS_FILE, "utf8")) || {};
  const map = new Map();
  for (const group of doc.exemptions || []) {
    if (!group.reason) {
      errors.push(`exemption group without a reason: ${JSON.stringify(group)}`);
    }
    for (const p of group.files || [])
      map.set(posix.normalize(p), group.reason);
  }
  return map;
}

function main() {
  const testFiles = walk(join(ROOT, "source"))
    .map((f) => toPosix(relative(ROOT, f)))
    .filter((f) => TEST_FILE.test(f))
    .sort();
  const covered = coveredFiles();
  const exemptions = loadExemptions();

  const unnamed = [];
  const staleExempt = [];
  for (const f of testFiles) {
    const runBy = covered.get(f);
    if (runBy && exemptions.has(f)) staleExempt.push(f);
    if (!runBy && !exemptions.has(f)) unnamed.push(f);
    if (VERBOSE) {
      const how = runBy
        ? [...runBy].join(", ")
        : exemptions.has(f)
          ? "EXEMPT"
          : "NOT RUN";
      console.log(`${f}  <-  ${how}`);
    }
  }
  const testSet = new Set(testFiles);
  const missingExempt = [...exemptions.keys()].filter((f) => !testSet.has(f));

  const runCount = testFiles.filter((f) => covered.has(f)).length;
  console.log(
    `Test files under source/: ${testFiles.length}. Run by a CI job: ${runCount}. Exempt: ${exemptions.size}.`,
  );

  for (const e of errors) console.error(`ERROR: ${e}`);
  if (unnamed.length) {
    console.error(
      `\nERROR: ${unnamed.length} test file(s) are run by no CI job. Add them to a workflow step,` +
        ` or list them in .github/test-coverage-exemptions.yaml with a reason:`,
    );
    for (const f of unnamed) console.error(`  - ${f}`);
  }
  if (staleExempt.length) {
    console.error(
      `\nERROR: these exempt files are now run by CI. Remove them from .github/test-coverage-exemptions.yaml:`,
    );
    for (const f of staleExempt) console.error(`  - ${f}`);
  }
  if (missingExempt.length) {
    console.error(
      `\nERROR: these exemptions name files that do not exist. Remove them:`,
    );
    for (const f of missingExempt) console.error(`  - ${f}`);
  }
  if (
    errors.length ||
    unnamed.length ||
    staleExempt.length ||
    missingExempt.length
  ) {
    process.exit(1);
  }
  console.log("Test coverage guard passed.");
}

main();
