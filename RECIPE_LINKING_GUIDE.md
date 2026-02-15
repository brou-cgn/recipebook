# Rezepte verlinken - Recipe Linking Feature

## Übersicht / Overview

Diese Funktion ermöglicht es, andere Rezepte als Zutaten in einem Rezept zu verwenden.

This feature allows you to use other recipes as ingredients in a recipe.

## Verwendung / Usage

### Rezept als Zutat hinzufügen / Adding a Recipe as an Ingredient

1. **Rezept erstellen oder bearbeiten** / **Create or edit a recipe**
   - Öffnen Sie das Rezeptformular
   - Open the recipe form

2. **Zutat hinzufügen** / **Add an ingredient**
   - Klicken Sie auf "+ Zutat hinzufügen"
   - Click "+ Zutat hinzufügen" (Add ingredient)

3. **Modus wechseln** / **Switch mode**
   - Klicken Sie auf den Button "📝 Text" rechts neben der Zutat
   - Der Button wechselt zu "📖 Rezept"
   - Click the "📝 Text" button next to the ingredient
   - The button switches to "📖 Rezept" (Recipe)

4. **Rezept auswählen** / **Select a recipe**
   - Wählen Sie aus dem Dropdown-Menü ein Rezept aus
   - Das aktuelle Rezept wird automatisch ausgeblendet (keine Selbstverweise)
   - Select a recipe from the dropdown menu
   - The current recipe is automatically hidden (no self-references)

5. **Speichern** / **Save**
   - Speichern Sie das Rezept wie gewohnt
   - Save the recipe as usual

### Rezept-Zutat verwenden / Using a Recipe Ingredient

1. **Rezeptdetails öffnen** / **Open recipe details**
   - Öffnen Sie ein Rezept, das verlinkte Rezepte enthält
   - Open a recipe that contains linked recipes

2. **Verlinkte Rezepte erkennen** / **Recognize linked recipes**
   - Rezept-Zutaten werden mit einem 📖 Icon angezeigt
   - Sie erscheinen als anklickbare Buttons
   - Recipe ingredients are displayed with a 📖 icon
   - They appear as clickable buttons

3. **Navigation** / **Navigation**
   - Klicken Sie auf eine Rezept-Zutat
   - Das verlinkte Rezept öffnet sich
   - Use the back button to return to the original recipe
   - Verwenden Sie den Zurück-Button, um zum ursprünglichen Rezept zurückzukehren

## Technische Details / Technical Details

### Datenspeicherung / Data Storage

**Text-Zutaten** / **Text ingredients**:
```javascript
"200g Mehl"  // Simple string
```

**Rezept-Zutaten** / **Recipe ingredients**:
```javascript
{
  type: 'recipe',
  recipeId: 'recipe-123',
  recipeName: 'Tomatensoße'
}
```

### Abwärtskompatibilität / Backward Compatibility

- Bestehende Rezepte mit Text-Zutaten funktionieren weiterhin
- Die neue Funktion ist vollständig abwärtskompatibel
- Existing recipes with text ingredients continue to work
- The new feature is fully backward compatible

### Portionen skalieren / Scaling Portions

- Text-Zutaten werden automatisch skaliert, wenn Portionen geändert werden
- Rezept-Zutaten werden **nicht** skaliert
- Bereiten Sie das verlinkte Rezept mit den eigenen Portionseinstellungen zu
- Text ingredients are automatically scaled when portions are changed
- Recipe ingredients are **not** scaled
- Prepare the linked recipe using its own portion settings

## Beispiel / Example

### Szenario: Pizza mit Tomatensoße

**Tomatensoße** (Eigenständiges Rezept):
- Zutaten: 500g Tomaten, 2 Knoblauchzehen, Olivenöl
- Portionen: 2

**Pizza** (Verwendet Tomatensoße als Zutat):
- Zutaten:
  - 400g Mehl (Text-Zutat)
  - 200ml Wasser (Text-Zutat)
  - 📖 Tomatensoße (Rezept-Zutat - verlinkt zum Tomatensoße-Rezept)
  - 200g Mozzarella (Text-Zutat)
- Portionen: 4

Wenn Sie auf "📖 Tomatensoße" klicken, öffnet sich das Tomatensoße-Rezept. Der Zurück-Button bringt Sie zurück zur Pizza.

## Hinweise / Notes

- Sie können nicht ein Rezept zu sich selbst verlinken (Selbstreferenz wird verhindert)
- Rezept-Zutaten zeigen immer den aktuellen Namen des verlinkten Rezepts
- Wenn ein verlinktes Rezept gelöscht wird, wird der gespeicherte Name angezeigt
- You cannot link a recipe to itself (self-reference is prevented)
- Recipe ingredients always show the current name of the linked recipe
- If a linked recipe is deleted, the stored name is displayed
