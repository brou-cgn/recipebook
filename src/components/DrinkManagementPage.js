import React, { useState, useEffect } from 'react';
import './EventsPage.css';
import { subscribeToCustomDrinks, saveCustomDrink, deleteCustomDrink } from '../utils/eventsFirestore';
import OverviewAddFab from './OverviewAddFab';
import { DRINK_CATEGORIES, getDrinkCategoryLabel } from '../utils/drinkCategories';

const UNIT_SIZES = [
  { label: '200 ml', value: 0.2 },
  { label: '330 ml', value: 0.33 },
  { label: '500 ml', value: 0.5 },
  { label: '750 ml', value: 0.75 },
  { label: '1,0 l', value: 1.0 },
  { label: '1,5 l', value: 1.5 },
  { label: '2,0 l', value: 2.0 },
  { label: '5,0 l (Pittermännchen)', value: 5.0 },
  { label: '10,0 l (Fässchen)', value: 10.0 },
];

const getUnitSizeLabel = (liters) => {
  const value = Number(liters);
  if (!Number.isFinite(value) || value <= 0) return null;
  const configuredUnit = UNIT_SIZES.find((unit) => unit.value === value);
  if (configuredUnit) return configuredUnit.label;
  if (value < 1) return `${Math.round(value * 1000)} ml`;
  return `${value.toFixed(1).replace('.', ',')} l`;
};

const emptyEinheit = () => ({
  einheitsgroesse: 0.5,
  gebindeinheit: '',
  einheitenProGebinde: '',
});

const emptyForm = () => ({
  name: '',
  kategorie: '',
  einheiten: [emptyEinheit()],
});

