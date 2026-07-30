import React, { useState, useEffect } from 'react';
import './EventsPage.css';
import { subscribeToCustomDrinks, saveCustomDrink, deleteCustomDrink } from '../utils/eventsFirestore';
import OverviewAddFab from './OverviewAddFab';

const UNIT_SIZES = [
  { label: '0,2 L', value: 0.2 },
  { label: '0,25 L', value: 0.25 },
  { label: '0,33 L', value: 0.33 },
  { label: '0,5 L', value: 0.5 },
  { label: '0,75 L', value: 0.75 },
  { label: '1 L', value: 1.0 },
  { label: '1,5 L', value: 1.5 },
  { label: '2 L', value: 2.0 },
];

const DRINK_CATEGORIES = [
  { id: 'wasser', label: 'Wasser' },
  { id: 'softdrinks', label: 'Softdrinks' },
  { id: 'saft', label: 'Saft' },
  {
    id: 'bier',
    label: 'Bier',
    subcategories: [
      { id: 'bier_koelsch', label: 'Kölsch' },
      { id: 'bier_pils', label: 'Pils' },
      { id: 'bier_weizen', label: 'Weizen' },
      { id: 'bier_alkoholfrei', label: 'Alkoholfreies Bier' },
    ],
  },
  {
    id: 'wein',
    label: 'Wein',
    subcategories: [
      { id: 'wein_weisswein', label: 'Weißwein' },
      { id: 'wein_rose', label: 'Rosé' },
      { id: 'wein_rotwein', label: 'Rotwein' },
    ],
  },
  { id: 'sekt', label: 'Sekt' },
  { id: 'spirituosen', label: 'Spirituosen' },
  { id: 'kaffee', label: 'Kaffee' },
  { id: 'tee', label: 'Tee' },
];

function getDrinkCategoryLabel(kategorieId) {
  for (const cat of DRINK_CATEGORIES) {
    if (cat.id === kategorieId) return cat.label;
    if (cat.subcategories) {
      const sub = cat.subcategories.find((s) => s.id === kategorieId);
      if (sub) return sub.label;
    }
  }
  return kategorieId;
}

const emptyForm = () => ({
  name: '',
  kategorie: '',
  gebindeLiter: 0.5,
  erwachsene: 0.15,
  kinder: 0.0,
  modus: 'stunde',
  anteilTrinker: 1.0,
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
      gebindeLiter: drink.gebindeLiter ?? 0.5,
      erwachsene: drink.erwachsene ?? 0.15,
      kinder: drink.kinder ?? 0.0,
      modus: drink.modus || 'stunde',
      anteilTrinker: drink.anteilTrinker ?? 1.0,
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Bitte einen Namen angeben.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const gebindeLiter = Number(form.gebindeLiter);
      const payload = {
        name: form.name.trim(),
        kategorie: form.kategorie || null,
        gebindeLiter,
        gebindeName: gebindeLiter ? `${String(gebindeLiter).replace('.', ',')} L` : null,
        erwachsene: Number(form.erwachsene) || 0,
        kinder: Number(form.kinder) || 0,
        modus: form.modus,
        anteilTrinker: Number(form.anteilTrinker) || 1.0,
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

          <label className="events-form-field">
            <span>Einheitsgröße</span>
            <select
              value={form.gebindeLiter}
              onChange={(e) => setForm((f) => ({ ...f, gebindeLiter: e.target.value }))}
            >
              {UNIT_SIZES.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </label>

          <label className="events-form-field">
            <span>Berechnungsmodus</span>
            <select
              value={form.modus}
              onChange={(e) => setForm((f) => ({ ...f, modus: e.target.value }))}
            >
              <option value="stunde">Pro Stunde (L/Person/Std.)</option>
              <option value="pauschal">Pauschal (L/Person gesamt)</option>
            </select>
          </label>

          <div className="events-form-row">
            <label className="events-form-field">
              <span>{form.modus === 'pauschal' ? 'Erwachsene (L/Person)' : 'Erwachsene (L/Person/Std.)'}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.erwachsene}
                onChange={(e) => setForm((f) => ({ ...f, erwachsene: e.target.value }))}
              />
            </label>
            <label className="events-form-field">
              <span>{form.modus === 'pauschal' ? 'Kinder (L/Person)' : 'Kinder (L/Person/Std.)'}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.kinder}
                onChange={(e) => setForm((f) => ({ ...f, kinder: e.target.value }))}
              />
            </label>
          </div>

          <label className="events-form-field">
            <span>Anteil Trinker (0–1, z. B. 0,5 = 50 % der Gäste)</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={form.anteilTrinker}
              onChange={(e) => setForm((f) => ({ ...f, anteilTrinker: e.target.value }))}
            />
          </label>

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
                    drink.anteilTrinker && drink.anteilTrinker < 1 ? `${Math.round(drink.anteilTrinker * 100)} % der Gäste` : null,
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
