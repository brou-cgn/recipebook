# Zwischenüberschriften Feature - Visual Guide

## Overview
This feature allows users to add intermediate headings (Zwischenüberschriften) in ingredient lists and preparation steps to better organize complex recipes.

## Form View (RecipeForm)

### Regular Ingredient Item
```
┌─────────────────────────────────────────────────────┐
│ [⋮⋮] [ 200g Mehl                    ] [H] [✕]      │
└─────────────────────────────────────────────────────┘
  │      │                               │   │
  │      └─ Input field                  │   └─ Remove button
  │                                      │
  └─ Drag handle                         └─ Toggle to heading button
```

### Heading Item (After clicking H button)
```
┌─────────────────────────────────────────────────────┐
│ ╔═══════════════════════════════════════════════╗   │
│ ║ [⋮⋮] [ Für den Teig            ] [¶] [✕]     ║   │
│ ╚═══════════════════════════════════════════════╝   │
└─────────────────────────────────────────────────────┘
  │      │                               │   │
  │      └─ Bold input, larger font      │   └─ Remove button
  │                                      │
  └─ Drag handle                         └─ Toggle back to ingredient
```

**Visual Styling:**
- Gray gradient background
- Bold, larger text (1.1rem)
- Darker border color
- "¶" symbol on toggle button (instead of "H")

### Step Items with Heading

```
Regular Step:
┌─────────────────────────────────────────────────────┐
│ [⋮⋮] [1.] [ Mehl sieben              ] [H] [✕]     │
└─────────────────────────────────────────────────────┘

Heading:
┌─────────────────────────────────────────────────────┐
│ ╔═══════════════════════════════════════════════╗   │
│ ║ [⋮⋮] [ Vorbereitung           ] [¶] [✕]      ║   │
│ ╚═══════════════════════════════════════════════╝   │
└─────────────────────────────────────────────────────┘

Next Step (numbering continues correctly):
┌─────────────────────────────────────────────────────┐
│ [⋮⋮] [2.] [ Milch hinzufügen         ] [H] [✕]     │
└─────────────────────────────────────────────────────┘
```

Note: Step numbers skip headings - they only count actual steps.

## Detail View (RecipeDetail)

### Ingredients with Headings
```
Zutaten (5)

Für den Teig                    <- Heading: Bold, larger, no bullet
• 200g Mehl                     <- Regular ingredient
• 100ml Milch
• 2 Eier

Für die Soße                    <- Another heading
• 50g Butter
```

### Steps with Headings
```
Zubereitungsschritte

Vorbereitung                    <- Heading: Bold, larger, no number
1. Ofen auf 180°C vorheizen    <- Steps numbered correctly
2. Mehl sieben

Teig herstellen                 <- Another heading
3. Milch und Eier vermengen    <- Numbering continues
4. Mehl unterrühren
```

## CSS Classes

### Form Styles
- `.heading-item` - Gray gradient background wrapper
- `.heading-input` - Bold, larger text input
- `.toggle-type-button` - Brown button for toggling

### Detail View Styles
- `.ingredient-heading` - Bold heading in ingredient list
- `.step-heading` - Bold heading in steps list

## Data Structure

### Storage Format (with headings)
```json
{
  "ingredients": [
    { "type": "heading", "text": "Für den Teig" },
    { "type": "ingredient", "text": "200g Mehl" },
    { "type": "ingredient", "text": "100ml Milch" }
  ],
  "steps": [
    { "type": "heading", "text": "Vorbereitung" },
    { "type": "step", "text": "Ofen vorheizen" },
    { "type": "step", "text": "Mehl sieben" }
  ]
}
```

### Storage Format (without headings - backward compatible)
```json
{
  "ingredients": [
    "200g Mehl",
    "100ml Milch"
  ],
  "steps": [
    "Ofen vorheizen",
    "Mehl sieben"
  ]
}
```

## User Workflow

1. **Add a new ingredient/step** using the "+ Zutat hinzufügen" button
2. **Convert to heading** by clicking the "H" button
3. **Edit the heading text** in the input field
4. **Reorder** by dragging the ⋮⋮ handle
5. **Convert back** by clicking the "¶" button on a heading
6. **Save** the recipe - headings are preserved

## Backward Compatibility

- **Old recipes** (string arrays) are automatically converted to object format in memory
- **Saving without headings** uses the old string format for compatibility
- **Saving with headings** uses the new object format
- All existing recipes work without modification
