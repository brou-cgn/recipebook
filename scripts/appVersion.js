#!/usr/bin/env node
/**
 * Single source of truth for the app's version number: the newest `v*` git
 * tag, not the "version" field in package.json.
 *
 * Why the tag and not package.json
 * --------------------------------
 * Bumping package.json means committing to main on every merge, which the
 * branch ruleset on main forbids - every change has to arrive through a pull
 * request with a passing check, and github-actions[bot] cannot be exempted
 * (it is not an installable app, so it does not appear in a ruleset's bypass
 * list at all). Tags are not branches, so pushing one is unaffected.
 *
 * That makes the release marker a tag, which is what it always was anyway:
 * version-bump.yml already created v<version> tags alongside the commit.
 * Now the tag is the only artifact, and package.json's "version" is left
 * alone as a floor for the very first release.
 *
 * Usage:
 *   node scripts/appVersion.js current        -> 2.1.39
 *   node scripts/appVersion.js next patch     -> 2.1.40
 *   node scripts/appVersion.js next minor     -> 2.2.0
 *   node scripts/appVersion.js next major     -> 3.0.0
 */
const { execFileSync } = require('child_process');

/** Newest v* tag as a bare version, or null when the repo has none yet. */
function versionFromGitTag() {
  try {
    const tag = execFileSync(
      'git',
      ['describe', '--tags', '--abbrev=0', '--match', 'v*'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    const version = tag.replace(/^v/, '');
    return /^\d+\.\d+\.\d+$/.test(version) ? version : null;
  } catch {
    // No tags yet, or not a git checkout (e.g. a source tarball).
    return null;
  }
}

function versionFromPackageJson() {
  try {
    return require('../package.json').version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function getCurrentVersion() {
  return versionFromGitTag() || versionFromPackageJson();
}

function getNextVersion(current, bumpType) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`Not a version this can bump: "${current}"`);
  const [major, minor, patch] = match.slice(1).map(Number);

  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown bump type: "${bumpType}" (major|minor|patch)`);
  }
}

module.exports = { getCurrentVersion, getNextVersion, versionFromGitTag };

if (require.main === module) {
  const [command, bumpType] = process.argv.slice(2);
  if (command === 'current') {
    process.stdout.write(getCurrentVersion());
  } else if (command === 'next') {
    process.stdout.write(getNextVersion(getCurrentVersion(), bumpType));
  } else {
    process.stderr.write(
      'Usage: node scripts/appVersion.js current | next <major|minor|patch>\n'
    );
    process.exit(1);
  }
}
