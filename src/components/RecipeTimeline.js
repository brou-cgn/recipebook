import { useMemo, useState } from 'react';
import './RecipeTimeline.css';
import AuswahlGruppe from './AuswahlGruppe';
import { isBase64Image } from '../utils/imageUtils';
import { useRezeptTitel, useSprache, useTexte } from '../contexts/SpracheContext';
import { formatiereAbstandInTagen, formatiereDatum, formatiereZahl } from '../i18n/format';
import chefkochTexte from '../i18n/texte/chefkochUndMehr';

/*
 * Zeitleiste in „Mein Kochbuch“ (Chefkoch & mehr), Variante A des Designvorschlags
 * https://claude.ai/artifact/CxEY1RvbShLhAVRxTgz3pB:
 *  - Rezepte, Menüs und Kochereignisse nach Kalendertag und Art gruppiert, neueste zuerst.
 *  - Der Tag steht als Zahl im Kreis auf der Schiene, darüber je Monat eine Überschrift.
 *  - Geplantes (Tag nach heute, etwa ein Menü mit Datum) steht über der Linie „Heute“,
 *    gestrichelt und mit dem Abstand („in 30 Tagen“).
 *  - Unter dem Titel steht die Art; ein Name nur bei Einträgen anderer (currentUserId).
 *  - Mehrere Einträge einer Art an einem Tag: der erste, darunter „+ N weitere …“ zum Aufklappen.
 *  - Ein Filter nach Art erscheint, sobald mehr als eine Art vorkommt.
 */

// Arten in der Reihenfolge des Filters, dazu CSS-Modifikator und Texte je Art
const ARTEN = ['recipe', 'menu', 'cookEvent'];
const ART_KLASSE = { recipe: 'rezept', menu: 'menue', cookEvent: 'gekocht' };
const TYP_TEXT = { recipe: 'typRezept', menu: 'typMenue', cookEvent: 'typGekocht' };
const FILTER_TEXT = { recipe: 'filterRezepte', menu: 'filterMenues', cookEvent: 'filterGekocht' };
const WEITERE_TEXT = { recipe: 'weitereRezepte', menu: 'weitereMenues', cookEvent: 'weitereGerichte' };
const ALLE = 'alle';
const UNBEKANNT = 'unbekannt';
const DATUM_VOLL = { day: '2-digit', month: 'long', year: 'numeric' };

/** Art eines Eintrags; ohne eigene Angabe die der Zeitleiste. */
function artVon(eintrag, standardArt) {
  const art = eintrag.itemType || standardArt;
  return ARTEN.includes(art) ? art : 'recipe';
}

/** Datum eines Eintrags (Firestore-Timestamp, Date, Zahl oder Text) oder null. */
function alsDatum(wert) {
  if (wert === null || wert === undefined || wert === '') return null;
  try {
    const datum = typeof wert.toDate === 'function' ? wert.toDate() : new Date(wert);
    return datum instanceof Date && !Number.isNaN(datum.getTime()) ? datum : null;
  } catch {
    return null;
  }
}

/** Kalendertag in Ortszeit als 'JJJJ-MM-TT', in derselben Zeitzone wie das angezeigte Datum. */
function tagesSchluessel(datum) {
  if (!datum) return UNBEKANNT;
  const zweistellig = (zahl) => String(zahl).padStart(2, '0');
  return `${datum.getFullYear()}-${zweistellig(datum.getMonth() + 1)}-${zweistellig(datum.getDate())}`;
}

/** Ganze Kalendertage von `heute` bis `datum`; Uhrzeit und Sommerzeit zählen nicht. */
function tageBis(datum, heute) {
  const tag = Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate());
  const start = Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return Math.round((tag - start) / 86400000);
}

/**
 * Zeilen der Zeitleiste: Monatsüberschriften, die Linie „Heute“ und die Tage. „Heute“ steht nur,
 * wenn etwas geplant ist, und zwar zwischen dem letzten geplanten und dem ersten übrigen Tag.
 */
function baueZeilen(tage, heuteSchluessel) {
  const zeilen = [];
  const heuteMonat = heuteSchluessel.slice(0, 7);
  const monatVon = (tag) => (tag.datum ? tag.schluessel.slice(0, 7) : UNBEKANNT);
  let letzterMonat = null;
  const monat = (schluessel, datum) => {
    if (schluessel === letzterMonat) return;
    zeilen.push({ art: 'monat', schluessel, datum });
    letzterMonat = schluessel;
  };
  let heuteOffen = tage.some((tag) => tag.geplant);
  tage.forEach((tag) => {
    if (heuteOffen && !tag.geplant) {
      // „Heute“ gehört unter die Überschrift seines Monats, wenn danach noch Tage dieses Monats folgen
      if (monatVon(tag) === heuteMonat) monat(heuteMonat, tag.datum);
      zeilen.push({ art: 'heute' });
      heuteOffen = false;
    }
    monat(monatVon(tag), tag.datum);
    zeilen.push({ art: 'tag', tag });
  });
  if (heuteOffen) zeilen.push({ art: 'heute' });
  return zeilen;
}

