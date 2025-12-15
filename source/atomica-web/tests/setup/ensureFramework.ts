import { exec as execCb } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { resolve } from "path";
import crypto from "crypto";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const exec = promisify(execCb);

const SOURCE_ROOT = resolve(__dirname, "../../..");
const ZAPATOS_FRAMEWORK_DIR = resolve(SOURCE_ROOT, "zapatos/aptos-move/framework");
const FIXTURES_DIR = resolve(SOURCE_ROOT, "move-framework-fixtures");
const BUILD_SCRIPT = resolve(SOURCE_ROOT, "atomica-web/scripts/build-framework.sh");

/**
 * Recursively find all .move files in a directory
 */
async function findMoveFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.move')) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files.sort(); // Sort for deterministic ordering
}

/**
 * Compute a hash of all .move files in the framework
 */
async function computeFrameworkHash(): Promise<string> {
  const moveFiles = await findMoveFiles(ZAPATOS_FRAMEWORK_DIR);

  // Create a hash of all file contents
  const hashes: string[] = [];
  for (const file of moveFiles) {
    const content = await readFile(file);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    hashes.push(hash);
  }

  // Hash all the hashes together for a final hash
  const finalHash = crypto.createHash('sha256')
    .update(hashes.join(''))
    .digest('hex')
    .slice(0, 16); // First 16 chars

  return finalHash;
}

/**
 * Ensure the framework bundle exists and is up-to-date.
 * If it doesn't exist or is outdated, build it.
 */
export async function ensureFramework(): Promise<string> {
  console.log("Checking Move framework bundle...");

  // Compute hash of current framework sources
  const currentHash = await computeFrameworkHash();
  const expectedFile = resolve(FIXTURES_DIR, `head-${currentHash}.mrb`);
  const latestFile = resolve(FIXTURES_DIR, "head.mrb");

  console.log(`Framework hash: ${currentHash}`);

  // Check if the exact version exists
  if (existsSync(expectedFile)) {
    console.log(`✅ Framework bundle up-to-date: head-${currentHash}.mrb`);

    // Make sure head.mrb is also updated
    if (!existsSync(latestFile)) {
      console.log("Copying to head.mrb...");
      await exec(`cp "${expectedFile}" "${latestFile}"`);
    }

    return latestFile;
  }

  // Need to build the framework
  console.log(`⚠️  Framework bundle not found or outdated`);
  console.log(`Building framework (this will take a few minutes)...`);

  const { stdout, stderr } = await exec(BUILD_SCRIPT);

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  // Verify it was created
  if (!existsSync(latestFile)) {
    throw new Error(`Framework build failed - ${latestFile} not found`);
  }

  console.log(`✅ Framework bundle built successfully`);

  return latestFile;
}
