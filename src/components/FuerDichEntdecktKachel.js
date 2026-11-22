import React from 'react';
import { getRecipeCardImageUrl } from '../utils/imageUtils';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { formatiereDatum } from '../i18n/format';
import startseiteTexte from '../i18n/texte/startseite';
import { FUER_DICH_ENTDECKT_SYSTEM_KEY } from '../utils/fuerDichEntdeckt';
import './StartseitenKarussell.css';
import './FuerDichEntdecktKachel.css';

const COLLAGE_MAX = 3;

const formatMonthYear = (value, sprache) => {
  const date = typeof value?.toDate === 'function' ? value.toDate() : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return formatiereDatum(date, sprache, { month: 'long', year: 'numeric' });
};

/**
 * FuerDichEntdecktKachel – Startseiten-Kachel "Für dich entdeckt".
 *
 * Einstieg in den Swipestapel der persönlichen Liste "Für dich entdeckt"
 * (siehe utils/fuerDichEntdeckt.js), ähnlich den Rückblicken der Fotos-App.
 * Die Beschreibung der Liste dient als Thementitel, `themeLabel` als kleine
 * Rubrik darüber (z. B. "Saison"), der Monat von `rotatedAt` ergänzt die
 * Meta-Zeile ("5 Rezepte · Oktober 2026"); solange die Liste leer ist,
 * zeigt die Kachel einen Hinweis und ist nicht antippbar.
 *
 * Props:
 *   list       {Object}   die Liste "Für dich entdeckt"
 *   themeImage {string}   optionales Bild des aktuellen Themas; ersetzt die Rezeptbild-Collage
 *   themeTitle {string}   Beschreibung des aktuellen Themas; Ersatz, falls `list.description` leer ist
 *   recipes  {Array}    Rezepte der Liste (übernommene Kandidaten zählen nicht mit)
 *   onOpen   {Function} (listId) => void – öffnet den Swipestapel
 */
function FuerDichEntdecktKachel({ list, recipes = [], themeImage = '', themeTitle: themeTitleProp = '', onOpen }) {
  const t = useTexte(startseiteTexte);
  const { sprache } = useSprache();
  if (!list) return null;

  // Übernommene Kandidaten (carriedRecipeIds) gehören nicht zum aktuellen Thema:
  // Sie bleiben im Stapel, zählen aber nicht in die Kachel. Besteht die Liste nur
  // aus ihnen, zeigt die Kachel sie, statt "0 Rezepte" anzuzeigen.
  const carried = new Set(Array.isArray(list.carriedRecipeIds) ? list.carriedRecipeIds : []);
  const themeRecipes = recipes.filter((recipe) => !carried.has(recipe.id));
  const shown = themeRecipes.length > 0 ? themeRecipes : recipes;
  const count = shown.length;
  const collage = shown.slice(0, COLLAGE_MAX).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    imageUrl: getRecipeCardImageUrl(recipe),
  }));
  // Thema und Rubrik sind Inhalt (gepflegt bzw. vom System gesetzt), der Ersatztext ist Oberfläche
  const themeTitle = (typeof list.description === 'string' && list.description.trim()) || themeTitleProp.trim() || t('themenStandard');
  const themeLabel = (typeof list.themeLabel === 'string' && list.themeLabel.trim()) || '';
  const countText = t('rezepte', { anzahl: count });
  const monthYear = formatMonthYear(list.rotatedAt, sprache);
  // Systemname der Liste in der geltenden Sprache; eigene Namen bleiben
  const listName = list.systemKey === FUER_DICH_ENTDECKT_SYSTEM_KEY ? t('fuerDichEntdeckt') : list.name;
  const meta = monthYear ? `${countText} · ${monthYear}` : countText;

  return (
    <section className="startseite-trending-section fuer-dich-entdeckt">
      <div className="startseite-section-header">
        <h2 className="startseite-section-title">{listName}</h2>
      </div>
      {count === 0 ? (
        <div className="fuer-dich-entdeckt-card fuer-dich-entdeckt-card--empty">
          <p className="fuer-dich-entdeckt-empty-text">{t('baldThemen')}</p>
        </div>
      ) : (
        <button
          type="button"
          className="fuer-dich-entdeckt-card"
          onClick={() => onOpen?.(list.id)}
          aria-label={t('stapelOeffnen', { thema: themeTitle, rezepte: countText })}
        >
          {themeImage ? (
            <span className="fuer-dich-entdeckt-collage fuer-dich-entdeckt-collage--1" aria-hidden="true">
              <span className="fuer-dich-entdeckt-collage-cell">
                <img src={themeImage} alt="" draggable="false" />
              </span>
            </span>
          ) : (
            <span className={`fuer-dich-entdeckt-collage fuer-dich-entdeckt-collage--${collage.length}`} aria-hidden="true">
              {collage.map((item) => (
                <span key={item.id} className="fuer-dich-entdeckt-collage-cell">
                  {item.imageUrl && <img src={item.imageUrl} alt="" draggable="false" />}
                </span>
              ))}
            </span>
          )}
          <span className="fuer-dich-entdeckt-caption">
            {themeLabel && <span className="fuer-dich-entdeckt-eyebrow">{themeLabel}</span>}
            <span className="fuer-dich-entdeckt-title">{themeTitle}</span>
            <span className="fuer-dich-entdeckt-meta">{meta}</span>
          </span>
        </button>
      )}
    </section>
  );
}

export default FuerDichEntdecktKachel;
