import React, { useState, useEffect, useRef } from 'react';
import './EventsPage.css';
import { submitConsumption } from '../utils/eventsFirestore';
import { CATEGORY_LABELS } from './EventForm';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import { calculateCascadingEinkauf } from '../utils/einkaufCascade';
import { formatQuantityFraction, parseFractionQuantity } from '../utils/fractionFormat';
import { useLongPress } from '../utils/useLongPress';
import { decodeRecipeLink } from '../utils/recipeLinks';
import { scaleIngredient, combineIngredients, isWaterIngredient, convertIngredientUnits } from '../utils/ingredientUtils';
import { getCustomLists, getButtonIcons, getEffectiveIcon, getDarkModePreference, addMissingConversionEntries } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import ShoppingListModal from './ShoppingListModal';

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

function getRowUnitSubtitle(row) {
  if (row.isCustomDrink && Array.isArray(row.einheiten) && row.einheitIdx !== undefined) {
    const einheit = row.einheiten[row.einheitIdx];
    if (einheit) {
      const sizeLabel = getEinheitSizeLabel(einheit.einheitsgroesse);
      const unitLabel = einheit.gebindeinheit || einheit.einheit;
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

function ConsumptionForm({ event, recipes, onDone, onCancel }) {
  const kategorien = (event.berechnung?.ergebnis || []).filter((row) => (row.isCustomDrink || row.isPredefinedDrink) && row.gebindeGroesseLiter);
  const drinkGroups = groupKategorienByDrink(kategorien, recipes);
  const { prefillMap, warnings: prefillWarnings } = getCascadePrefill(drinkGroups);
  const [values, setValues] = useState(() => {
    const initial = {};
    kategorien.forEach((row) => {
      const prefillValue = prefillMap[row.kategorie];
      initial[row.kategorie] = {
        eingekauft: prefillValue !== undefined && prefillValue !== null ? formatQuantityFraction(prefillValue) : '',
        uebrig: '',
      };
    });
    return initial;
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
  const missingSavedRef = useRef(false);
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

  const updateValue = (kategorie, field, value) => {
    setValues((prev) => ({
      ...prev,
      [kategorie]: { ...prev[kategorie], [field]: value },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const gebinde = {};
      Object.entries(values).forEach(([kategorie, { eingekauft, uebrig }]) => {
        gebinde[kategorie] = {
          eingekauft: parseFractionQuantity(eingekauft) || 0,
          uebrig: Number(uebrig) || 0,
        };
      });
      const result = await submitConsumption(event.id, gebinde);
      setChanges(result.changes || []);
    } catch (err) {
      console.error('Error submitting consumption:', err);
      setError('Der Verbrauch konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
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
        {drinkGroups.map((group) => (
          <div className="events-consumption-group" key={group.key}>
            <h3 className="events-consumption-drink-name">{group.drinkName}</h3>
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
                  />
                </label>
                <label className="events-form-field">
                  <span>Übrig</span>
                  <input
                    type="number"
                    min="0"
                    value={values[row.kategorie].uebrig}
                    onChange={(e) => updateValue(row.kategorie, 'uebrig', e.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>
        ))}

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
