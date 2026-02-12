import React, { useState } from 'react';
import './RecipeImportModal.css';
import { importFromJSON, EXAMPLE_NOTION_RECIPE } from '../utils/recipeImport';

function RecipeImportModal({ onImport, onCancel }) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');
  const [showExample, setShowExample] = useState(false);

  const handleImport = () => {
    setError('');
    
    if (!importText.trim()) {
      setError('Bitte geben Sie Rezeptdaten ein');
      return;
    }

    try {
      const recipe = importFromJSON(importText);
      onImport(recipe);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLoadExample = () => {
    setImportText(JSON.stringify(EXAMPLE_NOTION_RECIPE, null, 2));
    setShowExample(false);
  };

  return (
    <div className="modal-overlay">
      <div className="import-modal">
        <div className="import-modal-header">
          <h2>Rezept importieren</h2>
          <button className="close-button" onClick={onCancel}>✕</button>
        </div>

        <div className="import-modal-content">
          <p className="import-instructions">
            Fügen Sie Ihre Rezeptdaten im JSON-Format ein:
          </p>

          <textarea
            className="import-textarea"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`{\n  "title": "Rezeptname",\n  "portionen": 4,\n  "ingredients": ["Zutat 1", "Zutat 2"],\n  "steps": ["Schritt 1", "Schritt 2"]\n}`}
            rows="15"
          />

          {error && (
            <div className="import-error">
              {error}
            </div>
          )}

          <div className="import-help">
            <button 
              type="button"
              className="example-button"
              onClick={() => setShowExample(!showExample)}
            >
              {showExample ? '▼ Beispiel ausblenden' : '▶ Beispiel anzeigen'}
            </button>
            
            {showExample && (
              <div className="example-section">
                <h4>Beispiel-Rezept (Notion-Struktur)</h4>
                <pre className="example-json">
                  {JSON.stringify(EXAMPLE_NOTION_RECIPE, null, 2)}
                </pre>
                <button 
                  type="button"
                  className="load-example-button"
                  onClick={handleLoadExample}
                >
                  Beispiel laden
                </button>
              </div>
            )}
          </div>

          <div className="notion-help">
            <h4>💡 Notion-Rezepte importieren</h4>
            <ol>
              <li>Öffnen Sie das Rezept in Notion</li>
              <li>Kopieren Sie die Rezeptdaten</li>
              <li>Konvertieren Sie die Daten in das JSON-Format (siehe Beispiel oben)</li>
              <li>Fügen Sie die JSON-Daten hier ein</li>
            </ol>
            <p className="notion-note">
              <strong>Hinweis:</strong> Direkte URL-Imports von Notion werden in einer zukünftigen Version unterstützt.
            </p>
          </div>
        </div>

        <div className="import-modal-actions">
          <button className="cancel-button" onClick={onCancel}>
            Abbrechen
          </button>
          <button className="import-button" onClick={handleImport}>
            Importieren
          </button>
        </div>
      </div>
    </div>
  );
}

export default RecipeImportModal;
