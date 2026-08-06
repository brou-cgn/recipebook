import React, { useState } from 'react';
import './EventsPage.css';
import { submitConsumption } from '../utils/eventsFirestore';
import { CATEGORY_LABELS } from './EventForm';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import { calculateCascadingEinkauf } from '../utils/einkaufCascade';

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
        eingekauft: prefillValue !== undefined && prefillValue !== null ? String(prefillValue) : '',
        uebrig: '',
      };
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [changes, setChanges] = useState(null);

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
          eingekauft: Number(eingekauft) || 0,
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
        <h2>Verbrauch nachtragen</h2>
        <button
          className="events-close-btn"
          onClick={onCancel}
          aria-label="Abbrechen"
          title="Abbrechen"
        >
          ×
        </button>
      </div>
      <p className="events-info-text">
        Wie viele Gebinde wurden für „{event.eventName}" eingekauft, und wie viele sind übrig?
        {' '}Die Eingekauft-Felder sind bereits aus der Kalkulation vorbefüllt und lassen sich anpassen.
      </p>
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
                    type="number"
                    min="0"
                    step="0.01"
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
          <button type="button" className="events-secondary-btn" onClick={onCancel} disabled={saving}>
            Abbrechen
          </button>
          <button type="submit" className="events-primary-btn" disabled={saving}>
            {saving ? 'Speichere...' : 'Verbrauch speichern'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ConsumptionForm;
