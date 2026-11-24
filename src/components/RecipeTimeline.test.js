import { render, screen, fireEvent, within } from '@testing-library/react';
import RecipeTimeline from './RecipeTimeline';
import { renderWithProviders } from '../test-utils';

// Klick auf eine Karte: Der Titel ist der Knopf (sein ::after deckt im Browser die ganze Karte ab)
const karteWaehlen = (titel) => fireEvent.click(screen.getByRole('button', { name: titel }));

describe('RecipeTimeline', () => {
  const mockRecipes = [
    {
      id: '1',
      title: 'Recipe 1',
      createdAt: { toDate: () => new Date('2024-01-15') },
      ingredients: ['ingredient1', 'ingredient2'],
      steps: ['step1', 'step2'],
      authorId: 'user-1',
      image: 'https://example.com/image1.jpg'
    },
    {
      id: '2',
      title: 'Recipe 2',
      createdAt: { toDate: () => new Date('2024-01-20') },
      ingredients: ['ingredient1'],
      steps: ['step1'],
      authorId: 'user-2',
    },
    {
      id: '3',
      title: 'Recipe 3',
      createdAt: { toDate: () => new Date('2024-01-10') },
      ingredients: ['ingredient1', 'ingredient2', 'ingredient3'],
      steps: ['step1', 'step2', 'step3'],
      authorId: 'user-1',
    }
  ];

  const mockUsers = [
    { id: 'user-1', vorname: 'John', nachname: 'Doe' },
    { id: 'user-2', vorname: 'Jane', nachname: 'Smith' },
  ];

  const sameDay = new Date('2024-03-05');
  const zweiAmSelbenTag = [
    { id: 'a', title: 'Morning Cake', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
    { id: 'b', title: 'Evening Stew', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
  ];

  test('renders empty state when no recipes', () => {
    render(
      <RecipeTimeline
        recipes={[]}
        onSelectRecipe={() => {}}
        allUsers={[]}
      />
    );

    expect(screen.getByText('Keine Rezepte vorhanden')).toBeInTheDocument();
  });

  test('sorts correctly when createdAt is an ISO date string', () => {
    const recipesWithStringDates = [
      { id: 's1', title: 'Old Recipe', createdAt: '2020-11-13T00:00:00Z', ingredients: [], steps: [] },
      { id: 's2', title: 'New Recipe', createdAt: '2026-02-08T00:00:00Z', ingredients: [], steps: [] },
      { id: 's3', title: 'Middle Recipe', createdAt: '2021-12-30T00:00:00Z', ingredients: [], steps: [] },
    ];

    render(
      <RecipeTimeline
        recipes={recipesWithStringDates}
        onSelectRecipe={() => {}}
        allUsers={[]}
      />
    );

    const timelineCards = document.querySelectorAll('.timeline-card');
    const titles = Array.from(timelineCards).map(card =>
      card.querySelector('.timeline-title').textContent
    );
    // Newest first: 2026, 2021, 2020
    expect(titles).toEqual(['New Recipe', 'Middle Recipe', 'Old Recipe']);
  });

  test('renders recipes in reverse chronological order', () => {
    render(
      <RecipeTimeline
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );

    // Get all timeline cards
    const timelineCards = document.querySelectorAll('.timeline-card');
    expect(timelineCards).toHaveLength(3);

    // Verify order: Recipe 2 (Jan 20) -> Recipe 1 (Jan 15) -> Recipe 3 (Jan 10)
    const titles = Array.from(timelineCards).map(card =>
      card.querySelector('.timeline-title').textContent
    );
    expect(titles).toEqual(['Recipe 2', 'Recipe 1', 'Recipe 3']);
  });

  test('puts entries without a valid date last', () => {
    render(
      <RecipeTimeline
        recipes={[
          { id: 'x', title: 'Ohne Datum', createdAt: 'kein Datum' },
          ...mockRecipes,
        ]}
        onSelectRecipe={() => {}}
      />
    );

    const titles = Array.from(document.querySelectorAll('.timeline-title')).map((el) => el.textContent);
    expect(titles).toEqual(['Recipe 2', 'Recipe 1', 'Recipe 3', 'Ohne Datum']);
    expect(screen.getByText('Unbekannt')).toHaveClass('timeline-monat');
  });

  test('displays recipe details correctly', () => {
    render(
      <RecipeTimeline
        recipes={[mockRecipes[0]]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );

    expect(screen.getByText('Recipe 1')).toBeInTheDocument();
    // Ganzes Datum für Screenreader, sichtbar sind Monat und Tag
    expect(screen.getByText('15. Januar 2024')).toHaveClass('timeline-vorlesen');
  });

  test('shows the month as heading and the day with its weekday on the rail', () => {
    render(
      <RecipeTimeline
        recipes={[mockRecipes[0], { id: 'f', title: 'Februar-Rezept', createdAt: new Date('2024-02-01') }]}
        onSelectRecipe={() => {}}
      />
    );

    const monate = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(monate).toEqual(['Februar 2024', 'Januar 2024']);

    const tage = Array.from(document.querySelectorAll('.timeline-item'));
    expect(tage).toHaveLength(2);
    expect(tage[1].querySelector('.timeline-marker')).toHaveTextContent('15');
    expect(tage[1].querySelector('.timeline-wochentag')).toHaveTextContent('Mo');
    expect(tage[1].querySelector('.timeline-datum')).toHaveAttribute('aria-hidden', 'true');
  });

  test('displays author name when provided', () => {
    render(
      <RecipeTimeline
        recipes={[mockRecipes[0]]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );

    expect(screen.getByText('John')).toBeInTheDocument();
  });

  test('shows the name only for entries of other users', () => {
    render(
      <RecipeTimeline
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUserId="user-1"
      />
    );

    expect(screen.queryByText('John')).not.toBeInTheDocument();
    expect(screen.getByText('Jane')).toHaveClass('timeline-typ__zusatz');
  });

  test('shows the kind of entry instead of the author line', () => {
    render(
      <RecipeTimeline
        recipes={[
          { id: 'r', title: 'Suppe', createdAt: new Date('2024-01-03'), authorId: 'user-1' },
          { id: 'm', title: 'Festessen', createdAt: new Date('2024-01-02'), itemType: 'menu', authorId: 'user-1' },
          { id: 'c', title: 'Suppe', createdAt: new Date('2024-01-01'), itemType: 'cookEvent', authorId: 'user-1' },
        ]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUserId="user-1"
      />
    );

    const typen = Array.from(document.querySelectorAll('.timeline-typ__text')).map((el) => el.textContent);
    expect(typen).toEqual(['Neues Rezept', 'Menü', 'Gekocht']);
    expect(document.querySelector('.timeline-marker--menue')).toBeInTheDocument();
    expect(document.querySelector('.timeline-marker--gekocht')).toBeInTheDocument();
  });

  test('handles recipe click', () => {
    const handleSelectRecipe = jest.fn();

    render(
      <RecipeTimeline
        recipes={[mockRecipes[0]]}
        onSelectRecipe={handleSelectRecipe}
        allUsers={mockUsers}
      />
    );

    karteWaehlen('Recipe 1');

    expect(handleSelectRecipe).toHaveBeenCalledWith(mockRecipes[0]);
    expect(handleSelectRecipe).toHaveBeenCalledTimes(1);
  });

  test('the card title is a heading with a real button (reachable by keyboard)', () => {
    render(<RecipeTimeline recipes={[mockRecipes[0]]} onSelectRecipe={() => {}} />);

    const heading = screen.getByRole('heading', { name: 'Recipe 1' });
    expect(within(heading).getByRole('button', { name: 'Recipe 1' })).toHaveAttribute('type', 'button');
  });

  test('handles date formatting for different formats', () => {
    const recipeWithStringDate = {
      ...mockRecipes[0],
      createdAt: new Date('2024-02-01')
    };

    render(
      <RecipeTimeline
        recipes={[recipeWithStringDate]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );

    expect(screen.getByText('01. Februar 2024')).toBeInTheDocument();
  });

  test('groups entries by calendar day in local time', () => {
    render(
      <RecipeTimeline
        recipes={[
          { id: 'spaet', title: 'Spät am Abend', createdAt: new Date(2024, 2, 5, 23, 30) },
          { id: 'frueh', title: 'Früh am Morgen', createdAt: new Date(2024, 2, 6, 0, 30) },
        ]}
        onSelectRecipe={() => {}}
      />
    );

    const tage = Array.from(document.querySelectorAll('.timeline-item .timeline-marker')).map((el) => el.textContent);
    expect(tage).toEqual(['6', '5']);
  });

  test('displays recipe own image when provided', () => {
    render(
      <RecipeTimeline
        recipes={[mockRecipes[0]]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );

    const image = screen.getByAltText('Recipe 1');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/image1.jpg');
  });

  test('renders without image when recipe has no image', () => {
    render(
      <RecipeTimeline
        recipes={[mockRecipes[1]]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );

    expect(screen.queryByAltText('Recipe 2')).not.toBeInTheDocument();
  });

  test('shows several recipes of one day in one card with "+ 1 weiteres Rezept"', () => {
    render(
      <RecipeTimeline
        recipes={zweiAmSelbenTag}
        onSelectRecipe={() => {}}
        allUsers={[]}
      />
    );

    // One day, one group, only the first entry visible
    expect(document.querySelectorAll('.timeline-item')).toHaveLength(1);
    expect(document.querySelectorAll('.timeline-gruppe')).toHaveLength(1);
    expect(screen.getByText('Morning Cake')).toBeInTheDocument();
    expect(screen.queryByText('Evening Stew')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: '+ 1 weiteres Rezept' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('counts the further entries of a day in plural', () => {
    render(
      <RecipeTimeline
        recipes={[...zweiAmSelbenTag, { id: 'c', title: 'Gamma', createdAt: { toDate: () => sameDay } }]}
        onSelectRecipe={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: '+ 2 weitere Rezepte' })).toBeInTheDocument();
  });

  test('expands and collapses the further entries of a day', () => {
    render(
      <RecipeTimeline
        recipes={zweiAmSelbenTag}
        onSelectRecipe={() => {}}
        allUsers={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '+ 1 weiteres Rezept' }));

    expect(screen.getByText('Morning Cake')).toBeInTheDocument();
    expect(screen.getByText('Evening Stew')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Weniger anzeigen' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.timeline-gruppe')).toHaveClass('timeline-gruppe--offen');

    fireEvent.click(toggle);

    expect(screen.queryByText('Evening Stew')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ 1 weiteres Rezept' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('calls onSelectRecipe when an expanded card is clicked and stays expanded', () => {
    const handleSelect = jest.fn();

    render(
      <RecipeTimeline
        recipes={zweiAmSelbenTag}
        onSelectRecipe={handleSelect}
        allUsers={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '+ 1 weiteres Rezept' }));
    karteWaehlen('Evening Stew');

    expect(handleSelect).toHaveBeenCalledWith(zweiAmSelbenTag[1]);
    expect(screen.getByRole('button', { name: 'Weniger anzeigen' })).toBeInTheDocument();
  });

  test('calls onSelectRecipe for the first entry without expanding', () => {
    const handleSelect = jest.fn();

    render(
      <RecipeTimeline
        recipes={zweiAmSelbenTag}
        onSelectRecipe={handleSelect}
        allUsers={[]}
      />
    );

    karteWaehlen('Morning Cake');

    expect(handleSelect).toHaveBeenCalledWith(zweiAmSelbenTag[0]);
    expect(screen.queryByText('Evening Stew')).not.toBeInTheDocument();
  });

  test('displays custom emoji icon next to the kind of entry', () => {
    render(
      <RecipeTimeline
        recipes={[mockRecipes[0]]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        timelineBubbleIcon="🍕"
      />
    );

    expect(document.querySelector('.timeline-typ__zeichen--icon')).toHaveTextContent('🍕');
  });

  test('displays custom image icon next to the kind of entry', () => {
    const iconSrc = 'data:image/png;base64,abc123';
    render(
      <RecipeTimeline
        recipes={[mockRecipes[0]]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        timelineBubbleIcon={iconSrc}
      />
    );

    const iconImg = document.querySelector('.timeline-typ__icon');
    expect(iconImg).toBeInTheDocument();
    expect(iconImg).toHaveAttribute('src', iconSrc);
    expect(iconImg).toHaveAttribute('alt', '');
  });

  test('shows a dot instead of an icon when none is configured', () => {
    render(<RecipeTimeline recipes={[mockRecipes[0]]} onSelectRecipe={() => {}} />);

    const zeichen = document.querySelector('.timeline-typ__zeichen');
    expect(zeichen).toBeInTheDocument();
    expect(zeichen).not.toHaveClass('timeline-typ__zeichen--icon');
    expect(zeichen).toHaveAttribute('aria-hidden', 'true');
  });

  test('uses recipe own image instead of categoryImages for recipe', () => {
    const categoryImgs = [
      { id: 'c1', image: 'data:image/png;base64,categoryimage', categories: ['Dessert'] }
    ];
    const recipeWithCategory = { ...mockRecipes[0], speisekategorie: ['Dessert'] };
    render(
      <RecipeTimeline
        recipes={[recipeWithCategory]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        categoryImages={categoryImgs}
      />
    );

    const img = screen.getByAltText('Recipe 1');
    // Should show the recipe's own image, not the category image
    expect(img).toHaveAttribute('src', mockRecipes[0].image);
  });

  test('shows no image for recipe when recipe has no image', () => {
    const categoryImgs = [
      { id: 'c1', image: 'data:image/png;base64,categoryimage', categories: ['Dessert'] }
    ];
    const recipeWithoutImage = { ...mockRecipes[1], speisekategorie: ['Dessert'] };
    render(
      <RecipeTimeline
        recipes={[recipeWithoutImage]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        categoryImages={categoryImgs}
      />
    );

    expect(screen.queryByAltText('Recipe 2')).not.toBeInTheDocument();
  });

  test('uses defaultImage for menu items', () => {
    const defaultImg = 'data:image/png;base64,defaultimage';
    const menuItem = {
      id: 'm1',
      title: 'Test Menu',
      createdAt: { toDate: () => new Date('2024-01-15') },
      ingredients: ['r1', 'r2'],
      steps: [],
      authorId: 'user-1',
    };
    render(
      <RecipeTimeline
        recipes={[menuItem]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        defaultImage={defaultImg}
        itemType="menu"
      />
    );

    const img = screen.getByAltText('Test Menu');
    expect(img).toHaveAttribute('src', defaultImg);
  });

  test('does not show meta info (Rezepte/Zutaten/Schritte) for menu items', () => {
    const menuItem = {
      id: 'm1',
      title: 'Test Menu',
      createdAt: { toDate: () => new Date('2024-01-15') },
      ingredients: ['r1', 'r2', 'r3'],
      steps: [],
      authorId: 'user-1',
    };
    render(
      <RecipeTimeline
        recipes={[menuItem]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        itemType="menu"
      />
    );

    expect(screen.getByText('Test Menu')).toBeInTheDocument();
    expect(screen.queryByText(/Rezepte/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Zutaten/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Schritte/)).not.toBeInTheDocument();
  });

  test('shows "Keine Menüs vorhanden" empty state when itemType is menu', () => {
    render(
      <RecipeTimeline
        recipes={[]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        itemType="menu"
      />
    );

    expect(screen.getByText('Keine Menüs vorhanden')).toBeInTheDocument();
  });

  test('toggle shows "+ 1 weiteres Menü" when itemType is menu', () => {
    const menuItems = [
      { id: 'm1', title: 'Menu A', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
      { id: 'm2', title: 'Menu B', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
    ];

    render(
      <RecipeTimeline
        recipes={menuItems}
        onSelectRecipe={() => {}}
        allUsers={[]}
        itemType="menu"
      />
    );

    expect(screen.getByRole('button', { name: '+ 1 weiteres Menü' })).toBeInTheDocument();
  });

  test('menus and recipes on the same day are separate groups under one date', () => {
    const mixedItems = [
      { id: 'r1', title: 'Recipe 1', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
      { id: 'r2', title: 'Recipe 2', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
      { id: 'm1', title: 'Menu 1', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [], itemType: 'menu' },
      { id: 'm2', title: 'Menu 2', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [], itemType: 'menu' },
    ];

    render(
      <RecipeTimeline
        recipes={mixedItems}
        onSelectRecipe={() => {}}
        allUsers={[]}
      />
    );

    // One date on the rail (neutral, two kinds), two groups beside it
    expect(document.querySelectorAll('.timeline-item')).toHaveLength(1);
    expect(document.querySelector('.timeline-marker')).toHaveClass('timeline-marker--gemischt');
    expect(document.querySelectorAll('.timeline-gruppe')).toHaveLength(2);

    // Toggle labels reflect the correct type per group
    expect(screen.getByRole('button', { name: '+ 1 weiteres Rezept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ 1 weiteres Menü' })).toBeInTheDocument();
  });
});

describe('RecipeTimeline: Filter nach Art', () => {
  const eintraege = [
    { id: 'r', title: 'Linsensuppe', createdAt: new Date('2024-01-03') },
    { id: 'm', title: 'Sonntagsessen', createdAt: new Date('2024-01-02'), itemType: 'menu' },
    { id: 'c', title: 'Apfelkuchen', createdAt: new Date('2024-01-01'), itemType: 'cookEvent' },
  ];

  test('erscheint erst, wenn mehr als eine Art vorkommt', () => {
    const { unmount } = render(<RecipeTimeline recipes={[eintraege[0]]} onSelectRecipe={() => {}} />);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    unmount();

    render(<RecipeTimeline recipes={[eintraege[0], eintraege[2]]} onSelectRecipe={() => {}} />);
    const filter = screen.getByRole('radiogroup', { name: 'Zeitleiste filtern' });
    // Nur die Arten, die es gibt
    expect(within(filter).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Alle', 'Rezepte', 'Gekocht']);
  });

  test('zeigt nur die gewählte Art und wieder alles', () => {
    render(<RecipeTimeline recipes={eintraege} onSelectRecipe={() => {}} />);

    expect(screen.getByRole('radio', { name: 'Alle' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Gekocht' }));

    expect(screen.getByRole('radio', { name: 'Gekocht' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Apfelkuchen')).toBeInTheDocument();
    expect(screen.queryByText('Linsensuppe')).not.toBeInTheDocument();
    expect(screen.queryByText('Sonntagsessen')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Alle' }));
    expect(screen.getByText('Linsensuppe')).toBeInTheDocument();
    expect(screen.getByText('Sonntagsessen')).toBeInTheDocument();
  });
});

describe('RecipeTimeline: Geplantes und die Linie „Heute“', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 24, 12, 0) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const geplantesMenue = { id: 'm', title: 'Heiligabend-Menü', createdAt: new Date('2026-12-24'), itemType: 'menu' };
  const gekocht = { id: 'c', title: 'Rote-Bete-Schaumsuppe', createdAt: new Date(2026, 10, 22, 19, 0), itemType: 'cookEvent' };

  test('stellt Geplantes über „Heute“, gestrichelt und mit Abstand', () => {
    render(<RecipeTimeline recipes={[gekocht, geplantesMenue]} onSelectRecipe={() => {}} />);

    const reihenfolge = Array.from(document.querySelectorAll('.timeline-monat, .timeline-heute, .timeline-item'))
      .map((el) => (el.classList.contains('timeline-item') ? el.querySelector('.timeline-marker').textContent : el.textContent));
    expect(reihenfolge).toEqual(['Dezember 2026', '24', 'November 2026', 'Heute · Di., 24. Nov.', '22']);

    const [geplant, vergangen] = document.querySelectorAll('.timeline-marker');
    expect(geplant).toHaveClass('timeline-marker--geplant', 'timeline-marker--menue');
    expect(vergangen).not.toHaveClass('timeline-marker--geplant');
    expect(screen.getByText('in 30 Tagen')).toHaveClass('timeline-typ__zusatz');
  });

  test('ohne Geplantes keine Linie „Heute“', () => {
    render(<RecipeTimeline recipes={[gekocht]} onSelectRecipe={() => {}} />);

    expect(document.querySelector('.timeline-heute')).not.toBeInTheDocument();
    expect(screen.queryByText(/in \d+ Tagen/)).not.toBeInTheDocument();
  });

  test('heute Gekochtes steht unter der Linie', () => {
    const heuteGekocht = { ...gekocht, id: 'h', title: 'Pfannkuchen', createdAt: new Date(2026, 10, 24, 9, 0) };
    render(<RecipeTimeline recipes={[heuteGekocht, geplantesMenue]} onSelectRecipe={() => {}} />);

    const zeilen = Array.from(document.querySelectorAll('.timeline-heute, .timeline-item'));
    expect(zeilen.map((el) => el.className.split(' ')[0])).toEqual(['timeline-item', 'timeline-heute', 'timeline-item']);
    expect(zeilen[2].querySelector('.timeline-marker')).not.toHaveClass('timeline-marker--geplant');
  });
});

describe('RecipeTimeline: Mehrsprachigkeit (PR 6o)', () => {
  const tag = new Date('2024-03-05T12:00:00');
  const kochereignisse = [
    {
      id: 'a',
      title: 'Pfannkuchen',
      itemType: 'cookEvent',
      createdAt: { toDate: () => tag },
      originalRecipe: { image: 'https://example.com/pfannkuchen.jpg' },
      titelUebersetzung: { quelle: 'Pfannkuchen', originalSprache: 'de', en: 'Pancakes', fr: 'Crêpes' },
    },
    { id: 'b', title: 'Eintopf', itemType: 'cookEvent', createdAt: { toDate: () => tag } },
  ];

  test('Englisch: Datum, Monat, Art, weitere Einträge und übersetzter Titel', () => {
    renderWithProviders(
      <RecipeTimeline recipes={kochereignisse} onSelectRecipe={() => {}} />,
      { sprache: 'en', inhalteUebersetzen: true },
    );
    expect(screen.getByText('05 March 2024')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'March 2024' })).toBeInTheDocument();
    expect(screen.getByText('Cooked')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pancakes' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pancakes' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ 1 more dish' }));
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Eintopf')).toBeInTheDocument();
  });

  test('Französisch: leere Zeitleiste der Menüs und Datum ohne gültigen Wert', () => {
    const { unmount } = renderWithProviders(
      <RecipeTimeline recipes={[]} onSelectRecipe={() => {}} itemType="menu" />,
      { sprache: 'fr' },
    );
    expect(screen.getByText('Aucun menu pour l’instant')).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <RecipeTimeline recipes={[{ id: 'x', title: 'Soupe', createdAt: 'kein Datum' }]} onSelectRecipe={() => {}} />,
      { sprache: 'fr' },
    );
    expect(screen.getByText('Date inconnue')).toBeInTheDocument();
  });
});
