/**
 * Tech-Check W6: Der Abgleich meldet Dashboard-Einträge, die noch einen Stand vor
 * dem Merge nennen („Branch …, noch kein PR“, „PR #… (offen, …)“), obwohl der
 * Branch bzw. PR auf main gemergt ist.
 */
const { parseMerges, findStale } = require('../scripts/techCheckAbgleich');

const GIT_LOG = [
  'aaaaaaa1111111111111111111111111111111111\t2026-11-19\tMerge pull request #30 from brou-cgn/claude/fertig',
  'bbbbbbb2222222222222222222222222222222222\t2026-11-17\tMerge pull request #20 from brou-cgn/claude/zweimal',
  'ccccccc3333333333333333333333333333333333\t2026-11-10\tMerge pull request #10 from brou-cgn/claude/zweimal',
  'ddddddd4444444444444444444444444444444444\t2026-11-09\tMerge branch \'main\' into claude/fertig',
].join('\n');

describe('parseMerges', () => {
  it('liest PR-Nummer, Branch und Datum aus den Merge-Commits und übergeht andere Merges', () => {
    expect(parseMerges(GIT_LOG)).toEqual([
      { hash: 'aaaaaaa1111111111111111111111111111111111', date: '2026-11-19', pr: 30, branch: 'claude/fertig' },
      { hash: 'bbbbbbb2222222222222222222222222222222222', date: '2026-11-17', pr: 20, branch: 'claude/zweimal' },
      { hash: 'ccccccc3333333333333333333333333333333333', date: '2026-11-10', pr: 10, branch: 'claude/zweimal' },
    ]);
  });
});

describe('findStale', () => {
  const merges = parseMerges(GIT_LOG);

  it('meldet eine Umsetzungszeile „Branch …“, deren Branch gemergt ist', () => {
    const stale = findStale({
      merges,
      umsetzungen: [
        { pr: 'Branch claude/fertig', datum: '2026-11-18', ergebnis: 'offen, noch kein PR' },
        { pr: 'Branch claude/in-arbeit', datum: '2026-11-18', ergebnis: 'offen, noch kein PR' },
      ],
    });
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ datensatz: 'umsetzungen', eintrag: 'Branch claude/fertig' });
    expect(stale[0].hinweis).toContain('als PR #30 am 19.11.2026 gemergt (Merge aaaaaaa)');
  });

  it('meldet eine Zeile mit gemergtem PR, deren Stand noch „offen“ sagt', () => {
    const stale = findStale({
      merges,
      umsetzungen: [
        { pr: 'PR #20', datum: '2026-11-16', ergebnis: 'offen (16.11.2026); Tests grün' },
        { pr: 'PR #99', datum: '2026-11-16', ergebnis: 'offen (16.11.2026)' },
        { pr: 'PR #30', datum: '2026-11-19', ergebnis: 'gemergt (19.11.2026)' },
      ],
    });
    expect(stale.map((s) => s.eintrag)).toEqual(['PR #20']);
  });

  it('prüft jedes Segment eines Befunds mit dessen eigenem Datum', () => {
    const stale = findStale({
      merges,
      findings: [{
        id: 'X1',
        status: 'teilweise',
        umsetzung: [
          '16.11.2026, PR #20 (offen, noch nicht gemergt): erster Teil',
          // Der Branch wurde am 10.11. schon einmal gemergt; dieser Stand ist vom 18.11.
          // und wurde danach nicht mehr gemergt.
          '18.11.2026, Branch claude/zweimal (noch kein PR): zweiter Teil',
          '[Auto-Recalc] Stand 20.11.2026: Nutzen 1',
        ].join(' || '),
      }],
    });
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ datensatz: 'findings', eintrag: 'X1 (teilweise)', stelle: 'PR #20 (offen, noch nicht gemergt)' });
  });

  it('nimmt beim mehrfach gemergten Branch den ersten Merge ab dem Datum des Eintrags', () => {
    const [hit] = findStale({
      merges,
      findings: [{ id: 'X2', status: 'offen', umsetzung: '12.11.2026, Branch claude/zweimal (Commit 1, noch kein PR): Text' }],
    });
    expect(hit.hinweis).toContain('als PR #20 am 17.11.2026 gemergt');
  });

  it('meldet nichts, wenn der genannte Commit nicht auf main liegt', () => {
    const umsetzung = '19.11.2026, Branch claude/fertig (Commit abc1234, noch kein PR): Nacharbeit';
    const findings = [{ id: 'X3', status: 'offen', umsetzung }];
    expect(findStale({ merges, findings, commitInMain: () => false })).toEqual([]);
    expect(findStale({ merges, findings, commitInMain: () => true })).toHaveLength(1);
  });
});
