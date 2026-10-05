import React, { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TemplateFormatEditor from './TemplateFormatEditor';
import { createFlowFormat } from '../utils/printFormats';
import { PRINT_TEMPLATES, getTemplateStyle } from '../utils/printTemplates';

let latest;
function Harness({ initial, ...props }) {
  const [format, setFormat] = useState(initial);
  latest = format;
  return <TemplateFormatEditor format={format} onChange={setFormat} {...props} />;
}
const setup = (initial = createFlowFormat('classic'), props = {}) => render(<Harness initial={initial} {...props} />);
const block = (container, id) => container.querySelector(`.tfe-preview [data-flow-el="${id}"]`);
const select = (container, id) => fireEvent.click(block(container, id));
const toolbar = () => screen.getByRole('toolbar');
const radio = (group, name) => within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });

afterEach(() => jest.restoreAllMocks());

describe('template gallery', () => {
  test('offers every template with the active one marked', () => {
    setup(createFlowFormat('card'));
    const gallery = screen.getByRole('radiogroup', { name: 'Vorlage' });
    expect(within(gallery).getAllByRole('radio')).toHaveLength(PRINT_TEMPLATES.length);
    expect(within(gallery).getByRole('radio', { name: /Karte/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(gallery).getByRole('radio', { name: /Klassisch/ })).toHaveAttribute('aria-checked', 'false');
  });

  test('choosing a template without own changes applies it directly', () => {
    const confirm = jest.spyOn(window, 'confirm');
    setup();
    fireEvent.click(screen.getByRole('radio', { name: /Kompakt/ }));
    expect(confirm).not.toHaveBeenCalled();
    expect(latest.template).toBe('compact');
    expect(latest.style).toEqual(getTemplateStyle('compact'));
  });

  test('own changes are only replaced after confirmation', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    setup();
    fireEvent.click(radio('Schriftgröße', 'Groß'));
    const minimal = () => within(screen.getByRole('radiogroup', { name: 'Vorlage' })).getByRole('radio', { name: /Schlicht/ });
    fireEvent.click(minimal());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(latest.template).toBe('classic');
    expect(latest.style.baseSize).toBe('l');
    confirm.mockReturnValue(true);
    fireEvent.click(minimal());
    expect(latest.template).toBe('minimal');
    expect(latest.style.baseSize).toBe('m');
  });

  test('applying a template keeps name, photo limit and page size', () => {
    setup({ ...createFlowFormat('classic'), name: 'Mein Format', maxPhotos: 2, pageWidthCm: 14.8, pageHeightCm: 21 });
    fireEvent.click(screen.getByRole('radio', { name: /Foto groß/ }));
    expect(latest).toMatchObject({ name: 'Mein Format', maxPhotos: 2, pageWidthCm: 14.8, pageHeightCm: 21, template: 'photo' });
  });
});

describe('style controls', () => {
  test('text options', () => {
    setup();
    fireEvent.click(radio('Schriftgröße', 'Klein'));
    fireEvent.click(radio('Abstände', 'Luftig'));
    fireEvent.click(radio('Überschriften', 'Farbbalken'));
    fireEvent.click(radio('Titel ausrichten', 'Links'));
    fireEvent.change(screen.getByLabelText('Akzentfarbe'), { target: { value: '#112233' } });
    fireEvent.change(screen.getByLabelText('Schriftart'), { target: { value: 'Arial, Helvetica, sans-serif' } });
    expect(latest.style).toMatchObject({ baseSize: 's', spacing: 'airy', headingStyle: 'bar', titleAlign: 'left', accent: '#112233' });
    expect(latest.fontFamily).toBe('Arial, Helvetica, sans-serif');
  });

  test('the preview follows the options', () => {
    const { container } = setup();
    fireEvent.click(radio('Schriftgröße', 'Groß'));
    expect(container.querySelector('.tfe-preview .ppf-sheet').style.fontSize).toBe('17px');
  });

  test('photo options disappear when there is no photo', () => {
    setup();
    expect(screen.getByLabelText('Seitenverhältnis')).toBeInTheDocument();
    fireEvent.click(radio('Position', 'Ohne Foto'));
    expect(screen.queryByLabelText('Seitenverhältnis')).toBeNull();
    expect(latest.style.photoPosition).toBe('none');
  });

  test('photo size, aspect ratio and count', () => {
    setup();
    fireEvent.click(radio('Größe', 'Klein'));
    fireEvent.change(screen.getByLabelText('Seitenverhältnis'), { target: { value: '1/1' } });
    fireEvent.change(screen.getByLabelText('Anzahl Fotos'), { target: { value: '3' } });
    expect(latest.style).toMatchObject({ photoSize: 's', photoAspect: '1/1', photoCount: 3 });
  });

  test('structure options and element toggles', () => {
    const { container } = setup();
    fireEvent.change(screen.getByLabelText('Zutaten und Zubereitung'), { target: { value: 'one' } });
    fireEvent.click(screen.getByLabelText('Zutaten farbig hinterlegen'));
    fireEvent.click(radio('Metadaten', 'Schlicht'));
    fireEvent.click(screen.getByLabelText('Autor & Datum'));
    expect(latest.style).toMatchObject({ columns: 'one', tintIngredients: true, metadataStyle: 'plain' });
    expect(latest.style.show.authorDate).toBe(false);
    expect(block(container, 'authorDate')).toBeNull();
  });

  test('paper preset keeps the orientation; orientation keeps the paper', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Papierformat'), { target: { value: 'a5' } });
    expect([latest.pageWidthCm, latest.pageHeightCm, latest.orientation]).toEqual([14.8, 21, 'portrait']);
    fireEvent.click(radio('Ausrichtung', 'Querformat'));
    expect([latest.pageWidthCm, latest.pageHeightCm, latest.orientation]).toEqual([21, 14.8, 'landscape']);
    fireEvent.change(screen.getByLabelText('Papierformat'), { target: { value: 'a4' } });
    expect([latest.pageWidthCm, latest.pageHeightCm]).toEqual([29.7, 21]);
  });

  test('custom paper size shows the size fields', () => {
    setup({ ...createFlowFormat('classic'), pageWidthCm: 12, pageHeightCm: 18 });
    expect(screen.getByLabelText('Papierformat')).toHaveValue('custom');
    fireEvent.change(screen.getByLabelText('Seitenbreite in cm'), { target: { value: '13' } });
    expect(latest.pageWidthCm).toBe(13);
  });

  test('page margin is clamped to 0..5 cm', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Seitenrand'), { target: { value: '9' } });
    expect(latest.style.marginCm).toBe(5);
    fireEvent.change(screen.getByLabelText('Seitenrand'), { target: { value: '-1' } });
    expect(latest.style.marginCm).toBe(0);
  });
});

