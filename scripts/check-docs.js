const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const DOCS_DIR = 'docs';

function getTrackedMarkdownFiles() {
  try {
    // List all tracked files
    const output = execSync('git ls-files', { encoding: 'utf-8' });
    return output.split('\n')
      .filter(line => line.trim() !== '')
      .filter(file => file.endsWith('.md'));
  } catch (error) {
    console.error('Error listing git files:', error);
    process.exit(1);
  }
}

function checkRules() {
  const mdFiles = getTrackedMarkdownFiles();
  let errors = [];

  mdFiles.forEach(file => {
    const parts = file.split('/');
    const fileName = parts[parts.length - 1];
    const isReadme = fileName === 'README.md';
    const isInDocs = parts[0] === DOCS_DIR;

    // Rule: Outside docs/, only README.md is allowed
    if (!isInDocs) {
      if (!isReadme) {
        errors.push(`[Location Violation] ${file}: Only README.md is allowed outside of ${DOCS_DIR}/.`);
      }
    }

    // Rule: Inside docs/, file naming
    if (isInDocs) {
      if (isReadme) {
        // README.md is allowed in docs/ and subfolders, must be capitalized (checked by === 'README.md')
      } else {
        // Other files must be kebab-case
        // Regex: start with lowercase or digit, contain lowercase/digits/hyphens, end with .md
        // Note: fileName includes extension
        const nameWithoutExt = fileName.slice(0, -3); // remove .md
        const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
        
        if (!kebabCaseRegex.test(nameWithoutExt)) {
          errors.push(`[Naming Violation] ${file}: Files in ${DOCS_DIR}/ must be kebab-case (e.g., my-doc.md). Found: ${fileName}`);
        }
      }
    }
  });

  if (errors.length > 0) {
    console.error(`${RED}Documentation rules violations detected:${RESET}`);
    errors.forEach(e => console.error(`  - ${e}`));
    console.error(`\nPlease refer to ${DOCS_DIR}/documentation-rules.md for the rules.`);
    process.exit(1);
  } else {
    console.log('Documentation rules check passed.');
  }
}

checkRules();
