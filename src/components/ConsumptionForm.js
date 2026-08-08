import React, { useState, useEffect, useRef } from 'react';
import './EventsPage.css';
import {
  submitConsumption,
  lockEinkaufMengen,
  unlockEinkaufMengen,
  lockVerbrauchMengen,
  unlockVerbrauchMengen,
  setEventStatus,
} from '../utils/eventsFirestore';
import { CATEGORY_LABELS } from './EventForm';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import { calculateCascadingEinkauf } from '../utils/einkaufCascade';
import { formatQuantityFraction, parseFractionQuantity } from '../utils/fractionFormat';
import { useLongPress } from '../utils/useLongPress';
import { useGroupLock } from '../hooks/useGroupLock';
import { decodeRecipeLink } from '../utils/recipeLinks';
import { scaleIngredient, combineIngredients, isWaterIngredient, convertIngredientUnits } from '../utils/ingredientUtils';
import { getCustomLists, getButtonIcons, getEffectiveIcon, getDarkModePreference, addMissingConversionEntries } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import ShoppingListModal from './ShoppingListModal';
import LockToggleButton from './LockToggleButton';
import LockIcon from './icons/LockIcon';
import UnlockIcon from './icons/UnlockIcon';
import ShoppingCartIcon from './icons/ShoppingCartIcon';
import CupIcon from './icons/CupIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';

function getEinheitSizeLabel(einheitsgroesse) {
  const liters = Number(einheitsgroesse);
  if (liters < 1) {
    return `${Math.round(liters * 1000)} ml`;
  }
  return `${liters.toFixed(1).replace('.', ',')} l`;
}

function getRowDrinkName(row, recipes) {
  if ((row.isCustomDrink || row.isPredefinedDrink) && row.drinkLabel) return resolveDrinkDisplay(row.drinkLabel, recipes).displayName;
  return CATEGORY_LABELS[row.kategorie] || row.kategorie;
}

// Gebindeeinheit wenn vorhanden, sonst die Einheit -- fuer die Einkaufsliste.
function getRowPurchaseUnit(row) {
  if (row.isCustomDrink && Array.isArray(row.einheiten) && row.einheitIdx !== undefined) {
    const einheit = row.einheiten[row.einheitIdx];
    if (einheit) return einheit.gebindeinheit || einheit.einheit || '';
  }
  return row.gebinde || '';
}

// Einzel-Einheit (z.B. Flasche) fuer den Verbrauch -- im Unterschied zur
// Gebindeeinheit (z.B. Kasten) beim Einkauf.
function getRowConsumptionUnit(row) {
  if (row.isCustomDrink && Array.isArray(row.einheiten) && row.einheitIdx !== undefined) {
    const einheit = row.einheiten[row.einheitIdx];
    if (einheit) return einheit.einheit || einheit.gebindeinheit || '';
  }
  return row.gebinde || '';
}

function getRowUnitSubtitle(row, unitLabelOverride) {
  if (row.isCustomDrink && Array.isArray(row.einheiten) && row.einheitIdx !== undefined) {
    const einheit = row.einheiten[row.einheitIdx];
    if (einheit) {
      const sizeLabel = getEinheitSizeLabel(einheit.einheitsgroesse);
      const unitLabel = unitLabelOverride !== undefined ? unitLabelOverride : (einheit.gebindeinheit || einheit.einheit);
      return unitLabel ? `${sizeLabel} · ${unitLabel}` : sizeLabel;
    }
  }
  if (row.gebindeGroesseLiter) {
    const sizeLabel = getEinheitSizeLabel(row.gebindeGroesseLiter);
    return row.gebinde ? `${sizeLabel} · ${row.gebinde}` : sizeLabel;
  }
  return null;
}