describe('preview recipe', () => {
  test('uses the built-in sample recipe by default', () => {
    const { container } = setup();
    expect(block(container, 'title')).toHaveTextContent('Spaghetti Bolognese');
  });

  test('uses the chosen recipe when given', () => {
    const { container } = setup(createFlowFormat('classic'), { previewRecipe: { id: 'x', title: 'Mein Rezept' }, authorName: 'Ben' });
    expect(block(container, 'title')).toHaveTextContent('Mein Rezept');
  });
});

describe('click-to-format toolbar', () => {
  test('no toolbar until an element is clicked; background click and Esc close it', () => {
    const { container } = setup();
    expect(screen.queryByRole('toolbar')).toBeNull();
    select(container, 'title');
    expect(toolbar()).toHaveAccessibleName('Titel formatieren');
    fireEvent.click(container.querySelector('.tfe-preview .ppf-sheet'));
    expect(screen.queryByRole('toolbar')).toBeNull();
    select(container, 'title');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('toolbar')).toBeNull();
    select(container, 'title');
    fireEvent.click(screen.getByLabelText('Schließen'));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  test('selecting another element switches the toolbar', () => {
    const { container } = setup();
    select(container, 'title');
    select(container, 'steps');
    expect(toolbar()).toHaveAccessibleName('Zubereitung formatieren');
    expect(block(container, 'steps')).toHaveClass('ppf-block--selected');
  });

  test('size buttons change the element scale in 10 % steps within limits', () => {
    const { container } = setup();
    select(container, 'ingredients');
    fireEvent.click(screen.getByLabelText('Schrift größer'));
    fireEvent.click(screen.getByLabelText('Schrift größer'));
    expect(latest.overrides.ingredients.fontSizeScale).toBe(1.2);
    expect(within(toolbar()).getByLabelText('Schriftgröße')).toHaveTextContent('120 %');
    expect(block(container, 'ingredients').style.fontSize).toBe('1.2em');
    for (let i = 0; i < 20; i += 1) fireEvent.click(screen.getByLabelText('Schrift kleiner'));
    expect(latest.overrides.ingredients.fontSizeScale).toBe(0.6);
    expect(screen.getByLabelText('Schrift kleiner')).toBeDisabled();
  });

  test('bold, italic, underline toggle on and off', () => {
    const { container } = setup();
    select(container, 'title');
    fireEvent.click(screen.getByLabelText('Fett'));
    fireEvent.click(screen.getByLabelText('Kursiv'));
    fireEvent.click(screen.getByLabelText('Unterstrichen'));
    expect(latest.overrides.title).toEqual({ fontBold: true, fontItalic: true, fontUnderline: true });
    expect(screen.getByLabelText('Fett')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByLabelText('Fett'));
    expect(latest.overrides.title.fontBold).toBeUndefined();
  });

  test('alignment and colour', () => {
    const { container } = setup();
    select(container, 'metadata');
    fireEvent.click(screen.getByLabelText('Rechtsbündig'));
    fireEvent.change(screen.getByLabelText('Schriftfarbe'), { target: { value: '#ff0000' } });
    expect(latest.overrides.metadata).toEqual({ textAlignH: 'right', fontColor: '#ff0000' });
    expect(block(container, 'metadata').style.textAlign).toBe('right');
  });

  test('reset removes the formatting of that element only', () => {
    const { container } = setup();
    select(container, 'title');
    fireEvent.click(screen.getByLabelText('Fett'));
    select(container, 'steps');
    fireEvent.click(screen.getByLabelText('Kursiv'));
    expect(screen.getByLabelText('Formatierung zurücksetzen')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Formatierung zurücksetzen'));
    expect(latest.overrides).toEqual({ title: { fontBold: true } });
  });

  test('the reset button is only offered when there is something to reset', () => {
    const { container } = setup();
    select(container, 'title');
    expect(screen.queryByLabelText('Formatierung zurücksetzen')).toBeNull();
  });

  test('hiding an element removes it, closes the toolbar and keeps it restorable', () => {
    const { container } = setup();
    select(container, 'authorDate');
    fireEvent.click(screen.getByLabelText('Autor & Datum ausblenden'));
    expect(latest.style.show.authorDate).toBe(false);
    expect(block(container, 'authorDate')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    fireEvent.click(screen.getByLabelText('Autor & Datum'));
    expect(block(container, 'authorDate')).not.toBeNull();
  });

  test('photos get size, aspect ratio and count instead of text formatting', () => {
    const { container } = setup();
    select(container, 'photos');
    const bar = toolbar();
    expect(within(bar).queryByLabelText('Fett')).toBeNull();
    fireEvent.click(within(bar).getByRole('radio', { name: 'Mittel' }));
    fireEvent.change(within(bar).getByLabelText('Seitenverhältnis'), { target: { value: '3/2' } });
    fireEvent.change(within(bar).getByLabelText('Anzahl Fotos'), { target: { value: '2' } });
    expect(latest.style).toMatchObject({ photoSize: 'm', photoAspect: '3/2', photoCount: 2 });
  });

  test('a hidden element can not stay selected', () => {
    const { container } = setup();
    select(container, 'steps');
    fireEvent.click(screen.getByLabelText('Zubereitung', { selector: 'input' }));
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(block(container, 'steps')).toBeNull();
  });

  test('the toolbar is placed relative to the clicked element', () => {
    const { container } = setup();
    const preview = container.querySelector('.tfe-preview');
    preview.getBoundingClientRect = () => ({ top: 100, left: 50, width: 600, height: 800, bottom: 900, right: 650 });
    block(container, 'title').getBoundingClientRect = () => ({ top: 300, bottom: 340, left: 150, right: 400, width: 250, height: 40 });
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
    jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
    select(container, 'title');
    expect(toolbar().style.top).toBe('152px'); // 300 - 100 - 40 - 8
    expect(toolbar().style.left).toBe('100px'); // 150 - 50
  });

  test('without room above, the toolbar goes below the element', () => {
    const { container } = setup();
    container.querySelector('.tfe-preview').getBoundingClientRect = () => ({ top: 100, left: 0, width: 600, height: 800, bottom: 900, right: 600 });
    block(container, 'title').getBoundingClientRect = () => ({ top: 105, bottom: 145, left: 10, right: 300, width: 290, height: 40 });
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
    select(container, 'title');
    expect(toolbar().style.top).toBe('53px'); // 145 - 100 + 8
  });
});
