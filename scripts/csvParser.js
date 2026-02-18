/**
 * CSV Parsing Utilities for Recipe Date Updates
 * 
 * This module contains pure functions for parsing the ImportDatum.csv file
 * without any Firebase dependencies, making it easy to test.
 */

const fs = require('fs');

/**
 * Parse CSV file
 * @param {string} filePath - Path to the CSV file
 * @returns {Array} Array of {name, date, dateStr} objects
 */
function parseCSV(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    
    // Skip header row
    const dataLines = lines.slice(1);
    
    const recipes = [];
    for (const line of dataLines) {
      if (!line.trim()) continue;
      
      const [name, dateStr] = line.split(';').map(s => s.trim());
      
      if (!name || !dateStr) {
        console.warn(`⚠ Skipping invalid line: ${line}`);
        continue;
      }
      
      // Parse German date format (DD.MM.YYYY) to JavaScript Date
      const [day, month, year] = dateStr.split('.');
      
      // Validate date components exist and are numeric
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      
      if (!dayNum || !monthNum || !yearNum || 
          monthNum < 1 || monthNum > 12 || 
          yearNum < 1900 || yearNum > 2100) {
        console.warn(`⚠ Invalid date for ${name}: ${dateStr}`);
        continue;
      }
      
      const date = new Date(yearNum, monthNum - 1, dayNum);
      
      // Check if the date is valid (JavaScript Date can roll over invalid dates like Feb 31)
      if (isNaN(date.getTime()) || 
          date.getDate() !== dayNum || 
          date.getMonth() !== monthNum - 1 || 
          date.getFullYear() !== yearNum) {
        console.warn(`⚠ Invalid date for ${name}: ${dateStr}`);
        continue;
      }
      
      recipes.push({ name, date, dateStr });
    }
    
    return recipes;
  } catch (error) {
    console.error('✗ Error reading CSV file:', error.message);
    throw error;
  }
}

module.exports = { parseCSV };
