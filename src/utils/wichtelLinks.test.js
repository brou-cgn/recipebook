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
