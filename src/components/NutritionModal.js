import React, { useState, useEffect, useRef } from 'react';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { mapNutritionCalcError } from '../utils/nutritionUtils';
import './NutritionModal.css';

function NutritionModal({ recipe, onClose, onSave }) {
  const [kalorien, setKalorien] = useState('');
  const [protein, setProtein] = useState('');
  const [fett, setFett] = useState('');
  const [kohlenhydrate, setKohlenhydrate] = useState('');
  const [zucker, setZucker] = useState('');
  const [ballaststoffe, setBallaststoffe] = useState('');
  const [salz, setSalz] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoCalcLoading, setAutoCalcLoading] = useState(false);
  const [autoCalcResult, setAutoCalcResult] = useState(null);
  const [calcProgress, setCalcProgress] = useState(null);
  const closeButtonRef = useRef(null);

  // Initialise fields from existing recipe data
  useEffect(() => {
    const n = recipe.naehrwerte || {};
    setKalorien(n.kalorien != null ? String(n.kalorien) : '');
    setProtein(n.protein != null ? String(n.protein) : '');
    setFett(n.fett != null ? String(n.fett) : '');
    setKohlenhydrate(n.kohlenhydrate != null ? String(n.kohlenhydrate) : '');
    setZucker(n.zucker != null ? String(n.zucker) : '');
    setBallaststoffe(n.ballaststoffe != null ? String(n.ballaststoffe) : '');
    setSalz(n.salz != null ? String(n.salz) : '');
  }, [recipe]);

  // Focus close button when modal opens
  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const parsePositiveNumber = (value) => {
    const n = parseFloat(value.replace(',', '.'));
    return isNaN(n) || n < 0 ? null : n;
  };

  const handleSave = async () => {
    const naehrwerte = {
      kalorien: parsePositiveNumber(kalorien),
      protein: parsePositiveNumber(protein),
      fett: parsePositiveNumber(fett),
      kohlenhydrate: parsePositiveNumber(kohlenhydrate),
      zucker: parsePositiveNumber(zucker),
      ballaststoffe: parsePositiveNumber(ballaststoffe),
      salz: parsePositiveNumber(salz),
    };

    // Remove null fields so we don't store empty values
    Object.keys(naehrwerte).forEach((key) => {
      if (naehrwerte[key] === null) delete naehrwerte[key];
    });

    setSaving(true);
    try {
      await onSave(naehrwerte);
      onClose();
    } catch (err) {
      console.error('Error saving nutritional values:', err);
      alert('Fehler beim Speichern der Nährwerte. Bitte versuchen Sie es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoCalculate = async () => {
    const rawIngredients = recipe.zutaten || recipe.ingredients || [];
    const ingredients = rawIngredients
      .filter(item => typeof item === 'string' || (item && typeof item === 'object' && item.type !== 'heading'))
      .map(item => typeof item === 'string' ? item : item.text);
    if (ingredients.length === 0) {
      setAutoCalcResult({ error: 'Keine Zutaten im Rezept gefunden.' });
      return;
    }

    setAutoCalcLoading(true);
    setAutoCalcResult(null);
    setCalcProgress({ done: 0, total: ingredients.length, current: ingredients[0] || '' });

    const calculateNutrition = httpsCallable(functions, 'calculateNutritionFromOpenFoodFacts');
    const totals = { kalorien: 0, protein: 0, fett: 0, kohlenhydrate: 0, zucker: 0, ballaststoffe: 0, salz: 0 };
    const notIncluded = [];
    let foundCount = 0;

    for (let i = 0; i < ingredients.length; i++) {
      const ingredient = ingredients[i];
      setCalcProgress({ done: i, total: ingredients.length, current: ingredient });

      try {
        const result = await calculateNutrition({ ingredients: [ingredient], portionen: 1 });
        const { naehrwerte: n, details } = result.data;
        const detail = details && details[0];
        if (detail && detail.found) {
          Object.keys(totals).forEach(key => {
            totals[key] += n[key] || 0;
          });
          foundCount++;
        } else {
          notIncluded.push({ ingredient, error: detail?.error || 'Nicht gefunden' });
        }
      } catch (err) {
        console.error(`Auto-calculation failed for "${ingredient}":`, err);
        notIncluded.push({ ingredient, error: mapNutritionCalcError(err) });
      }
    }

    // Divide totals by portionen and round
    const portionen = recipe.portionen || 1;
    const naehrwerte = {};
    Object.entries(totals).forEach(([key, value]) => {
      const perPortion = value / portionen;
      naehrwerte[key] = key === 'kalorien'
        ? Math.round(perPortion)
        : Math.round(perPortion * 10) / 10;
    });

    if (naehrwerte.kalorien != null) setKalorien(String(naehrwerte.kalorien));
    if (naehrwerte.protein != null) setProtein(String(naehrwerte.protein));
    if (naehrwerte.fett != null) setFett(String(naehrwerte.fett));
    if (naehrwerte.kohlenhydrate != null) setKohlenhydrate(String(naehrwerte.kohlenhydrate));
    if (naehrwerte.zucker != null) setZucker(String(naehrwerte.zucker));
    if (naehrwerte.ballaststoffe != null) setBallaststoffe(String(naehrwerte.ballaststoffe));
    if (naehrwerte.salz != null) setSalz(String(naehrwerte.salz));

    setCalcProgress(null);
    setAutoCalcLoading(false);
    setAutoCalcResult({ foundCount, totalCount: ingredients.length, notIncluded });
  };

  const hasValues =
    kalorien !== '' || protein !== '' || fett !== '' || kohlenhydrate !== '' ||
    zucker !== '' || ballaststoffe !== '' || salz !== '';

  return (
    <div className="nutrition-modal-overlay" onClick={onClose}>
      <div
        className="nutrition-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Nährwerte"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nutrition-modal-header">
          <h2 className="nutrition-modal-title">Nährwerte</h2>
          <button
            ref={closeButtonRef}
            className="nutrition-modal-close"
            onClick={onClose}
            aria-label="Nährwerte schließen"
          >
            ✕
          </button>
        </div>

        <div className="nutrition-modal-body">
          <p className="nutrition-modal-hint">
            Nährwerte pro Portion ({recipe.portionen || 1}{' '}
            {(recipe.portionen || 1) === 1 ? 'Portion' : 'Portionen'})
          </p>

          <div className="nutrition-field-grid">
            <div className="nutrition-field">
              <label htmlFor="nutrition-kalorien">Kalorien (kcal)</label>
              <input
                id="nutrition-kalorien"
                type="number"
                min="0"
                step="1"
                value={kalorien}
                onChange={(e) => setKalorien(e.target.value)}
                placeholder="z.B. 350"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-protein">Protein (g)</label>
              <input
                id="nutrition-protein"
                type="number"
                min="0"
                step="0.1"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="z.B. 25"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-fett">Fett (g)</label>
              <input
                id="nutrition-fett"
                type="number"
                min="0"
                step="0.1"
                value={fett}
                onChange={(e) => setFett(e.target.value)}
                placeholder="z.B. 12"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-kohlenhydrate">Kohlenhydrate (g)</label>
              <input
                id="nutrition-kohlenhydrate"
                type="number"
                min="0"
                step="0.1"
                value={kohlenhydrate}
                onChange={(e) => setKohlenhydrate(e.target.value)}
                placeholder="z.B. 40"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field nutrition-field--indented">
              <label htmlFor="nutrition-zucker">davon Zucker (g)</label>
              <input
                id="nutrition-zucker"
                type="number"
                min="0"
                step="0.1"
                value={zucker}
                onChange={(e) => setZucker(e.target.value)}
                placeholder="z.B. 5"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-ballaststoffe">Ballaststoffe (g)</label>
              <input
                id="nutrition-ballaststoffe"
                type="number"
                min="0"
                step="0.1"
                value={ballaststoffe}
                onChange={(e) => setBallaststoffe(e.target.value)}
                placeholder="z.B. 3"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-salz">Salz (g)</label>
              <input
                id="nutrition-salz"
                type="number"
                min="0"
                step="0.01"
                value={salz}
                onChange={(e) => setSalz(e.target.value)}
                placeholder="z.B. 0.8"
                className="nutrition-input"
              />
            </div>
          </div>

          <div className="nutrition-autocalc">
            <button
              className="nutrition-autocalc-button"
              onClick={handleAutoCalculate}
              disabled={autoCalcLoading}
              title="Nährwerte automatisch aus OpenFoodFacts berechnen"
            >
              {autoCalcLoading ? 'Berechne…' : '🔍 Automatisch berechnen (OpenFoodFacts)'}
            </button>
            {autoCalcLoading && calcProgress && (
              <div className="nutrition-calc-progress">
                <div className="nutrition-calc-progress-header">
                  <span>{calcProgress.done} von {calcProgress.total} Zutaten überprüft</span>
                </div>
                <div className="nutrition-calc-progress-bar-track">
                  <div
                    className="nutrition-calc-progress-bar-fill"
                    style={{ width: `${calcProgress.total > 0 ? (calcProgress.done / calcProgress.total) * 100 : 0}%` }}
                  />
                </div>
                {calcProgress.current && (
                  <p className="nutrition-calc-current">Überprüfe: {calcProgress.current}</p>
                )}
              </div>
            )}
            {autoCalcResult && !autoCalcResult.error && (
              <>
                <p className="nutrition-autocalc-info">
                  {autoCalcResult.foundCount} von {autoCalcResult.totalCount} Zutaten gefunden.
                  {autoCalcResult.foundCount < autoCalcResult.totalCount &&
                    ' Fehlende Werte bitte manuell ergänzen.'}
                </p>
                {autoCalcResult.notIncluded && autoCalcResult.notIncluded.length > 0 && (
                  <div className="nutrition-not-included">
                    <p className="nutrition-not-included-title">Nicht einkalkulierte Zutaten:</p>
                    <ul className="nutrition-not-included-list">
                      {autoCalcResult.notIncluded.map((item, i) => (
                        <li key={i} className="nutrition-not-included-item">
                          <span className="nutrition-not-included-name">{item.ingredient}</span>
                          {item.error && (
                            <span className="nutrition-not-included-reason">: {item.error}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {autoCalcResult && autoCalcResult.error && (
              <div className="nutrition-autocalc-error-box">
                <p className="nutrition-autocalc-error">{autoCalcResult.error}</p>
                <button
                  className="nutrition-autocalc-retry-button"
                  onClick={handleAutoCalculate}
                  disabled={autoCalcLoading}
                >
                  🔄 Erneut versuchen
                </button>
              </div>
            )}
            <p className="nutrition-autocalc-source">
              Quelle:{' '}
              <a
                href="https://world.openfoodfacts.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenFoodFacts
              </a>{' '}
              (Open Database License)
            </p>
          </div>
        </div>

        <div className="nutrition-modal-footer">
          <button className="nutrition-cancel-button" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="nutrition-save-button"
            onClick={handleSave}
            disabled={saving || !hasValues}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NutritionModal;
