/**
 * Tests for updateRecipeCreationDates script
 * 
 * These tests validate the CSV parsing and date conversion logic
 */

const { parseCSV } = require('../scripts/csvParser');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('updateRecipeCreationDates', () => {
  describe('parseCSV', () => {
    let tempDir;
    let tempFile;

    beforeEach(() => {
      // Create a temporary directory for test files
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-test-'));
    });

    afterEach(() => {
      // Clean up temporary files
      if (tempFile && fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    });

    test('should parse valid CSV file with German date format', () => {
      const csvContent = `Name;Erstellt am
Affenjäger;22.02.2024
Apple Crumble Cheesecake;27.11.2024`;
      
      tempFile = path.join(tempDir, 'test.csv');
      fs.writeFileSync(tempFile, csvContent, 'utf-8');

      const result = parseCSV(tempFile);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Affenjäger',
        date: new Date(2024, 1, 22), // Month is 0-indexed
        dateStr: '22.02.2024'
      });
      expect(result[1]).toEqual({
        name: 'Apple Crumble Cheesecake',
        date: new Date(2024, 10, 27), // November = 10
        dateStr: '27.11.2024'
      });
    });

    test('should skip empty lines', () => {
      const csvContent = `Name;Erstellt am
Affenjäger;22.02.2024

Apple Crumble Cheesecake;27.11.2024`;
      
      tempFile = path.join(tempDir, 'test.csv');
      fs.writeFileSync(tempFile, csvContent, 'utf-8');

      const result = parseCSV(tempFile);

      expect(result).toHaveLength(2);
    });

    test('should skip lines with missing data', () => {
      const csvContent = `Name;Erstellt am
Affenjäger;22.02.2024
Invalid Recipe;
;27.11.2024
Valid Recipe;15.03.2024`;
      
      tempFile = path.join(tempDir, 'test.csv');
      fs.writeFileSync(tempFile, csvContent, 'utf-8');

      const result = parseCSV(tempFile);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Affenjäger');
      expect(result[1].name).toBe('Valid Recipe');
    });

    test('should skip lines with invalid dates', () => {
      const csvContent = `Name;Erstellt am
Valid Recipe;22.02.2024
Invalid Date Recipe;32.13.2024
Another Valid;15.03.2024`;
      
      tempFile = path.join(tempDir, 'test.csv');
      fs.writeFileSync(tempFile, csvContent, 'utf-8');

      const result = parseCSV(tempFile);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Valid Recipe');
      expect(result[1].name).toBe('Another Valid');
    });

    test('should handle CSV with only header', () => {
      const csvContent = `Name;Erstellt am`;
      
      tempFile = path.join(tempDir, 'test.csv');
      fs.writeFileSync(tempFile, csvContent, 'utf-8');

      const result = parseCSV(tempFile);

      expect(result).toHaveLength(0);
    });

    test('should correctly parse dates at year boundaries', () => {
      const csvContent = `Name;Erstellt am
New Year Recipe;01.01.2024
End Year Recipe;31.12.2024`;
      
      tempFile = path.join(tempDir, 'test.csv');
      fs.writeFileSync(tempFile, csvContent, 'utf-8');

      const result = parseCSV(tempFile);

      expect(result).toHaveLength(2);
      expect(result[0].date).toEqual(new Date(2024, 0, 1));
      expect(result[1].date).toEqual(new Date(2024, 11, 31));
    });

    test('should handle recipe names with special characters', () => {
      const csvContent = `Name;Erstellt am
Käsespätzle;22.02.2024
Crème Brûlée;27.11.2024
Bœuf Bourguignon;15.03.2024`;
      
      tempFile = path.join(tempDir, 'test.csv');
      fs.writeFileSync(tempFile, csvContent, 'utf-8');

      const result = parseCSV(tempFile);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Käsespätzle');
      expect(result[1].name).toBe('Crème Brûlée');
      expect(result[2].name).toBe('Bœuf Bourguignon');
    });

    test('should throw error for non-existent file', () => {
      const nonExistentFile = path.join(tempDir, 'nonexistent.csv');
      
      expect(() => {
        parseCSV(nonExistentFile);
      }).toThrow();
    });
  });
});
