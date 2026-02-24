import React, { useState, useEffect, useRef } from 'react';
import './NutritionModal.css';

function NutritionModal({ recipe, onClose, onSave }) {
  const [kalorien, setKalorien] = useState('');
  const [protein, setProtein] = useState('');
  const [fett, setFett] = useState('');
  const [kohlenhydrate, setKohlenhydrate] = useState('');
  const [saving, setSaving] = useState(false);
  const closeButtonRef = useRef(null);

  // Initialise fields from existing recipe data
  useEffect(() => {
    const n = recipe.naehrwerte || {};
    setKalorien(n.kalorien != null ? String(n.kalorien) : '');
    setProtein(n.protein != null ? String(n.protein) : '');
    setFett(n.fett != null ? String(n.fett) : '');
    setKohlenhydrate(n.kohlenhydrate != null ? String(n.kohlenhydrate) : '');
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
      kohlenhydrate: parsePositiveNumber(kohlenhydrate)
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

  const hasValues =
    kalorien !== '' || protein !== '' || fett !== '' || kohlenhydrate !== '';

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
