import React, { useState } from 'react';
import './RecipeImportModal.css';
import { importRecipe, EXAMPLE_NOTION_RECIPE } from '../utils/recipeImport';
import { EXAMPLE_NOTION_MARKDOWN } from '../utils/notionParser';
import { parseBulkCSV, EXAMPLE_CSV } from '../utils/csvBulkImport';

function RecipeImportModal({ onImport, onBulkImport, onCancel }) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [exampleType, setExampleType] = useState('json'); // 'json', 'markdown', or 'csv'

  const handleImport = () => {
    setError('');
    
    if (!importText.trim()) {
      setError('Bitte geben Sie Rezeptdaten ein');
      return;
    }

    try {
      const recipe = importRecipe(importText);
      onImport(recipe);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCSVFileUpload = async (e) => {
    setError('');
    const file = e.target.files[0];
    if (!file) return;

    // Check file extension and MIME type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Bitte wählen Sie eine CSV-Datei aus');
      return;
    }
    
    if (file.type && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      setError('Ungültiger Dateityp. Bitte wählen Sie eine CSV-Datei aus');
      return;
    }

    try {
      const text = await file.text();
      const recipes = parseBulkCSV(text);
      
      // Use bulk import callback if available, otherwise fall back to single import
      if (onBulkImport) {
        onBulkImport(recipes);
      } else {
        // If only single import is supported, import first recipe only
        if (recipes.length > 0) {
          onImport(recipes[0]);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLoadExample = (type) => {
    if (type === 'json') {
      setImportText(JSON.stringify(EXAMPLE_NOTION_RECIPE, null, 2));
    } else if (type === 'markdown') {
      setImportText(EXAMPLE_NOTION_MARKDOWN);
    } else if (type === 'csv') {
      setImportText(EXAMPLE_CSV);
    }
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
            Fügen Sie Ihre Rezeptdaten ein oder laden Sie eine CSV-Datei hoch. 
            Unterstützte Formate: JSON, Notion Markdown, CSV (für Bulk-Import)
          </p>

          <div className="csv-upload-section">
            <label htmlFor="csv-upload" className="csv-upload-label">
              📄 CSV-Datei hochladen (Bulk-Import)
            </label>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={handleCSVFileUpload}
              className="csv-file-input"
            />
            <p className="csv-help-text">
              CSV-Dateien können mehrere Rezepte auf einmal importieren. 
              Alle importierten Rezepte werden automatisch als privat markiert.
            </p>
          </div>

          <div className="text-import-divider">
            <span>oder Text einfügen</span>
          </div>

          <textarea
            className="import-textarea"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`JSON:\n{\n  "title": "Rezeptname",\n  "ingredients": [...],\n  "steps": [...]\n}\n\nNotion Markdown:\n# Rezeptname\nPortionen: 4\n## Zutaten\n- Zutat 1\n## Zubereitung\n1. Schritt 1`}
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
              {showExample ? '▼ Beispiele ausblenden' : '▶ Beispiele anzeigen'}
            </button>
            
            {showExample && (
              <div className="example-section">
                <div className="example-tabs">
                  <button
                    className={`example-tab ${exampleType === 'json' ? 'active' : ''}`}
                    onClick={() => setExampleType('json')}
                  >
                    JSON
                  </button>
                  <button
                    className={`example-tab ${exampleType === 'markdown' ? 'active' : ''}`}
                    onClick={() => setExampleType('markdown')}
                  >
                    Notion Markdown
                  </button>
                  <button
                    className={`example-tab ${exampleType === 'csv' ? 'active' : ''}`}
                    onClick={() => setExampleType('csv')}
                  >
                    CSV
                  </button>
                </div>
                
                {exampleType === 'json' ? (
                  <>
                    <h4>Beispiel-Rezept (JSON)</h4>
                    <pre className="example-json">
                      {JSON.stringify(EXAMPLE_NOTION_RECIPE, null, 2)}
                    </pre>
                    <button 
                      type="button"
                      className="load-example-button"
                      onClick={() => handleLoadExample('json')}
                    >
                      JSON-Beispiel laden
                    </button>
                  </>
                ) : exampleType === 'markdown' ? (
                  <>
                    <h4>Beispiel-Rezept (Notion Markdown)</h4>
                    <pre className="example-json">
                      {EXAMPLE_NOTION_MARKDOWN}
                    </pre>
                    <button 
                      type="button"
                      className="load-example-button"
                      onClick={() => handleLoadExample('markdown')}
                    >
                      Markdown-Beispiel laden
                    </button>
                  </>
                ) : (
                  <>
                    <h4>Beispiel-CSV (Bulk-Import)</h4>
                    <pre className="example-json">
                      {EXAMPLE_CSV}
                    </pre>
                    <button 
                      type="button"
                      className="load-example-button"
                      onClick={() => handleLoadExample('csv')}
                    >
                      CSV-Beispiel laden
                    </button>
                    <p className="csv-format-note">
                      <strong>CSV-Format:</strong> Unterstützte Spalten: Name, Erstellt am, Erstellt von, 
                      Kulinarik, Speisenkategorie, Portionen, Zubereitung, Schwierigkeit, 
                      Zutat1-31, Zubereitungsschritt1-27. 
                      Zutaten/Schritte mit "###" am Anfang werden als Überschriften formatiert.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="notion-help">
            <h4>💡 Notion-Rezepte importieren</h4>
            <p><strong>Methode 1: Markdown Export (empfohlen)</strong></p>
            <ol>
              <li>Öffnen Sie das Rezept in Notion</li>
              <li>Klicken Sie auf "..." → "Export" → "Markdown & CSV"</li>
              <li>Öffnen Sie die exportierte .md Datei</li>
              <li>Kopieren Sie den gesamten Inhalt</li>
              <li>Fügen Sie ihn hier ein und klicken Sie auf "Importieren"</li>
            </ol>
            
            <p><strong>Methode 2: Direkt kopieren</strong></p>
            <ol>
              <li>Kopieren Sie den Inhalt Ihres Notion-Rezepts</li>
              <li>Strukturieren Sie es wie im Markdown-Beispiel</li>
              <li>Fügen Sie es hier ein</li>
            </ol>

            <p className="notion-note">
              <strong>Tipp:</strong> Das Format wird automatisch erkannt - Sie können JSON, Markdown oder CSV einfügen.
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
