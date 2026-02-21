import React, { useState } from 'react';
import './RecipeImportModal.css';
import { importRecipe } from '../utils/recipeImport';
import { parseBulkCSV } from '../utils/csvBulkImport';
import { getImageForCategories } from '../utils/categoryImages';

function RecipeImportModal({ onImport, onBulkImport, onCancel }) {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');
  const [csvRecipes, setCsvRecipes] = useState(null);
  const [csvFileName, setCsvFileName] = useState('');

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
    
    // Otherwise, handle text import
    if (!importText.trim()) {
      if (csvFileName) {
        // CSV file was selected but parsing failed
        setError('CSV-Datei konnte nicht verarbeitet werden. Bitte überprüfen Sie das Dateiformat.');
      } else {
        setError('Bitte wählen Sie eine CSV-Datei aus');
      }
      return;
    }

    try {
      const recipe = importRecipe(importText);
      onImport(recipe);
    } catch (err) {
      setError(err.message);
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
      setError('Bitte wählen Sie eine CSV-Datei aus');
      return;
    }
    
    if (file.type && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      setError('Ungültiger Dateityp. Bitte wählen Sie eine CSV-Datei aus');
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
      setError(err.message);
      setCsvRecipes(null);
      setCsvFileName('');
    }
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
            Lade deine Rezeptdaten hoch (unterstützte Formate: CSV)
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
            {csvRecipes && csvRecipes.length > 0 ? (
              <div className="csv-preview">
                <p className="csv-preview-success">
                  ✓ {csvFileName} erfolgreich geladen
                </p>
                <p className="csv-preview-count">
                  {csvRecipes.length} Rezept{csvRecipes.length !== 1 ? 'e' : ''} bereit zum Importieren
                </p>
                <p className="csv-preview-hint">
                   Klicke auf "Importieren", um fortzufahren
                </p>
              </div>
            ) : (
              <p className="csv-help-text">
                CSV-Dateien können mehrere Rezepte auf einmal importieren. 
                Alle importierten Rezepte werden automatisch als privat markiert.
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
