#!/usr/bin/env node
/**
 * Tech-Check-Abgleich (Tech-Check W6).
 *
 * Sessions tragen im Dashboard „RecipeBook Tech-Check“ den Stand ihres Branches ein
 * („Branch …, noch kein PR“, „PR #… (offen, noch nicht gemergt)“). Gemergt wird
 * später auf GitHub, und ohne Abgleich bleibt der alte Stand stehen. Dieses Skript
 * vergleicht die beiden Datensätze des Dashboards mit den Merge-Commits auf main und
 * meldet jeden Eintrag, der noch einen Stand vor dem Merge nennt.
 *
 * Aufruf (im Repo, nach `git fetch origin main`):
 *   node scripts/techCheckAbgleich.js <umsetzungen.json> [findings.json]
 *
 * Die JSON-Dateien sind die Datensätze `umsetzungen` und `findings` des Dashboards
 * (Blob-ID aus `datasets/<id>.source.url`, herunterladen mit Artifact read und
 * `path` = Blob-ID). In einem flachen Klon fehlen ältere Merges; dann vorher
 * `git fetch --unshallow origin main`.
 *
 * Exit-Code 1, wenn mindestens ein veralteter Eintrag gefunden wurde.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const MERGE_SUBJECT = /^Merge pull request #(\d+) from ([^\s/]+)\/(\S+)/;

/**
 * Zerlegt `git log --merges --format=%H%x09%ad%x09%s --date=short`.
 * @returns {Array<{hash: string, date: string, pr: number, branch: string}>}
 */
function parseMerges(gitLog) {
  const merges = [];
  for (const line of String(gitLog).split('\n')) {
    const [hash, date, subject] = line.split('\t');
    const m = MERGE_SUBJECT.exec(subject || '');
    if (hash && m) merges.push({ hash, date, pr: Number(m[1]), branch: m[3] });
  }
  return merges;
}