function DrinkManagementPage({ onBack, currentUser }) {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubscribe = subscribeToCustomDrinks(currentUser.id, (loaded) => {
      setDrinks(loaded);
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser?.id]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm());
    setError('');
    setShowForm(true);
  };

  const openEdit = (drink) => {
    setEditId(drink.id);
    setForm({
      name: drink.name || '',
      kategorie: drink.kategorie || '',
      einheiten:
        Array.isArray(drink.einheiten) && drink.einheiten.length > 0
          ? drink.einheiten.map((e) => ({
              einheitsgroesse: e.einheitsgroesse ?? 0.5,
              gebindeinheit: e.gebindeinheit || '',
              einheitenProGebinde: e.einheitenProGebinde ?? '',
            }))
          : [emptyEinheit()],
    });
    setError('');
    setShowForm(true);
  };

  const addEinheit = () => {
    setForm((f) => ({ ...f, einheiten: [...f.einheiten, emptyEinheit()] }));
  };

  const removeEinheit = (idx) => {
    setForm((f) => ({ ...f, einheiten: f.einheiten.filter((_, i) => i !== idx) }));
  };

  const updateEinheit = (idx, field, value) => {
    setForm((f) => ({
      ...f,
      einheiten: f.einheiten.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Bitte einen Namen angeben.');
      return;
    }
    if (form.einheiten.length === 0) {
      setError('Bitte mindestens eine Einheit angeben.');
      return;
    }
    for (const einheit of form.einheiten) {
      if (!einheit.einheitsgroesse || !String(einheit.gebindeinheit).trim() || !einheit.einheitenProGebinde) {
        setError('Bitte alle Felder pro Einheit ausfüllen.');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        kategorie: form.kategorie || null,
        einheiten: form.einheiten.map((e) => ({
          einheitsgroesse: Number(e.einheitsgroesse),
          gebindeinheit: String(e.gebindeinheit).trim(),
          einheitenProGebinde: Number(e.einheitenProGebinde),
        })),
      };
      await saveCustomDrink(currentUser.id, payload, editId || undefined);
      setShowForm(false);
    } catch (err) {
      console.error('Error saving custom drink:', err);
      setError('Das Getränk konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (drink) => {
    if (!window.confirm(`Möchtest du "${drink.name}" wirklich löschen?`)) return;
    try {
      await deleteCustomDrink(currentUser.id, drink.id);
    } catch (err) {
      console.error('Error deleting custom drink:', err);
    }
  };

  if (showForm) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>{editId ? 'Getränk bearbeiten' : 'Neues Getränk'}</h2>
          <button
            className="events-close-btn"
            onClick={() => setShowForm(false)}
            aria-label="Abbrechen"
            title="Abbrechen"
          >
            ×
          </button>
        </div>
        <form className="events-form" onSubmit={handleSave}>
          <label className="events-form-field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="z. B. Craft-Bier, Apfelsaft, ..."
              required
            />
          </label>

          <label className="events-form-field">
            <span>Getränkekategorie</span>
            <select
              value={form.kategorie}
              onChange={(e) => setForm((f) => ({ ...f, kategorie: e.target.value }))}
            >
              <option value="">Keine Kategorie</option>
              {DRINK_CATEGORIES.map((cat) =>
                cat.subcategories ? (
                  <optgroup key={cat.id} label={cat.label}>
                    <option value={cat.id}>{cat.label}</option>
                    {cat.subcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.label}</option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                )
              )}
            </select>
          </label>

          <div className="events-form-field">
            <span>Einheiten</span>
            {form.einheiten.map((einheit, idx) => (
              <div key={idx} className="events-form-row events-einheit-row">
                <label className="events-form-field">
                  <span>Einheitsgröße</span>
                  <select
                    value={einheit.einheitsgroesse}
                    onChange={(e) => updateEinheit(idx, 'einheitsgroesse', e.target.value)}
                  >
                    {UNIT_SIZES.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </label>
                <label className="events-form-field">
                  <span>Gebindeinheit</span>
                  <input
                    type="text"
                    value={einheit.gebindeinheit}
                    onChange={(e) => updateEinheit(idx, 'gebindeinheit', e.target.value)}
                    placeholder="z. B. Flasche, Dose, Kasten"
                    required
                  />
                </label>
                <label className="events-form-field">
                  <span>Einheiten pro Gebinde</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={einheit.einheitenProGebinde}
                    onChange={(e) => updateEinheit(idx, 'einheitenProGebinde', e.target.value)}
                    required
                  />
                </label>
                {form.einheiten.length > 1 && (
                  <button
                    type="button"
                    className="events-secondary-btn"
                    onClick={() => removeEinheit(idx)}
                    aria-label="Einheit entfernen"
                  >
                    –
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="events-secondary-btn"
              onClick={addEinheit}
            >
              Einheit hinzufügen
            </button>
          </div>

          {error && <p className="events-error-text">{error}</p>}

          <div className="events-form-actions">
            <button
              type="button"
              className="events-secondary-btn"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button type="submit" className="events-primary-btn" disabled={saving}>
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Getränke verwalten</h2>
        {onBack && (
          <button
            className="events-close-btn"
            onClick={onBack}
            aria-label="Zurück"
            title="Zurück"
          >
            ×
          </button>
        )}
      </div>

      {loading ? (
        <div className="events-empty-state">Laden...</div>
      ) : drinks.length === 0 ? (
        <div className="events-empty-state">
          <p>Noch keine eigenen Getränke angelegt.</p>
          <button type="button" className="events-primary-btn" onClick={openNew}>
            Erstes Getränk anlegen
          </button>
        </div>
      ) : (
        <div className="events-list">
          {drinks.map((drink) => (
            <div key={drink.id} className="events-card" onClick={() => openEdit(drink)}>
              <div className="events-card-main">
                <h3>{drink.name}</h3>
                <p className="events-card-meta">
                  {[
                    drink.kategorie ? getDrinkCategoryLabel(drink.kategorie) : null,
                    Array.isArray(drink.einheiten) && drink.einheiten.length > 0
                      ? drink.einheiten
                          .map((e) => `${getUnitSizeLabel(e.einheitsgroesse) || e.einheitsgroesse} ${e.gebindeinheit}`.trim())
                          .join(', ')
                      : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <OverviewAddFab onClick={openNew} title="Getränk anlegen" ariaLabel="Getränk anlegen" />
    </div>
  );
}

export default DrinkManagementPage;