function RecipeTimeline({
  recipes,
  onSelectRecipe,
  allUsers = [],
  currentUserId = null,
  timelineBubbleIcon = null,
  timelineMenuBubbleIcon = null,
  timelineCookEventBubbleIcon = null,
  defaultImage = null,
  timelineCookEventDefaultImage = null,
  itemType = 'recipe',
}) {
  const [expandedDates, setExpandedDates] = useState({});
  const [filter, setFilter] = useState(ALLE);
  // Texte, Datum und Rezepttitel in der geltenden Sprache (Mehrsprachigkeit PR 6o)
  const { sprache } = useSprache();
  const t = useTexte(chefkochTexte);
  const zeigeTitel = useRezeptTitel();

  const heute = new Date();
  const heuteSchluessel = tagesSchluessel(heute);

  // Neueste zuerst; Einträge ohne gültiges Datum ans Ende
  const sortiert = useMemo(() => {
    const zeit = (eintrag) => alsDatum(eintrag.createdAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
    return [...recipes].sort((a, b) => {
      const za = zeit(a);
      const zb = zeit(b);
      if (za === zb) return 0;
      return zb > za ? 1 : -1;
    });
  }, [recipes]);

  const vorhandeneArten = useMemo(
    () => ARTEN.filter((art) => sortiert.some((eintrag) => artVon(eintrag, itemType) === art)),
    [sortiert, itemType],
  );
  // Ein Filter auf eine Art, die es nicht mehr gibt, zeigt wieder alles
  const aktiverFilter = vorhandeneArten.includes(filter) ? filter : ALLE;

  // Tage mit ihren Gruppen (eine je Art), in der Reihenfolge der Einträge
  const tage = useMemo(() => {
    const liste = [];
    const tagNach = new Map();
    sortiert.forEach((eintrag) => {
      const art = artVon(eintrag, itemType);
      if (aktiverFilter !== ALLE && art !== aktiverFilter) return;
      const datum = alsDatum(eintrag.createdAt);
      const schluessel = tagesSchluessel(datum);
      let tag = tagNach.get(schluessel);
      if (!tag) {
        tag = { schluessel, datum, geplant: Boolean(datum) && schluessel > heuteSchluessel, gruppen: [] };
        tagNach.set(schluessel, tag);
        liste.push(tag);
      }
      let gruppe = tag.gruppen.find((kandidat) => kandidat.art === art);
      if (!gruppe) {
        gruppe = { schluessel: `${schluessel}-${art}`, art, eintraege: [] };
        tag.gruppen.push(gruppe);
      }
      gruppe.eintraege.push(eintrag);
    });
    return liste;
  }, [sortiert, itemType, aktiverFilter, heuteSchluessel]);

  const zeilen = useMemo(() => baueZeilen(tage, heuteSchluessel), [tage, heuteSchluessel]);

  // Name nur bei Einträgen anderer: In „Mein Kochbuch“ stammt fast alles von einem selbst
  const getAuthorName = (authorId) => {
    if (!authorId || authorId === currentUserId) return null;
    return allUsers.find((u) => u.id === authorId)?.vorname || null;
  };

  const toggleExpand = (schluessel) => {
    setExpandedDates((prev) => ({ ...prev, [schluessel]: !prev[schluessel] }));
  };

  const getDisplayImage = (eintrag) => {
    const art = artVon(eintrag, itemType);
    if (art === 'menu') return eintrag.image || defaultImage;
    if (art === 'cookEvent') {
      return eintrag.originalRecipe?.image || timelineCookEventDefaultImage || defaultImage;
    }
    return eintrag.image || null;
  };

  // Zeichen vor der Art: das gepflegte Zeitleisten-Icon (Einstellungen › Bilder & Icons) in einem
  // kleinen Kreis der Farbe der Art, wie früher auf der Schiene; ohne Icon ein Punkt
  const icons = { recipe: timelineBubbleIcon, menu: timelineMenuBubbleIcon, cookEvent: timelineCookEventBubbleIcon };
  const renderTypZeichen = (art) => {
    const icon = icons[art];
    if (!icon) return <span className="timeline-typ__zeichen" aria-hidden="true" />;
    return (
      <span className="timeline-typ__zeichen timeline-typ__zeichen--icon" aria-hidden="true">
        {isBase64Image(icon) ? <img src={icon} alt="" className="timeline-typ__icon" /> : icon}
      </span>
    );
  };

  const renderCard = (eintrag, art, geplant) => {
    const bild = getDisplayImage(eintrag);
    const titel = zeigeTitel(eintrag);
    const zusaetze = [];
    if (geplant) zusaetze.push(formatiereAbstandInTagen(tageBis(alsDatum(eintrag.createdAt), heute), sprache));
    const autor = getAuthorName(eintrag.authorId);
    if (autor) zusaetze.push(autor);
    return (
      <div key={eintrag.id} className="timeline-card">
        {bild && (
          <div className="timeline-image">
            <img src={bild} alt={titel} />
          </div>
        )}
        <div className="timeline-info">
          {/* Der Titel ist der Knopf; sein ::after macht die ganze Karte klickbar (wie die Kacheln) */}
          <h5 className="timeline-title">
            <button type="button" className="timeline-card__knopf" onClick={() => onSelectRecipe(eintrag)}>
              <span className="timeline-title__text">{titel}</span>
            </button>
          </h5>
          <p className={`timeline-typ timeline-typ--${ART_KLASSE[art]}`}>
            {renderTypZeichen(art)}
            <span className="timeline-typ__text">{t(TYP_TEXT[art])}</span>
            {zusaetze.map((text) => (
              <span key={text} className="timeline-typ__zusatz">{text}</span>
            ))}
          </p>
        </div>
      </div>
    );
  };

  const renderGruppe = (gruppe, geplant) => {
    const offen = Boolean(expandedDates[gruppe.schluessel]);
    const weitere = gruppe.eintraege.length - 1;
    const sichtbar = weitere > 0 && !offen ? gruppe.eintraege.slice(0, 1) : gruppe.eintraege;
    const mitBild = Boolean(getDisplayImage(gruppe.eintraege[0]));
    const klassen = [
      'timeline-gruppe',
      `timeline-gruppe--${ART_KLASSE[gruppe.art]}`,
      mitBild && 'timeline-gruppe--mit-bild',
      offen && 'timeline-gruppe--offen',
    ].filter(Boolean).join(' ');
    return (
      <div key={gruppe.schluessel} className={klassen}>
        {sichtbar.map((eintrag) => renderCard(eintrag, gruppe.art, geplant))}
        {weitere > 0 && (
          <button
            type="button"
            className="timeline-mehr"
            aria-expanded={offen}
            onClick={() => toggleExpand(gruppe.schluessel)}
          >
            <span className="timeline-mehr__text">
              {offen ? t('wenigerAnzeigen') : t(WEITERE_TEXT[gruppe.art], { anzahl: weitere })}
            </span>
            <svg
              className="timeline-mehr__pfeil"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  const renderTag = (tag, index) => {
    // Kreis in der Farbe der Art; an Tagen mit mehreren Arten neutral
    const markerArt = tag.gruppen.length === 1 ? ART_KLASSE[tag.gruppen[0].art] : 'gemischt';
    const markerKlassen = [
      'timeline-marker',
      `timeline-marker--${markerArt}`,
      tag.geplant && 'timeline-marker--geplant',
    ].filter(Boolean).join(' ');
    return (
      <div
        key={tag.schluessel}
        className={`timeline-item${tag.geplant ? ' timeline-item--geplant' : ''}`}
        style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
      >
        {/* Sichtbar: Tag und Wochentag; vorgelesen wird das ganze Datum darunter */}
        <div className="timeline-datum" aria-hidden="true">
          <span className={markerKlassen}>{tag.datum ? formatiereZahl(tag.datum.getDate(), sprache) : null}</span>
          {tag.datum && (
            <span className="timeline-wochentag">{formatiereDatum(tag.datum, sprache, { weekday: 'short' })}</span>
          )}
        </div>
        <div className="timeline-content">
          {tag.datum && <p className="timeline-vorlesen">{formatiereDatum(tag.datum, sprache, DATUM_VOLL)}</p>}
          {tag.gruppen.map((gruppe) => renderGruppe(gruppe, tag.geplant))}
        </div>
      </div>
    );
  };

  const renderZeile = (zeile, index) => {
    if (zeile.art === 'monat') {
      return (
        <h4 key={`monat-${zeile.schluessel}`} className="timeline-monat">
          {zeile.datum ? formatiereDatum(zeile.datum, sprache, { month: 'long', year: 'numeric' }) : t('datumUnbekannt')}
        </h4>
      );
    }
    if (zeile.art === 'heute') {
      const datum = formatiereDatum(heute, sprache, { weekday: 'short', day: 'numeric', month: 'short' });
      return (
        <div key="heute" className="timeline-heute">
          <span className="timeline-heute__punkt" aria-hidden="true" />
          <span className="timeline-heute__text">{t('heuteAm', { datum })}</span>
          <span className="timeline-heute__linie" aria-hidden="true" />
        </div>
      );
    }
    return renderTag(zeile.tag, index);
  };

  return (
    <div className="recipe-timeline-container">
      {vorhandeneArten.length > 1 && (
        <div className="timeline-filter">
          <AuswahlGruppe
            aria-label={t('zeitleisteFiltern')}
            optionen={[
              { wert: ALLE, label: t('filterAlle') },
              ...vorhandeneArten.map((art) => ({ wert: art, label: t(FILTER_TEXT[art]) })),
            ]}
            wert={aktiverFilter}
            onWaehlen={setFilter}
          />
        </div>
      )}
      {sortiert.length > 0 ? (
        <div className="timeline-liste">{zeilen.map(renderZeile)}</div>
      ) : (
        <div className="timeline-empty">
          <p>{t(itemType === 'menu' ? 'zeitleisteKeineMenues' : 'zeitleisteKeineRezepte')}</p>
        </div>
      )}
    </div>
  );
}

export default RecipeTimeline;