function groupKategorienByDrink(kategorien, recipes) {
  const groups = [];
  const groupsByKey = new Map();
  kategorien.forEach((row) => {
    const key = row.drinkId || row.kategorie;
    let group = groupsByKey.get(key);
    if (!group) {
      group = { key, drinkName: getRowDrinkName(row, recipes), rows: [] };
      groupsByKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  });
  return groups;
}

// Baut die Kaskaden-Einheiten (eigene Groesse + optionale Gebindegroesse) fuer eine Getraenke-Gruppe.
function getGroupCascadeUnits(group) {
  return group.rows.map((row) => {
    if (row.isCustomDrink && Array.isArray(row.einheiten) && row.einheitIdx !== undefined) {
      const einheit = row.einheiten[row.einheitIdx] || {};
      const einheitsgroesseLiter = Number(einheit.einheitsgroesse);
      const stueckProGebinde = Number(einheit.einheitenProGebinde);
      const gebindeGroesseLiter =
        Number.isFinite(einheitsgroesseLiter) && Number.isFinite(stueckProGebinde) && stueckProGebinde > 0
          ? einheitsgroesseLiter * stueckProGebinde
          : null;
      return { key: row.kategorie, einheitsgroesseLiter, gebindeGroesseLiter };
    }
    return { key: row.kategorie, einheitsgroesseLiter: Number(row.gebindeGroesseLiter), gebindeGroesseLiter: null };
  });
}

// Ermittelt den kalkulierten Liter-Bedarf einer Getraenke-Gruppe (identisch fuer alle Zeilen der Gruppe).
function getGroupBedarfLiter(group) {
  const row = group.rows[0];
  const liter = Number(row?.literMitPuffer ?? row?.literOhnePuffer);
  return Number.isFinite(liter) ? liter : 0;
}

// Berechnet die kaskadierende Vorbefuellung fuer alle Getraenke-Gruppen.
function getCascadePrefill(drinkGroups) {
  const prefillMap = {};
  const warnings = [];
  drinkGroups.forEach((group) => {
    const units = getGroupCascadeUnits(group);
    const bedarfLiter = getGroupBedarfLiter(group);
    const { values: cascadeValues, warnings: groupWarnings } = calculateCascadingEinkauf(units, bedarfLiter);
    Object.assign(prefillMap, cascadeValues);
    groupWarnings.forEach((warning) => warnings.push(`${group.drinkName}: ${warning}`));
  });
  return { prefillMap, warnings };
}

// Rechnet die "Eingekauft"-Mengen einer Getraenke-Gruppe ueber alle Einheiten
// (Fass, Kasten, Flasche, ...) in Liter um und summiert sie, damit eine
// Unterdeckung nicht pro Einheit isoliert, sondern fuer das ganze Getraenk
// geprueft werden kann (Fass ok + Flasche ok kann in Summe trotzdem zu wenig sein).
function getGroupEingekauftLiter(group, values) {
  const units = getGroupCascadeUnits(group);
  let totalLiter = 0;
  let anyFilled = false;
  units.forEach((unit) => {
    const qty = parseFractionQuantity(values[unit.key]?.eingekauft);
    if (!Number.isFinite(qty) || qty <= 0) return;
    anyFilled = true;
    const perUnitLiter = Number.isFinite(unit.gebindeGroesseLiter) && unit.gebindeGroesseLiter > 0
      ? unit.gebindeGroesseLiter
      : unit.einheitsgroesseLiter;
    if (Number.isFinite(perUnitLiter) && perUnitLiter > 0) {
      totalLiter += qty * perUnitLiter;
    }
  });
  return { totalLiter, anyFilled };
}

// Zeilen-Status einer Getraenke-Gruppe (nur visuell, wird nirgends gespeichert):
// 'offen' (nichts befuellt), 'unentschieden' (befuellt, aber ungesperrt),
// 'unterdeckung'/'ausreichend' (gesperrt, Vergleich Summe vs. Kalkuliert) oder
// 'neutral' (gesperrt, aber kein kalkulierter Bedarf vorhanden -- kein Vergleich moeglich).
function getGroupRowStatus(group, values, einkaufLocked) {
  const { totalLiter, anyFilled } = getGroupEingekauftLiter(group, values);
  if (!anyFilled) return 'offen';
  if (!einkaufLocked) return 'unentschieden';
  const bedarfLiter = getGroupBedarfLiter(group);
  if (!(bedarfLiter > 0)) return 'neutral';
  return totalLiter < bedarfLiter ? 'unterdeckung' : 'ausreichend';
}

// Liegt das Eventdatum in der Vergangenheit (fuer den "Verbrauch fehlt"-Hinweis)?
function isEventPast(dateStr) {
  if (!dateStr) return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  return dateStr < todayStr;
}

function formatLiterShort(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

// Kompakte Zusammenfassung der eingetragenen "Eingekauft"-Mengen fuer den Einkauf-Button, z.B. "1× Fass, 1× Flasche".
function getGroupEinkaufSummary(group, values) {
  const parts = [];
  group.rows.forEach((row) => {
    const qty = (values[row.kategorie]?.eingekauft || '').trim();
    if (!qty || !parseFractionQuantity(qty)) return;
    const unit = getRowPurchaseUnit(row);
    parts.push(unit ? `${qty}× ${unit}` : qty);
  });
  return parts.join(', ');
}

// Berechnet den tatsaechlichen Verbrauch einer Getraenke-Gruppe in Litern als
// Einkauf minus Uebrig -- analog zur Backend-Berechnung in submitConsumption
// (gebindeZuLiter), damit die Anzeige immer der spaeter gespeicherten Menge entspricht.
function getGroupVerbrauchLiter(group, values) {
  const units = getGroupCascadeUnits(group);
  let totalLiter = 0;
  units.forEach((unit) => {
    const eingekauft = parseFractionQuantity(values[unit.key]?.eingekauft) || 0;
    const uebrigEinheiten = Number(values[unit.key]?.uebrig) || 0;
    const hatGebinde = Number.isFinite(unit.einheitsgroesseLiter) && unit.einheitsgroesseLiter > 0
      && Number.isFinite(unit.gebindeGroesseLiter) && unit.gebindeGroesseLiter > 0;
    const uebrigGebinde = hatGebinde
      ? (uebrigEinheiten * unit.einheitsgroesseLiter) / unit.gebindeGroesseLiter
      : uebrigEinheiten;
    const verbrauchtGebinde = Math.max(eingekauft - uebrigGebinde, 0);
    const perUnitLiter = Number.isFinite(unit.gebindeGroesseLiter) && unit.gebindeGroesseLiter > 0
      ? unit.gebindeGroesseLiter
      : unit.einheitsgroesseLiter;
    if (Number.isFinite(perUnitLiter) && perUnitLiter > 0) {
      totalLiter += verbrauchtGebinde * perUnitLiter;
    }
  });
  return totalLiter;
}

// Zusammenfassung fuer den Verbrauch-Button: zeigt immer den berechneten
// Verbrauch (Einkauf minus Uebrig) der Gruppe in Litern.
function getGroupVerbrauchSummary(group, values) {
  const verbrauchLiter = getGroupVerbrauchLiter(group, values);
  return verbrauchLiter > 0 ? `${formatLiterShort(verbrauchLiter)} l` : '–';
}

// Ermittelt den Sperr-Zustand einer Getraenke-Gruppe aus den getrennten
// Einkauf-/Verbrauch-Flags fuer das Lock-Icon neben der Produktueberschrift.
// "Verbrauch gesperrt" ohne "Einkauf gesperrt" ist im normalen Ablauf nicht vorgesehen
// und wird wie "voll gesperrt" behandelt.
function getLockIconState(einkaufGesperrt, verbrauchGesperrt) {
  if (verbrauchGesperrt) return 'fullyLocked';
  if (einkaufGesperrt) return 'purchaseLocked';
  return 'open';
}

const LOCK_ICON_CONFIG = {
  open: { title: 'Offen', color: '#999', filled: false, Icon: UnlockIcon },
  purchaseLocked: { title: 'Einkauf gesperrt', color: '#c9a227', filled: false, Icon: LockIcon },
  fullyLocked: { title: 'Einkauf & Verbrauch gesperrt', color: '#2F5D50', filled: true, Icon: LockIcon },
};

// Zeigt den Sperr-Zustand einer Getraenke-Gruppe rein ueber das Lock-Icon an
// (keine Toggle-Funktion, nur Anzeige -- die eigentlichen Sperren-Buttons sitzen
// im aufgeklappten Detailbereich). Der Zustand wird ausschliesslich ueber
// outline/filled vermittelt, kein Text-Badge.
function LockStateIcon({ state }) {
  const { title, color, filled, Icon } = LOCK_ICON_CONFIG[state];
  return (
    <span className={`events-lock-state-icon events-lock-state-${state}`} title={title} aria-label={title}>
      <Icon size={16} color={color} filled={filled} />
    </span>
  );
}

function ConsumptionForm({ event, recipes, onDone, onCancel, currentUser }) {
  const kategorien = (event.berechnung?.ergebnis || []).filter((row) => (row.isCustomDrink || row.isPredefinedDrink) && row.gebindeGroesseLiter);
  const drinkGroups = groupKategorienByDrink(kategorien, recipes);
  const { prefillMap, warnings: prefillWarnings } = getCascadePrefill(drinkGroups);
  const [values, setValues] = useState(() => {
    const initial = {};
    kategorien.forEach((row) => {
      const lockedEinkauf = event.einkaufGesperrt?.[row.kategorie];
      const lockedVerbrauch = event.verbrauchGesperrt?.[row.kategorie];
      let eingekauft;
      if (lockedEinkauf !== undefined) {
        eingekauft = lockedEinkauf;
      } else {
        const prefillValue = prefillMap[row.kategorie];
        eingekauft = prefillValue !== undefined && prefillValue !== null ? formatQuantityFraction(prefillValue) : '';
      }
      initial[row.kategorie] = {
        eingekauft,
        uebrig: lockedVerbrauch !== undefined ? lockedVerbrauch : '',
      };
    });
    return initial;
  });
  const einkaufLock = useGroupLock({
    initialLocked: event.einkaufGesperrt,
    currentUser,
    eventId: event.id,
    lockFn: lockEinkaufMengen,
    unlockFn: unlockEinkaufMengen,
  });
  const verbrauchLock = useGroupLock({
    initialLocked: event.verbrauchGesperrt,
    currentUser,
    eventId: event.id,
    lockFn: lockVerbrauchMengen,
    unlockFn: unlockVerbrauchMengen,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [changes, setChanges] = useState(null);
  const [conversionTable, setConversionTable] = useState([]);
  const [bringButtonIcon, setBringButtonIcon] = useState('Bring');
  const [shoppingListIcon, setShoppingListIcon] = useState('Einkauf');
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [showPortionSelector, setShowPortionSelector] = useState(false);
  const [linkedPortionCounts, setLinkedPortionCounts] = useState({});
  const [expandedSection, setExpandedSection] = useState({});
  const missingSavedRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);
  const {
    activeId: portionMinusLongPressActiveId,
    triggeredRef: portionMinusLongPressTriggeredRef,
    start: handlePortionMinusPressStart,
    end: handlePortionMinusPressEnd,
  } = useLongPress();

  useEffect(() => {
    const loadShoppingListSettings = async () => {
      const [icons, lists] = await Promise.all([getButtonIcons(), getCustomLists()]);
      setConversionTable(lists.conversionTable || []);
      setBringButtonIcon(getEffectiveIcon(icons, 'bringButton', getDarkModePreference()) || 'Bring');
      setShoppingListIcon(getEffectiveIcon(icons, 'shoppingList', getDarkModePreference()) || 'Einkauf');
    };
    loadShoppingListSettings();
  }, []);

  // Getraenke-Gruppen aufteilen: mit Rezeptlink (linkedRecipes) vs. ohne (nonRecipeGroups).
  const linkedRecipes = [];
  const linkedRecipeEingekauft = {};
  const nonRecipeGroups = [];
  {
    const seenIds = new Set();
    drinkGroups.forEach((group) => {
      const display = resolveDrinkDisplay(group.rows[0]?.drinkLabel, recipes);
      if (display.isRecipe && display.recipe) {
        if (!seenIds.has(display.recipe.id)) {
          seenIds.add(display.recipe.id);
          linkedRecipes.push(display.recipe);
          const eingekauft = parseFractionQuantity(values[group.rows[0]?.kategorie]?.eingekauft);
          if (Number.isFinite(eingekauft) && eingekauft > 0) {
            linkedRecipeEingekauft[display.recipe.id] = Math.round(eingekauft);
          }
        }
      } else {
        nonRecipeGroups.push(group);
      }
    });
  }

  // Getraenke ohne Rezeptlink: in Gebindeeinheit (falls vorhanden, sonst Einheit) uebernehmen.
  const getOtherDrinkItems = () => {
    const items = [];
    nonRecipeGroups.forEach((group) => {
      group.rows.forEach((row) => {
        const quantityText = (values[row.kategorie]?.eingekauft || '').trim();
        if (!quantityText || !parseFractionQuantity(quantityText)) return;
        const unit = getRowPurchaseUnit(row);
        items.push(unit ? `${quantityText} ${unit} ${group.drinkName}` : `${quantityText} ${group.drinkName}`);
      });
    });
    return items;
  };

  const getShoppingListIngredients = () => {
    const ingredients = [];
    linkedRecipes.forEach((linkedRecipe) => {
      const targetPortions = linkedPortionCounts[linkedRecipe.id] ?? (linkedRecipe.portionen || 4);
      if (targetPortions === 0) return;
      const multiplier = targetPortions / (linkedRecipe.portionen || 4);
      (linkedRecipe.ingredients || []).forEach((ing) => {
        const item = typeof ing === 'string' ? { type: 'ingredient', text: ing } : ing;
        if (item.type === 'heading') return;
        if (item.includedInCalculation === false) return; // nur auf der Getränk-bearbeiten-Karte aktivierte Zutaten
        const text = typeof ing === 'string' ? ing : ing.text;
        if (decodeRecipeLink(text)) return; // skip nested links
        if (isWaterIngredient(text)) return; // skip water
        ingredients.push(multiplier !== 1 ? scaleIngredient(text, multiplier) : text);
      });
    });
    const { converted, missing } = convertIngredientUnits(ingredients, conversionTable);
    if (missing.length > 0 && !missingSavedRef.current) {
      missingSavedRef.current = true;
      addMissingConversionEntries(missing, conversionTable).catch(console.error);
    }
    return [...combineIngredients(converted), ...getOtherDrinkItems()];
  };

  const handleShoppingListClick = () => {
    if (linkedRecipes.length > 0) {
      setLinkedPortionCounts({ ...linkedRecipeEingekauft });
      setShowPortionSelector(true);
    } else {
      missingSavedRef.current = false;
      setShowShoppingListModal(true);
    }
  };

  const toggleSection = (groupKey, section) => {
    setExpandedSection((prev) => ({
      ...prev,
      [groupKey]: prev[groupKey] === section ? null : section,
    }));
  };

  const updateValue = (kategorie, field, value) => {
    setValues((prev) => ({
      ...prev,
      [kategorie]: { ...prev[kategorie], [field]: value },
    }));
  };

  const allGroupsLockedIn = (lockedSet) =>
    drinkGroups.length > 0 && drinkGroups.every((group) => group.rows.every((row) => lockedSet.has(row.kategorie)));

  const handleToggleEinkaufLock = (group) => {
    const nextLocked = einkaufLock.toggleGroupLock(group, (keys) => {
      const werteByKategorie = {};
      keys.forEach((kategorie) => {
        werteByKategorie[kategorie] = values[kategorie]?.eingekauft || '';
      });
      return werteByKategorie;
    });
    if (!currentUser?.id) return;
    const allLocked = allGroupsLockedIn(nextLocked);
    if (allLocked && event.status === 'berechnet') {
      setEventStatus(currentUser.id, event.id, 'eingekauft').catch((err) => {
        console.error('Error setting event status to eingekauft:', err);
      });
    } else if (!allLocked && event.status === 'eingekauft') {
      setEventStatus(currentUser.id, event.id, 'berechnet').catch((err) => {
        console.error('Error resetting event status to berechnet:', err);
      });
    }
  };

  // "Übrig" wird vom Nutzer in Einheiten (z.B. Flaschen) erfasst, aber
  // gegenueber dem Backend weiterhin als Bruchteil der Gebindeeinheit
  // (z.B. Kasten) angegeben -- passend zu "Eingekauft" und zur bestehenden
  // Verbrauchsberechnung. Rueckumrechnung ueber dasselbe Groessenverhaeltnis
  // wie bei der Einkaufs-Kaskade.
  const buildGebindePayload = () => {
    const cascadeUnitsByKey = {};
    drinkGroups.forEach((group) => {
      getGroupCascadeUnits(group).forEach((unit) => {
        cascadeUnitsByKey[unit.key] = unit;
      });
    });
    const gebinde = {};
    Object.entries(values).forEach(([kategorie, { eingekauft, uebrig }]) => {
      const uebrigEinheiten = Number(uebrig) || 0;
      const unit = cascadeUnitsByKey[kategorie];
      const hatGebinde = unit
        && Number.isFinite(unit.einheitsgroesseLiter) && unit.einheitsgroesseLiter > 0
        && Number.isFinite(unit.gebindeGroesseLiter) && unit.gebindeGroesseLiter > 0;
      const uebrigGebinde = hatGebinde
        ? (uebrigEinheiten * unit.einheitsgroesseLiter) / unit.gebindeGroesseLiter
        : uebrigEinheiten;
      gebinde[kategorie] = {
        eingekauft: parseFractionQuantity(eingekauft) || 0,
        uebrig: uebrigGebinde,
      };
    });
    return gebinde;
  };

  const runSubmitConsumption = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await submitConsumption(event.id, buildGebindePayload());
      setChanges(result.changes || []);
    } catch (err) {
      console.error('Error submitting consumption:', err);
      setError('Der Verbrauch konnte nicht gespeichert werden. Bitte versuche es erneut.');
      autoSubmitTriggeredRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVerbrauchLock = (group) => {
    const wasVerbrauchLocked = verbrauchLock.isGroupLocked(group);
    const nextLocked = verbrauchLock.toggleGroupLock(group, (keys) => {
      const werteByKategorie = {};
      keys.forEach((kategorie) => {
        werteByKategorie[kategorie] = values[kategorie]?.uebrig ?? '';
      });
      return werteByKategorie;
    });
    // Wird "Übrig" gesperrt, soll automatisch auch die zugehoerige
    // "Eingekauft"-Menge mitgesperrt werden (nicht umgekehrt beim Entsperren).
    if (!wasVerbrauchLocked && !einkaufLock.isGroupLocked(group)) {
      handleToggleEinkaufLock(group);
    }
    const allLocked = allGroupsLockedIn(nextLocked);
    if (allLocked && event.status !== 'verbrauchErfasst' && !autoSubmitTriggeredRef.current) {
      autoSubmitTriggeredRef.current = true;
      runSubmitConsumption();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runSubmitConsumption();
  };

  if (changes) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>Verbrauch gespeichert</h2>
        </div>
        <div className="events-result-card">
          <p className="events-info-text">
            Danke! Die Kalkulation wird für zukünftige Events genauer.
          </p>
          {changes.length === 0 ? (
            <p className="events-empty-hint">Keine Rate konnte angepasst werden.</p>
          ) : (
            <ul className="events-changes-list">
              {changes.map((change) => (
                <li key={change.kategorie}>
                  <strong>{CATEGORY_LABELS[change.kategorie] || change.kategorie}</strong>
                  {'-Rate angepasst: '}
                  {change.alteRateProErwStunde} → {change.neueRateProErwStunde} L/Person/Std.
                  {' '}(Event Nr. {change.anzahlEventsGesamt})
                </li>
              ))}
            </ul>
          )}
          <div className="events-form-actions">
            <button type="button" className="events-primary-btn" onClick={() => onDone(event.id)}>
              Fertig
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Einkauf & Verbrauch</h2>
        <button
          className="events-close-btn"
          onClick={onCancel}
          aria-label="Abbrechen"
          title="Abbrechen"
        >
          ×
        </button>
      </div>
      {prefillWarnings.length > 0 && (
        <div className="events-warnings">
          {prefillWarnings.map((warning, idx) => (
            <p key={idx} className="events-warning-text">{warning}</p>
          ))}
        </div>
      )}
      <form className="events-form" onSubmit={handleSubmit}>
        {drinkGroups.map((group) => {
          const einkaufGroupLocked = einkaufLock.isGroupLocked(group);
          const verbrauchGroupLocked = verbrauchLock.isGroupLocked(group);
          const rowStatus = event.status === 'geplant'
            ? null
            : getGroupRowStatus(group, values, einkaufGroupLocked);
          const { totalLiter } = getGroupEingekauftLiter(group, values);
          const bedarfLiter = getGroupBedarfLiter(group);
          const verbrauchFehlt = isEventPast(event.date) && !verbrauchGroupLocked;
          const lockState = getLockIconState(einkaufGroupLocked, verbrauchGroupLocked);
          const einkaufSummary = getGroupEinkaufSummary(group, values);
          const verbrauchSummary = getGroupVerbrauchSummary(group, values);
          const activeSection = expandedSection[group.key] || null;
          return (
            <div className="events-consumption-group" key={group.key}>
              <div className="events-consumption-card-header">
                <div className="events-consumption-title-group">
                  <h3 className="events-consumption-drink-name">{group.drinkName}</h3>
                  <LockStateIcon state={lockState} />
                  {verbrauchFehlt && (
                    <span className="events-consumption-missing-usage" title="Verbrauch fehlt" aria-label="Verbrauch fehlt">
                      ⚠️
                    </span>
                  )}
                </div>
              </div>
              {rowStatus === 'unterdeckung' && (
                <p className="events-warning-text events-consumption-underdeckung-warning">
                  Unterdeckung: {formatLiterShort(totalLiter)} l eingekauft, aber {formatLiterShort(bedarfLiter)} l kalkuliert.
                </p>
              )}

              <div className="events-consumption-button-grid">
                <button
                  type="button"
                  className={`events-consumption-toggle-btn${einkaufGroupLocked ? ' is-locked' : ''}${activeSection === 'einkauf' ? ' is-expanded' : ''}`}
                  onClick={() => toggleSection(group.key, 'einkauf')}
                  aria-expanded={activeSection === 'einkauf'}
                  aria-label="Einkauf bearbeiten"
                  title="Einkauf bearbeiten"
                >
                  <ShoppingCartIcon size={16} />
                  <span className="events-consumption-toggle-text">
                    <span className="events-consumption-toggle-label">Einkauf</span>
                    <span className="events-consumption-toggle-value">{einkaufSummary || '–'}</span>
                  </span>
                  <ChevronRightIcon size={14} />
                </button>
                <button
                  type="button"
                  className={`events-consumption-toggle-btn${verbrauchGroupLocked ? ' is-locked' : ''}${activeSection === 'verbrauch' ? ' is-expanded' : ''}`}
                  onClick={() => toggleSection(group.key, 'verbrauch')}
                  aria-expanded={activeSection === 'verbrauch'}
                  aria-label="Verbrauch bearbeiten"
                  title="Verbrauch bearbeiten"
                >
                  <CupIcon size={16} />
                  <span className="events-consumption-toggle-text">
                    <span className="events-consumption-toggle-label">Verbrauch</span>
                    <span className="events-consumption-toggle-value">{verbrauchSummary}</span>
                  </span>
                  <ChevronRightIcon size={14} />
                </button>
              </div>

              {activeSection === 'einkauf' && (
                <div className="events-consumption-detail">
                  {group.rows.map((row) => (
                    <div className="events-form-row" key={row.kategorie}>
                      {getRowUnitSubtitle(row) && (
                        <span className="events-consumption-unit-subtitle">{getRowUnitSubtitle(row)}</span>
                      )}
                      <label className="events-form-field">
                        <span>Eingekauft</span>
                        <input
                          type="text"
                          inputMode="text"
                          placeholder="z.B. 1 3/4"
                          title="Menge als Bruch (z.B. 1/2 oder 1 3/4) oder Zahl"
                          value={values[row.kategorie].eingekauft}
                          onChange={(e) => updateValue(row.kategorie, 'eingekauft', e.target.value)}
                          disabled={einkaufGroupLocked}
                        />
                      </label>
                    </div>
                  ))}
                  <div className="events-consumption-detail-footer">
                    <LockToggleButton
                      locked={einkaufGroupLocked}
                      onToggle={() => handleToggleEinkaufLock(group)}
                      lockedLabel="Eingekaufte Menge entsperren"
                      unlockedLabel="Eingekaufte Menge sperren"
                      lockedTitle="Eingekaufte Menge entsperren (wird beim Öffnen wieder neu berechnet)"
                      unlockedTitle="Eingekaufte Menge sperren (keine automatische Neuberechnung mehr)"
                    />
                  </div>
                </div>
              )}

              {activeSection === 'verbrauch' && (
                <div className="events-consumption-detail">
                  {group.rows.map((row) => (
                    <div className="events-form-row" key={row.kategorie}>
                      {getRowUnitSubtitle(row, getRowConsumptionUnit(row)) && (
                        <span className="events-consumption-unit-subtitle">{getRowUnitSubtitle(row, getRowConsumptionUnit(row))}</span>
                      )}
                      <label className="events-form-field">
                        <span>{getRowConsumptionUnit(row) ? `Übrig (${getRowConsumptionUnit(row)})` : 'Übrig'}</span>
                        <input
                          type="number"
                          min="0"
                          value={values[row.kategorie].uebrig}
                          onChange={(e) => updateValue(row.kategorie, 'uebrig', e.target.value)}
                          disabled={verbrauchGroupLocked}
                        />
                      </label>
                    </div>
                  ))}
                  <div className="events-consumption-detail-footer">
                    <LockToggleButton
                      locked={verbrauchGroupLocked}
                      onToggle={() => handleToggleVerbrauchLock(group)}
                      lockedLabel="Verbrauchte Menge entsperren"
                      unlockedLabel="Verbrauchte Menge sperren"
                      lockedTitle="Verbrauchte Menge entsperren (kann wieder bearbeitet werden)"
                      unlockedTitle="Verbrauchte Menge sperren (keine automatische Änderung mehr)"
                      disabled={saving}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {error && <p className="events-error-text">{error}</p>}

        <div className="events-form-actions">
          <button
            type="button"
            className="events-secondary-btn events-shopping-list-btn"
            onClick={handleShoppingListClick}
            aria-label="Einkaufsliste erstellen"
            title="Einkaufsliste erstellen"
          >
            {isBase64Image(shoppingListIcon) ? (
              <img src={shoppingListIcon} alt="" className="button-icon-image" draggable="false" />
            ) : (
              <span className="events-shopping-list-btn-icon">{shoppingListIcon}</span>
            )}
          </button>
        </div>

        <div className="events-form-actions">
          <button type="button" className="events-secondary-btn" onClick={onCancel} disabled={saving}>
            Abbrechen
          </button>
          <button type="submit" className="events-primary-btn" disabled={saving}>
            {saving ? 'Speichere...' : 'Verbrauch speichern'}
          </button>
        </div>
      </form>
      {showShoppingListModal && (
        <ShoppingListModal
          items={getShoppingListIngredients()}
          title={event.eventName}
          onClose={() => setShowShoppingListModal(false)}
          shareId={event.id}
          bringButtonIcon={bringButtonIcon}
          accentTheme="event"
        />
      )}
      {showPortionSelector && linkedRecipes.length > 0 && (
        <div className="portion-selector-overlay events-portion-selector-overlay" onClick={() => setShowPortionSelector(false)}>
          <div
            className="portion-selector-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Portionen auswählen"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="portion-selector-header">
              <h2 className="portion-selector-title">Portionen für Einkaufsliste</h2>
              <button
                className="portion-selector-close"
                onClick={() => setShowPortionSelector(false)}
                aria-label="Portionsauswahl schließen"
              >
                ×
              </button>
            </div>
            <div className="portion-selector-body">
              <div className="portion-selector-section-label">Verlinkte Rezepte</div>
              {linkedRecipes.map(linkedRecipe => {
                const current = linkedPortionCounts[linkedRecipe.id] ?? (linkedRecipe.portionen || 4);
                return (
                  <div key={linkedRecipe.id} className="portion-selector-item">
                    <span className="portion-selector-recipe-name">{linkedRecipe.title}</span>
                    <div className="portion-selector-controls">
                      <button
                        className={`portion-selector-btn${portionMinusLongPressActiveId === linkedRecipe.id ? ' longpress-active' : ''}`}
                        onClick={() => {
                          if (portionMinusLongPressTriggeredRef.current) {
                            portionMinusLongPressTriggeredRef.current = false;
                            return;
                          }
                          setLinkedPortionCounts(prev => ({
                            ...prev,
                            [linkedRecipe.id]: Math.max(0, current - 1)
                          }));
                        }}
                        onMouseDown={() => handlePortionMinusPressStart(linkedRecipe.id, () => setLinkedPortionCounts(prev => ({ ...prev, [linkedRecipe.id]: 0 })))}
                        onMouseUp={handlePortionMinusPressEnd}
                        onMouseLeave={handlePortionMinusPressEnd}
                        onTouchStart={() => handlePortionMinusPressStart(linkedRecipe.id, () => setLinkedPortionCounts(prev => ({ ...prev, [linkedRecipe.id]: 0 })))}
                        onTouchEnd={handlePortionMinusPressEnd}
                        onTouchCancel={handlePortionMinusPressEnd}
                        aria-label="Portionen verringern"
                        disabled={current === 0}
                      >
                        −
                      </button>
                      <span className="portion-selector-count">{current}</span>
                      <button
                        className="portion-selector-btn"
                        onClick={() => setLinkedPortionCounts(prev => ({
                          ...prev,
                          [linkedRecipe.id]: current + 1
                        }))}
                        aria-label="Portionen erhöhen"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="portion-selector-footer">
              <button
                className="portion-selector-generate-btn"
                onClick={() => {
                  setShowPortionSelector(false);
                  missingSavedRef.current = false;
                  setShowShoppingListModal(true);
                }}
              >
                Einkaufsliste erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConsumptionForm;
