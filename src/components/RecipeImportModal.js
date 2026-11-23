import React, { useState } from 'react';
import './ModalOverlay.css';
import './RecipeImportModal.css';
import Button from './Button';
import { parseBulkCSV } from '../utils/csvBulkImport';
import { getImageForCategories } from '../utils/categoryImages';
import { useTexte } from '../contexts/SpracheContext';
import { importTextAnzeige } from '../utils/importAnzeige';
import rezeptimportTexte from '../i18n/texte/rezeptimport';
import allgemeinTexte from '../i18n/texte/allgemein';

function RecipeImportModal({ onImport, onBulkImport, onCancel }) {
  const [error, setError] = useState('');
  const [csvRecipes, setCsvRecipes] = useState(null);
  const [csvFileName, setCsvFileName] = useState('');
  // Texte des Rezept-Imports (Mehrsprachigkeit PR 6i); Meldungen von parseBulkCSV bleiben vorerst deutsch
  const t = useTexte(rezeptimportTexte);
  const tAllgemein = useTexte(allgemeinTexte);

  const handleImport = () => {
    setError('');
    
    // If we have CSV recipes ready, import them
    if (csvRecipes && csvRecipes.length > 0) {
      if (onBulkImport) {
        onBulkImport(csvRecipes);
      } else {
        // If only single import is supported, import first recipe only
        onImport(csvRecipes[0]);
      }
      return;
    }
    
    // No CSV file selected or parsing failed
    if (csvFileName) {
      setError(t('csvFehlerFormat'));
    } else {
      setError(t('csvFehlerWaehlen'));
    }
  };

  /**
   * Read CSV file with proper encoding detection
   * Tries UTF-8 first, then falls back to Windows-1252 (common for Excel in German locale)
   * @param {File} file - The CSV file to read
   * @returns {Promise<string>} - The file content as text
   */
  const readCSVFileWithEncoding = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    
    // Try UTF-8 first with fatal flag to detect encoding errors
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return decoder.decode(arrayBuffer);
    } catch (e) {
      // UTF-8 decoding failed, try Windows-1252
      // This is common for CSV files created by Excel in European locales
    }
    
    // Fallback to Windows-1252 encoding (common for German Excel files)
    try {
      const decoder = new TextDecoder('windows-1252');
      return decoder.decode(arrayBuffer);
    } catch (e) {
      // Last resort: ISO-8859-1
      const decoder = new TextDecoder('iso-8859-1');
      return decoder.decode(arrayBuffer);
    }
  };

  const handleCSVFileUpload = async (e) => {
    setError('');
    setCsvRecipes(null);
    setCsvFileName('');
    
    const file = e.target.files[0];
    if (!file) return;

    // Check file extension and MIME type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(t('csvFehlerWaehlen'));
      return;
    }
    
    if (file.type && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      setError(t('csvFehlerTyp'));
      return;
    }

    try {
      // Read file with proper encoding detection for umlauts
      const text = await readCSVFileWithEncoding(file);
      
      // Parse CSV with category image support (parseBulkCSV is now async)
      const recipes = await parseBulkCSV(text, '', getImageForCategories);
      
      // Store parsed recipes for later import when button is clicked
      setCsvRecipes(recipes);
      setCsvFileName(file.name);
      
    } catch (err) {
      // Meldungen des CSV-Imports kommen deutsch, auch mehrzeilig (Mehrsprachigkeit PR 6m)
      setError(importTextAnzeige(err.message, t));
      setCsvRecipes(null);
      setCsvFileName('');
    }
  };



  return (
    <div className="modal-overlay">
      <div className="import-modal">
        <div className="import-modal-header">
          <h2>{t('csvTitel')}</h2>
          <button className="close-button" onClick={onCancel} aria-label={tAllgemein('schliessen')}>×</button>
        </div>

        <div className="import-modal-content">
          <p className="import-instructions">
            {t('csvAnleitung')}
          </p>

          <div className="csv-upload-section">
            <label htmlFor="csv-upload" className="csv-upload-label">
              {t('csvHochladen')}
            </label>
            {/* Eigener Knopf statt des Datei-Felds des Browsers („Choose File“, englisch); das Feld
                bleibt über das Label erreichbar */}
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={handleCSVFileUpload}
              className="csv-file-input"
              tabIndex={-1}
            />
            <Button onClick={() => document.getElementById('csv-upload')?.click()}>
              {t('csvWaehlen')}
            </Button>
            {csvRecipes && csvRecipes.length > 0 ? (
              <div className="csv-preview">
                <p className="csv-preview-success">
                  {t('csvGeladen', { datei: csvFileName })}
                </p>
                <p className="csv-preview-count">
                  {t('csvBereit', { anzahl: csvRecipes.length })}
                </p>
                <p className="csv-preview-hint">
                  {t('csvWeiter')}
                </p>
              </div>
            ) : (
              <p className="csv-help-text">
                {t('csvHilfe')}
              </p>
            )}
          </div>

          {error && (
            <div className="import-error">
              {error}
            </div>
          )}
        </div>

        <div className="import-modal-actions">
          <Button onClick={onCancel}>
            {tAllgemein('abbrechen')}
          </Button>
          <Button variant="primary" onClick={handleImport}>
            {t('importieren')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default RecipeImportModal;
