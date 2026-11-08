import { buildWichtelEinladung, buildWichtelLink, parseWichtelLink, teileWichtelEinladung } from './wichtelLinks';

const RUNDE = 'AbCdEfGhIj0123456789';
const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF1234';

describe('parseWichtelLink', () => {
  it('liest Pfad und Hash', () => {
    expect(parseWichtelLink({ pathname: `/wichteln/${RUNDE}/${TOKEN}` }))
      .toEqual({ rundeId: RUNDE, token: TOKEN, gueltig: true });
    expect(parseWichtelLink({ pathname: `/wichteln/${RUNDE}/${TOKEN}/` }))
      .toEqual({ rundeId: RUNDE, token: TOKEN, gueltig: true });
    expect(parseWichtelLink({ pathname: '/', hash: `#wichteln/${RUNDE}/${TOKEN}` }))
      .toEqual({ rundeId: RUNDE, token: TOKEN, gueltig: true });
  });

  it('erkennt kaputte Wichtel-Links als ungültig statt sie zu ignorieren', () => {
    expect(parseWichtelLink({ pathname: `/wichteln/${RUNDE}/${TOKEN.slice(0, 20)}` }).gueltig).toBe(false);
    expect(parseWichtelLink({ pathname: `/wichteln/${RUNDE}` }).gueltig).toBe(false);
    expect(parseWichtelLink({ pathname: `/wichteln/${RUNDE}/${TOKEN}/mehr` }).gueltig).toBe(false);
    expect(parseWichtelLink({ pathname: `/wichteln/a.b/${TOKEN}` }).gueltig).toBe(false);
  });

  it('ignoriert andere Adressen', () => {
    expect(parseWichtelLink({ pathname: '/' })).toBeNull();
    expect(parseWichtelLink({ pathname: '/wichteln' })).toBeNull();
    expect(parseWichtelLink({ pathname: '/share/abc', hash: '#menu-share/x' })).toBeNull();
    expect(parseWichtelLink()).toBeNull();
  });

  it('liest zurück, was buildWichtelLink baut', () => {
    const link = buildWichtelLink(RUNDE, TOKEN, 'https://broubook.web.app');
    expect(link).toBe(`https://broubook.web.app/wichteln/${RUNDE}/${TOKEN}`);
    expect(parseWichtelLink(new URL(link))).toEqual({ rundeId: RUNDE, token: TOKEN, gueltig: true });
  });
});

describe('Einladung', () => {
  const params = { name: 'Lena', titel: 'Advent 2026', link: 'https://x.test/wichteln/a/b' };

  afterEach(() => {
    delete navigator.share;
    delete navigator.clipboard;
  });

  it('enthält Name, Titel und Link', () => {
    const text = buildWichtelEinladung(params);
    expect(text).toContain('Hallo Lena,');
    expect(text).toContain('„Advent 2026“');
    expect(text).toContain(params.link);
  });

  it('spricht den Gast in seiner Sprache an', () => {
    const en = buildWichtelEinladung({ ...params, sprache: 'en' });
    expect(en.split('\n')).toEqual([
      'Hi Lena,',
      'Here is your personal Secret Santa link for “Advent 2026”. Use it to draw a name, add your wishes and leave gift ideas for the others:',
      params.link,
      'Please don’t share it – this link is just for you.',
    ]);

    const fr = buildWichtelEinladung({ ...params, sprache: 'fr' });
    expect(fr).toContain('Bonjour Lena,');
    expect(fr).toContain('Père Noël secret «\u00A0Advent 2026\u00A0»');
    expect(fr).toContain(params.link);
    expect(fr).toContain('ce lien t’est réservé');
  });

  it('ohne oder mit unbekannter Sprache: Deutsch wie bisher', () => {
    const deutsch = buildWichtelEinladung(params);
    expect(deutsch.split('\n')[0]).toBe('Hallo Lena,');
    expect(buildWichtelEinladung({ ...params, sprache: 'de' })).toBe(deutsch);
    expect(buildWichtelEinladung({ ...params, sprache: 'es' })).toBe(deutsch);
    expect(buildWichtelEinladung({ ...params, sprache: null })).toBe(deutsch);
  });

  it('übersetzt auch den Titel im Teilen-Menü', async () => {
    navigator.share = jest.fn().mockResolvedValue();
    await teileWichtelEinladung({ ...params, sprache: 'en' });
    expect(navigator.share).toHaveBeenCalledWith({
      title: 'Secret Santa: Advent 2026',
      text: buildWichtelEinladung({ ...params, sprache: 'en' }),
    });
    await teileWichtelEinladung({ ...params, sprache: 'fr' });
    expect(navigator.share).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Père Noël secret\u00A0: Advent 2026' }));
  });

  it('kopiert ohne Teilen-Menü den Text in der Sprache des Gasts', async () => {
    navigator.clipboard = { writeText: jest.fn().mockResolvedValue() };
    await expect(teileWichtelEinladung({ ...params, sprache: 'fr' })).resolves.toBe('kopiert');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(buildWichtelEinladung({ ...params, sprache: 'fr' }));
  });

  it('nutzt das Teilen-Menü, wenn vorhanden', async () => {
    navigator.share = jest.fn().mockResolvedValue();
    await expect(teileWichtelEinladung(params)).resolves.toBe('geteilt');
    expect(navigator.share).toHaveBeenCalledWith({ title: 'Wichteln: Advent 2026', text: buildWichtelEinladung(params) });
  });

  it('meldet Abbrechen im Teilen-Menü, ohne zu kopieren', async () => {
    navigator.share = jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    navigator.clipboard = { writeText: jest.fn() };
    await expect(teileWichtelEinladung(params)).resolves.toBe('abgebrochen');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('kopiert ohne Teilen-Menü', async () => {
    navigator.clipboard = { writeText: jest.fn().mockResolvedValue() };
    await expect(teileWichtelEinladung(params)).resolves.toBe('kopiert');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(buildWichtelEinladung(params));
  });
});