function indexMerges(merges) {
  const byPr = new Map();
  const byBranch = new Map();
  for (const m of merges) {
    if (!byPr.has(m.pr)) byPr.set(m.pr, m);
    if (!byBranch.has(m.branch)) byBranch.set(m.branch, []);
    byBranch.get(m.branch).push(m);
  }
  // Ein Branch kann mehrfach gemergt werden (mehrere PRs nacheinander); aufsteigend nach Datum.
  for (const list of byBranch.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return { byPr, byBranch };
}

/** Erster Merge des Branches am oder nach dem Datum des Eintrags (ohne Datum: der erste überhaupt). */
function branchMerge(idx, branch, isoDate) {
  const list = idx.byBranch.get(branch) || [];
  return list.find((m) => !isoDate || m.date >= isoDate) || null;
}

/** „17.11.2026, …“ am Anfang eines Umsetzungs-Segments → „2026-11-17“. */
function leadingDate(text) {
  const m = /^\s*(\d{2})\.(\d{2})\.(\d{4})/.exec(String(text || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const deDate = (iso) => iso.split('-').reverse().join('.');
const describe = (m) => `als PR #${m.pr} am ${deDate(m.date)} gemergt (Merge ${m.hash.slice(0, 7)})`;

// Formulierungen, mit denen Sessions einen Stand vor dem Merge eintragen.
const BRANCH_NOT_MERGED = /Branch ([\w./-]+)\s*\(([^)]*?(?:noch kein PR|kein PR|nicht gemergt)[^)]*)\)/g;
const PR_NOT_MERGED = /PR #(\d+)\s*\(((?:offen|noch nicht gemergt|nicht gemergt)[^)]*)\)/g;

// „Commit abc1234“ oder „Commits abc1234, 1234abc und def5678“: alle genannten Hashes.
const COMMITS = /Commits? ((?:[0-9a-f]{7,40}(?:\s*(?:,|und)\s*)?)+)/g;

/**
 * Nennt der Text Commits und liegt keiner davon auf main, gehört der Stand zu Arbeit nach
 * einem früheren Merge desselben Branches (der Branch wird nach dem Merge weiterverwendet).
 */
function commitsNotInMain(text, commitInMain) {
  if (!commitInMain) return false;
  const hashes = [...String(text || '').matchAll(COMMITS)].flatMap((m) => m[1].match(/[0-9a-f]{7,40}/g));
  return hashes.length > 0 && hashes.every((hash) => !commitInMain(hash));
}

function staleInText(text, idx, isoDate, commitInMain) {
  const hits = [];
  for (const m of String(text || '').matchAll(BRANCH_NOT_MERGED)) {
    const merge = branchMerge(idx, m[1], isoDate);
    // Nennt der Eintrag einen Commit, entscheidet der: Ein Branch kann nach einem Merge
    // weitere Commits bekommen, die nie auf main landen.
    if (merge && commitsNotInMain(m[2], commitInMain)) continue;
    if (merge) hits.push({ stelle: m[0], hinweis: `Branch ${m[1]} ist ${describe(merge)}` });
  }
  for (const m of String(text || '').matchAll(PR_NOT_MERGED)) {
    const merge = idx.byPr.get(Number(m[1]));
    if (merge) hits.push({ stelle: m[0], hinweis: `PR #${m[1]} ist am ${deDate(merge.date)} gemergt (Merge ${merge.hash.slice(0, 7)})` });
  }
  return hits;
}

/**
 * @param {{umsetzungen?: object[], findings?: object[], merges: object[], commitInMain?: (hash: string) => boolean}} input
 * @returns {Array<{datensatz: string, eintrag: string, stelle: string, hinweis: string}>}
 */
function findStale({ umsetzungen = [], findings = [], merges, commitInMain }) {
  const idx = indexMerges(merges);
  const out = [];
  for (const u of umsetzungen) {
    const pr = String(u.pr || '');
    const branch = /^Branch\s+(\S+)/.exec(pr);
    if (branch) {
      const merge = branchMerge(idx, branch[1], u.datum);
      if (merge && !commitsNotInMain(u.ergebnis, commitInMain)) out.push({ datensatz: 'umsetzungen', eintrag: pr, stelle: 'pr', hinweis: `Branch ist ${describe(merge)}` });
    } else if (/^\s*(offen|noch kein PR|nicht gemergt)/i.test(String(u.ergebnis || ''))) {
      for (const n of pr.match(/\d+/g) || []) {
        const merge = idx.byPr.get(Number(n));
        if (merge) out.push({ datensatz: 'umsetzungen', eintrag: pr, stelle: 'ergebnis', hinweis: `PR #${n} ist am ${deDate(merge.date)} gemergt (Merge ${merge.hash.slice(0, 7)}), Stand sagt „offen“` });
      }
    }
    for (const h of staleInText(u.ergebnis, idx, u.datum, commitInMain)) out.push({ datensatz: 'umsetzungen', eintrag: pr, ...h });
  }
  for (const f of findings) {
    // Segmente sind mit „ || “ getrennt und beginnen meist mit ihrem Datum.
    for (const seg of String(f.umsetzung || '').split(' || ')) {
      for (const h of staleInText(seg, idx, leadingDate(seg), commitInMain)) out.push({ datensatz: 'findings', eintrag: `${f.id} (${f.status})`, ...h });
    }
  }
  return out;
}

function main(argv) {
  const [umsetzungenPath, findingsPath] = argv;
  if (!umsetzungenPath) {
    console.error('Aufruf: node scripts/techCheckAbgleich.js <umsetzungen.json> [findings.json]');
    return 2;
  }
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const gitLog = execFileSync('git', ['log', 'origin/main', '--merges', '--format=%H%x09%ad%x09%s', '--date=short'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const stale = findStale({
    umsetzungen: read(umsetzungenPath),
    findings: findingsPath ? read(findingsPath) : [],
    merges: parseMerges(gitLog),
    commitInMain: (hash) => {
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', hash, 'origin/main'], { stdio: 'ignore' });
        return true;
      } catch {
        return false; // nicht enthalten oder unbekannt (z. B. nach einem Rebase)
      }
    },
  });
  if (!stale.length) {
    console.info('Keine veralteten Einträge: Jeder als offen geführte Branch bzw. PR ist auch auf main noch nicht gemergt.');
    return 0;
  }
  console.info(`${stale.length} veraltete Einträge (Stand vor dem Merge):`);
  for (const s of stale) console.info(`- ${s.datensatz} · ${s.eintrag}: ${s.hinweis}\n    „${s.stelle}“`);
  return 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseMerges, findStale };
