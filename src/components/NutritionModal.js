import React, { useState, useEffect, useRef } from 'react';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { mapNutritionCalcError, naehrwertePerPortion, naehrwerteToTotals } from '../utils/nutritionUtils';
import './NutritionModal.css';

const CALC_RESULT_STORAGE_KEY_PREFIX = 'nutrition_calc_result_';

function loadStoredCalcResult(recipeId) {
  if (!recipeId) return null;
  try {
    const stored = localStorage.getItem(CALC_RESULT_STORAGE_KEY_PREFIX + recipeId);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof parsed.foundCount === 'number' &&
      typeof parsed.totalCount === 'number' &&
      Array.isArray(parsed.notIncluded)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredCalcResult(recipeId, result) {
  if (!recipeId) return;
  try { localStorage.setItem(CALC_RESULT_STORAGE_KEY_PREFIX + recipeId, JSON.stringify(result)); } catch { /* ignore */ }
}

function clearStoredCalcResult(recipeId) {
  if (!recipeId) return;
  try { localStorage.removeItem(CALC_RESULT_STORAGE_KEY_PREFIX + recipeId); } catch { /* ignore */ }
}

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
  const [autoCalcResult, setAutoCalcResult] = useState(() => loadStoredCalcResult(recipe?.id));
  const [calcProgress, setCalcProgress] = useState(null);
  const closeButtonRef = useRef(null);

  // Initialise fields from existing recipe data (stored as totals; display per portion)
  useEffect(() => {
    const n = naehrwertePerPortion(recipe.naehrwerte, recipe.portionen);
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
    const portionen = recipe.portionen || 1;
    // Form fields hold per-portion values; multiply back to store totals
    const perPortion = {
      kalorien: parsePositiveNumber(kalorien),
      protein: parsePositiveNumber(protein),
      fett: parsePositiveNumber(fett),
      kohlenhydrate: parsePositiveNumber(kohlenhydrate),
      zucker: parsePositiveNumber(zucker),
      ballaststoffe: parsePositiveNumber(ballaststoffe),
      salz: parsePositiveNumber(salz),
    };
    const naehrwerte = naehrwerteToTotals(perPortion, portionen);

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
    clearStoredCalcResult(recipe?.id);
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

    // Set per-portion display values in form fields (totals ÷ portionen)
    const portionen = recipe.portionen || 1;
    const perPortion = naehrwertePerPortion(totals, portionen);
    setKalorien(perPortion.kalorien != null ? String(perPortion.kalorien) : '');
    setProtein(perPortion.protein != null ? String(perPortion.protein) : '');
    setFett(perPortion.fett != null ? String(perPortion.fett) : '');
    setKohlenhydrate(perPortion.kohlenhydrate != null ? String(perPortion.kohlenhydrate) : '');
    setZucker(perPortion.zucker != null ? String(perPortion.zucker) : '');
    setBallaststoffe(perPortion.ballaststoffe != null ? String(perPortion.ballaststoffe) : '');
    setSalz(perPortion.salz != null ? String(perPortion.salz) : '');

    setCalcProgress(null);
    setAutoCalcLoading(false);
    const result = { foundCount, totalCount: ingredients.length, notIncluded };
    setAutoCalcResult(result);
    saveStoredCalcResult(recipe?.id, result);
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
            {!autoCalcLoading && recipe.naehrwerte?.calcPending && (
              <div className="nutrition-calc-progress">
                <span>Hintergrundberechnung läuft…</span>
              </div>
            )}
            {!autoCalcLoading && !autoCalcResult && recipe.naehrwerte?.calcError && (
              <div className="nutrition-autocalc-error-box">
                <p className="nutrition-autocalc-error">{recipe.naehrwerte.calcError}</p>
                <button
                  className="nutrition-autocalc-retry-button"
                  onClick={handleAutoCalculate}
                  disabled={autoCalcLoading}
                >
                  🔄 Erneut versuchen
                </button>
              </div>
            )}
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
