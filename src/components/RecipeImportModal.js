import React, { useState } from 'react';
import './RecipeImportModal.css';
import { importRecipe, EXAMPLE_NOTION_RECIPE } from '../utils/recipeImport';
import { EXAMPLE_NOTION_MARKDOWN } from '../utils/notionParser';
import OcrScanModal from './OcrScanModal';

function RecipeImportModal({ onImport, onCancel }) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [exampleType, setExampleType] = useState('json'); // 'json' or 'markdown'
  const [showOcrModal, setShowOcrModal] = useState(false);

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

  const handleLoadExample = (type) => {
    if (type === 'json') {
      setImportText(JSON.stringify(EXAMPLE_NOTION_RECIPE, null, 2));
    } else {
      setImportText(EXAMPLE_NOTION_MARKDOWN);
    }
    setShowExample(false);
  };

  const handleOcrResult = (ocrText) => {
    setImportText(ocrText);
    setShowOcrModal(false);
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
            Fügen Sie Ihre Rezeptdaten ein. Unterstützte Formate: JSON, Notion Markdown, CSV
          </p>

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
                ) : (
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
          <button 
            className="ocr-camera-button" 
            onClick={() => setShowOcrModal(true)}
            title="Rezept mit Kamera scannen"
            aria-label="Rezept mit Kamera scannen"
          >
            📷
          </button>
          <button className="import-button" onClick={handleImport}>
            Importieren
          </button>
        </div>
      </div>

      {showOcrModal && (
        <OcrScanModal
          onImport={handleOcrResult}
          onCancel={() => setShowOcrModal(false)}
        />
      )}
    </div>
  );
}

export default RecipeImportModal;
