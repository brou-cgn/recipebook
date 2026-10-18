import { openRecipeWithTransition, findSourceImage } from './recipeViewTransition';

function renderCard() {
  document.body.innerHTML = `
    <div class="recipe-card">
      <div class="recipe-image"><img class="ric-image" src="a.jpg" alt="" /></div>
      <h3 id="title">Titel</h3>
    </div>
    <button id="other">Anderes</button>
  `;
  return document.querySelector('.ric-image');
}

function mockStartViewTransition() {
  let resolveFinished;
  const transition = {
    ready: Promise.resolve(),
    finished: new Promise((resolve) => { resolveFinished = resolve; }),
  };
  const calls = [];
  document.startViewTransition = jest.fn((cb) => {
    calls.push(cb);
    return transition;
  });
  return { calls, finish: () => resolveFinished() };
}

describe('recipeViewTransition', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.matchMedia = jest.fn(() => ({ matches: false }));
  });

  afterEach(() => {
    delete document.startViewTransition;
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = '';
  });

  test('ohne View Transitions API wird direkt aktualisiert', () => {
    renderCard();
    document.getElementById('title').click();
    const update = jest.fn();
    openRecipeWithTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test('Klick auf eine Karte findet deren Bild', () => {
    const img = renderCard();
    document.getElementById('title').click();
    expect(findSourceImage()).toBe(img);
  });

  test('Klick außerhalb einer Karte liefert kein Bild', () => {
    renderCard();
    document.getElementById('other').click();
    expect(findSourceImage()).toBeNull();
  });

  test('ohne Kartenbild wird direkt aktualisiert, ohne Übergang', () => {
    mockStartViewTransition();
    renderCard();
    document.getElementById('other').click();
    const update = jest.fn();
    openRecipeWithTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });

  test('bei „Bewegung reduzieren" wird direkt aktualisiert', () => {
    window.matchMedia = jest.fn(() => ({ matches: true }));
    mockStartViewTransition();
    renderCard();
    document.getElementById('title').click();
    const update = jest.fn();
    openRecipeWithTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });

  test('Kartenbild und Detailbild teilen nacheinander den Namen, danach aufgeräumt', async () => {
    const { calls, finish } = mockStartViewTransition();
    const source = renderCard();
    document.getElementById('title').click();

    let target;
    const update = jest.fn(() => {
      const detail = document.createElement('div');
      detail.className = 'recipe-detail-image';
      detail.innerHTML = '<img src="a.jpg" alt="" />';
      document.body.appendChild(detail);
      target = detail.querySelector('img');
      Object.defineProperty(target, 'complete', { value: true });
    });
    openRecipeWithTransition(update);

    // Alter Zustand: nur das Kartenbild trägt den Namen
    expect(source.style.viewTransitionName).toBe('recipe-hero');
    expect(update).not.toHaveBeenCalled();

    await calls[0]();
    expect(update).toHaveBeenCalledTimes(1);
    expect(source.style.viewTransitionName).toBe('');
    expect(target.style.viewTransitionName).toBe('recipe-hero');

    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(target.style.viewTransitionName).toBe('');
  });

  test('eine Aktivierung wird nur einmal verwendet', () => {
    mockStartViewTransition();
    renderCard();
    document.getElementById('title').click();
    openRecipeWithTransition(() => {});
    expect(findSourceImage()).toBeNull();
  });
});
