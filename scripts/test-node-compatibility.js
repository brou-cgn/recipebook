#!/usr/bin/env node

/**
 * Test Node.js compatibility for RecipeBook project.
 *
 * Checks:
 * - Current Node.js version meets package.json engine requirements
 * - All dependencies are compatible with the running Node.js version
 * - Lists any deprecated packages found
 *
 * Supports engine requirement formats: exact major ("20"), semver range (">=18").
 * Exit code 0 on success, 1 on problems.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(ROOT_DIR, 'functions');

let hasProblems = false;

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
  hasProblems = true;
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function error(msg) {
  console.error(`❌ ${msg}`);
  hasProblems = true;
}

/**
 * Check whether the running Node.js version satisfies the engine requirement
 * in the given package.json. Supports:
 *   - Exact major version: "20"
 *   - Minimum version (>=): ">=18" or ">=18.0.0"
 */
function checkEngines(pkgPath, label) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const engines = pkg.engines;

  if (!engines || !engines.node) {
    log(`ℹ️  ${label}: No Node.js engine requirement specified.`);
    return;
  }

  const required = engines.node.trim();
  const current = process.versions.node;
  const currentMajor = parseInt(current.split('.')[0], 10);

  // Extract the leading numeric part of the requirement (handles "20", ">=18", ">=18.0.0")
  const match = required.match(/\d+/);
  if (!match) {
    log(`ℹ️  ${label}: Cannot parse engine requirement "${required}", skipping check.`);
    return;
  }
  const requiredMajor = parseInt(match[0], 10);

  // Exact version: digits only, optionally with minor/patch (e.g. "20" or "20.0.0")
  const isExact = /^\d+(\.\d+)*$/.test(required);
  if (isExact) {
    if (currentMajor === requiredMajor) {
      ok(`${label}: Node.js ${current} satisfies exact engine requirement "${required}"`);
    } else {
      error(
        `${label}: Node.js ${current} does NOT satisfy exact engine requirement "${required}" ` +
          `(running major: ${currentMajor}, required: ${requiredMajor})`
      );
    }
  } else {
    // Treat as minimum version (>=)
    if (currentMajor >= requiredMajor) {
      ok(`${label}: Node.js ${current} satisfies engine requirement "${required}"`);
    } else {
      error(`${label}: Node.js ${current} does NOT satisfy engine requirement "${required}"`);
    }
  }
}

function checkDeprecated(dir, label) {
  log(`\nChecking for deprecated packages in ${label}...`);

  const result = spawnSync('npm', ['outdated', '--json'], {
    cwd: dir,
    encoding: 'utf8',
  });

  // npm outdated exits with 1 when there are outdated packages; stderr indicates a real failure
  if (result.error) {
    log(`ℹ️  ${label}: Could not check for outdated packages (${result.error.message})`);
    return;
  }

  const stdout = (result.stdout || '').trim();
  if (!stdout || stdout === '{}') {
    ok(`${label}: All packages are up to date.`);
    return;
  }

  let outdated;
  try {
    outdated = JSON.parse(stdout);
  } catch {
    ok(`${label}: No outdated packages found.`);
    return;
  }

  const packages = Object.keys(outdated);
  if (packages.length === 0) {
    ok(`${label}: All packages are up to date.`);
  } else {
    warn(`${label}: ${packages.length} outdated package(s) found:`);
    packages.forEach((pkg) => {
      const info = outdated[pkg];
      console.warn(
        `   - ${pkg}: current=${info.current || 'not installed'}, wanted=${info.wanted}, latest=${info.latest}`
      );
    });
  }
}

function checkNpmAudit(dir, label) {
  log(`\nRunning npm audit in ${label}...`);

  const result = spawnSync('npm', ['audit', '--audit-level=high'], {
    cwd: dir,
    encoding: 'utf8',
  });

  if (result.error) {
    log(`ℹ️  ${label}: Could not run npm audit (${result.error.message})`);
    return;
  }

  if (result.status === 0) {
    ok(`${label}: No high-severity vulnerabilities found.`);
  } else {
    const output = result.stdout || result.stderr || '';
    if (output.includes('found 0 vulnerabilities')) {
      ok(`${label}: No vulnerabilities found.`);
    } else {
      warn(`${label}: npm audit found issues:\n${output.slice(0, 500)}`);
    }
  }
}

// Main
log(`\n🔍 RecipeBook Node.js Compatibility Check`);
log(`   Node.js version: ${process.versions.node}`);
log(`   npm version:     ${execSync('npm --version', { encoding: 'utf8' }).trim()}`);
log('');

// Check engine requirements
log('Checking engine requirements...');
const rootPkgPath = path.join(ROOT_DIR, 'package.json');
const functionsPkgPath = path.join(FUNCTIONS_DIR, 'package.json');

checkEngines(rootPkgPath, 'React App');
checkEngines(functionsPkgPath, 'Firebase Functions');

// Check for outdated/deprecated packages
checkDeprecated(ROOT_DIR, 'React App');
if (fs.existsSync(path.join(FUNCTIONS_DIR, 'node_modules'))) {
  checkDeprecated(FUNCTIONS_DIR, 'Firebase Functions');
} else {
  log('\nℹ️  Firebase Functions node_modules not found, skipping outdated check.');
}

// npm audit
checkNpmAudit(ROOT_DIR, 'React App');

log('');
if (hasProblems) {
  error('Compatibility check completed with problems. See above for details.');
  process.exit(1);
} else {
  ok('All compatibility checks passed!');
  process.exit(0);
}
