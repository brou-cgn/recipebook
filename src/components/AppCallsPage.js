import React, { useState, useEffect, useMemo, useRef } from 'react';
import './AppCallsPage.css';
import { getAppCalls } from '../utils/appCallsFirestore';
import { getRecipeCalls } from '../utils/recipeCallsFirestore';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference, getCustomLists, saveCustomLists } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { enableRecipeSharing } from '../utils/recipeFirestore';
import {
  getCuisineProposals,
  addCuisineProposal,
  updateCuisineProposal,
  releaseCuisineProposal,
} from '../utils/cuisineProposalsFirestore';

function CuisineTypeListItem({ label, onRemove, onRename }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);

  const handleEditStart = () => {
    setEditValue(label);
    setIsEditing(true);
  };

  const handleEditConfirm = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== label && onRename) {
      onRename(label, trimmed);
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') handleEditConfirm();
    else if (e.key === 'Escape') setIsEditing(false);
  };

  return (
    <div className="list-item">
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditConfirm}
          onKeyDown={handleEditKeyDown}
          autoFocus
          className="list-item-edit-input"
          aria-label="Kulinariktyp umbenennen"
        />
      ) : (
        <span>{label}</span>
      )}
      {onRename && !isEditing && (
        <button className="edit-btn" onClick={handleEditStart} title="Umbenennen">✎</button>
      )}
      <button className="remove-btn" onClick={onRemove} title="Entfernen">×</button>
    </div>
  );
}

function AppCallsPage({ onBack, currentUser, recipes = [], onUpdateRecipe }) {
  const [appCalls, setAppCalls] = useState([]);
  const [recipeCalls, setRecipeCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('app');
  const [closeIcon, setCloseIcon] = useState(DEFAULT_BUTTON_ICONS.privateListBack);
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [creatingShareIds, setCreatingShareIds] = useState({});
  const [sharedRecipeIds, setSharedRecipeIds] = useState(new Set());
  const [shareLinkErrors, setShareLinkErrors] = useState({});
  const [abortingCalcId, setAbortingCalcId] = useState(null);
  const [expandedAppCallId, setExpandedAppCallId] = useState(null);
  const [expandedRecipeCallId, setExpandedRecipeCallId] = useState(null);
  const tabsRef = useRef(null);

  // Kulinariktypen state
  const [cuisineProposals, setCuisineProposals] = useState([]);
  const [cuisineTypes, setCuisineTypes] = useState([]);
  const [cuisineGroups, setCuisineGroups] = useState([]);
  const [newCuisineName, setNewCuisineName] = useState('');
  const [newCuisineGroup, setNewCuisineGroup] = useState('');
  const [newCuisineDuplicateError, setNewCuisineDuplicateError] = useState(false);
  const [editingProposalId, setEditingProposalId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingGroup, setEditingGroup] = useState('');
  const [cuisineLoading, setCuisineLoading] = useState(false);
  const [releasingId, setReleasingId] = useState(null);

  // Cuisine list management state
  const [newCuisineTypeName, setNewCuisineTypeName] = useState('');
  const [newCuisineGroupName, setNewCuisineGroupName] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const [fetchedAppCalls, fetchedRecipeCalls] = await Promise.all([getAppCalls(), getRecipeCalls()]);
      setAppCalls(fetchedAppCalls);
      setRecipeCalls(fetchedRecipeCalls);
      setLoading(false);
    };
    loadData();
    getButtonIcons().then((icons) => {
      setAllButtonIcons(icons);
    });
    // Load cuisine data (types + groups + proposals)
    getCustomLists().then((lists) => {
      setCuisineTypes(lists.cuisineTypes || []);
      setCuisineGroups(lists.cuisineGroups || []);
    }).catch(() => {});
    getCuisineProposals().then((proposals) => {
      setCuisineProposals(proposals);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setCloseIcon(getEffectiveIcon(allButtonIcons, 'privateListBack', isDarkMode) || DEFAULT_BUTTON_ICONS.privateListBack);
  }, [allButtonIcons, isDarkMode]);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  const recipesWithoutLink = useMemo(
    () => recipes.filter(r => r.publishedToPublic && !r.shareId && !sharedRecipeIds.has(r.id)),
    [recipes, sharedRecipeIds]
  );

  const handleCreateShareLink = async (recipe) => {
    setCreatingShareIds(prev => ({ ...prev, [recipe.id]: true }));
    setShareLinkErrors(prev => ({ ...prev, [recipe.id]: null }));
    try {
      await enableRecipeSharing(recipe.id);
      setSharedRecipeIds(prev => new Set([...Array.from(prev), recipe.id]));
    } catch (err) {
      console.error('Error creating share link:', err);
      setShareLinkErrors(prev => ({ ...prev, [recipe.id]: 'Fehler beim Erstellen des Links.' }));
    } finally {
      setCreatingShareIds(prev => ({ ...prev, [recipe.id]: false }));
    }
  };

  const handleAbortCalcForRecipe = async (recipe) => {
    if (!onUpdateRecipe) return;
    setAbortingCalcId(recipe.id);
    try {
      await onUpdateRecipe(recipe.id, {
        naehrwerte: {
          ...(recipe.naehrwerte || {}),
          calcPending: false,
          calcError: 'Berechnung abgebrochen',
        },
      });
    } catch (err) {
      console.error('Error aborting calculation:', err);
    } finally {
      setAbortingCalcId(null);
    }
  };

  const handleAddCuisineProposal = async () => {
    const name = newCuisineName.trim();
    if (!name) return;
    if (cuisineProposals.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      setNewCuisineDuplicateError(true);
      return;
    }
    setNewCuisineDuplicateError(false);
    setCuisineLoading(true);
    try {
      const id = await addCuisineProposal({
        name,
        groupName: newCuisineGroup || null,
        createdBy: currentUser?.id || '',
        source: 'manual',
      });
      setCuisineProposals(prev => [
        {
          id,
          name,
          groupName: newCuisineGroup || null,
          released: false,
          createdBy: currentUser?.id || '',
          createdAt: null,
          source: 'manual',
        },
        ...prev,
      ]);
      setNewCuisineName('');
      setNewCuisineGroup('');
    } catch (err) {
      console.error('Error adding cuisine proposal:', err);
    } finally {
      setCuisineLoading(false);
    }
  };

  const handleStartEdit = (proposal) => {
    setEditingProposalId(proposal.id);
    setEditingName(proposal.name);
    setEditingGroup(proposal.groupName || '');
  };

  const handleCancelEdit = () => {
    setEditingProposalId(null);
    setEditingName('');
    setEditingGroup('');
  };

  const handleSaveEdit = async (proposalId) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateCuisineProposal(proposalId, { name, groupName: editingGroup || null });
      setCuisineProposals(prev =>
        prev.map(p => p.id === proposalId ? { ...p, name, groupName: editingGroup || null } : p)
      );
      handleCancelEdit();
    } catch (err) {
      console.error('Error updating cuisine proposal:', err);
    }
  };

  const handleRelease = async (proposal) => {
    setReleasingId(proposal.id);
    try {
      // Mark proposal as released in Firestore
      await releaseCuisineProposal(proposal.id);

      // The name originally added to cuisineTypes (may differ if the proposal was renamed)
      const originalName = proposal.originalName || proposal.name;
      const wasRenamed = originalName.toLowerCase() !== proposal.name.toLowerCase();

      // Normalize a recipe's kulinarik field to an array
      const toKulinarikArray = (kulinarik) =>
        Array.isArray(kulinarik) ? kulinarik : kulinarik ? [kulinarik] : [];

      // Add to the main cuisineTypes list and optionally to a cuisineGroup
      const lists = await getCustomLists();
      let updatedTypes;
      if (wasRenamed && lists.cuisineTypes.some(t => t.toLowerCase() === originalName.toLowerCase())) {
        // Replace the original name with the new name in the types list
        updatedTypes = lists.cuisineTypes.map(t =>
          t.toLowerCase() === originalName.toLowerCase() ? proposal.name : t
        );
      } else {
        updatedTypes = lists.cuisineTypes.some(t => t.toLowerCase() === proposal.name.toLowerCase())
          ? lists.cuisineTypes
          : [...lists.cuisineTypes, proposal.name];
      }

      let updatedGroups = lists.cuisineGroups || [];
      if (proposal.groupName) {
        updatedGroups = updatedGroups.map(g => {
          if (g.name !== proposal.groupName) return g;
          // Replace originalName with new name (or just add if not present)
          const filteredChildren = wasRenamed
            ? g.children.filter(c => c.toLowerCase() !== originalName.toLowerCase())
            : g.children;
          return !filteredChildren.some(c => c.toLowerCase() === proposal.name.toLowerCase())
            ? { ...g, children: [...filteredChildren, proposal.name] }
            : { ...g, children: filteredChildren };
        });
      } else if (wasRenamed) {
        // Update originalName → new name inside any group children
        updatedGroups = updatedGroups.map(g => ({
          ...g,
          children: g.children.map(c =>
            c.toLowerCase() === originalName.toLowerCase() ? proposal.name : c
          ),
        }));
      }

      await saveCustomLists({ cuisineTypes: updatedTypes, cuisineGroups: updatedGroups });

      // Propagate rename to all recipes that reference the original name
      if (wasRenamed && onUpdateRecipe) {
        const affectedRecipes = recipes.filter(r =>
          toKulinarikArray(r.kulinarik).some(k => k.toLowerCase() === originalName.toLowerCase())
        );
        for (const recipe of affectedRecipes) {
          const updatedKulinarik = toKulinarikArray(recipe.kulinarik).map(k =>
            k.toLowerCase() === originalName.toLowerCase() ? proposal.name : k
          );
          await onUpdateRecipe(recipe.id, { kulinarik: updatedKulinarik });
        }
      }

      // Remove released proposal from local state
      setCuisineProposals(prev => prev.filter(p => p.id !== proposal.id));
    } catch (err) {
      console.error('Error releasing cuisine proposal:', err);
    } finally {
      setReleasingId(null);
    }
  };

  const renderSourceBadge = (source) => {
    if (source === 'recipe_form') {
      return <span className="cuisine-proposal-source-badge cuisine-proposal-source-recipe">Rezept-Formular</span>;
    }
    return <span className="cuisine-proposal-source-badge cuisine-proposal-source-manual">Manuell</span>;
  };

  // Cuisine list management helpers
  const saveCuisineLists = async (updatedTypes, updatedGroups) => {
    try {
      await saveCustomLists({ cuisineTypes: updatedTypes, cuisineGroups: updatedGroups });
    } catch (err) {
      console.error('Error saving cuisine lists:', err);
    }
  };

  const handleAddCuisineType = async () => {
    const name = newCuisineTypeName.trim();
    if (!name || cuisineTypes.some(t => t.toLowerCase() === name.toLowerCase())) return;
    const updated = [...cuisineTypes, name];
    setCuisineTypes(updated);
    setNewCuisineTypeName('');
    await saveCuisineLists(updated, cuisineGroups);
  };

  const handleRemoveCuisineType = async (typeLabel) => {
    const updatedTypes = cuisineTypes.filter(t => t !== typeLabel);
    const updatedGroups = cuisineGroups.map(g => ({
      ...g,
      children: g.children.filter(c => c !== typeLabel),
    }));
    setCuisineTypes(updatedTypes);
    setCuisineGroups(updatedGroups);
    await saveCuisineLists(updatedTypes, updatedGroups);
  };

  const handleRenameCuisineType = async (oldLabel, newLabel) => {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === oldLabel) return;
    const updatedTypes = cuisineTypes.map(t => t === oldLabel ? trimmed : t);
    const updatedGroups = cuisineGroups.map(g => ({
      ...g,
      children: g.children.map(c => c === oldLabel ? trimmed : c),
    }));
    setCuisineTypes(updatedTypes);
    setCuisineGroups(updatedGroups);
    await saveCuisineLists(updatedTypes, updatedGroups);
  };

  const handleAddCuisineGroup = async () => {
    const name = newCuisineGroupName.trim();
    if (!name || cuisineGroups.some(g => g.name === name)) return;
    const updated = [...cuisineGroups, { name, children: [] }];
    setCuisineGroups(updated);
    setNewCuisineGroupName('');
    await saveCuisineLists(cuisineTypes, updated);
  };

  const handleRemoveCuisineGroup = async (groupName) => {
    const updated = cuisineGroups.filter(g => g.name !== groupName);
    setCuisineGroups(updated);
    await saveCuisineLists(cuisineTypes, updated);
  };

  const handleAddChildToGroup = async (groupName, childName) => {
    const updated = cuisineGroups.map(g =>
      g.name === groupName && !g.children.includes(childName)
        ? { ...g, children: [...g.children, childName] }
        : g
    );
    setCuisineGroups(updated);
    await saveCuisineLists(cuisineTypes, updated);
  };

  const handleRemoveChildFromGroup = async (groupName, childName) => {
    const updated = cuisineGroups.map(g =>
      g.name === groupName
        ? { ...g, children: g.children.filter(c => c !== childName) }
        : g
    );
    setCuisineGroups(updated);
    await saveCuisineLists(cuisineTypes, updated);
  };

  if (!currentUser?.appCalls) {
    return (
      <div className="app-calls-container">
        <div className="app-calls-header">
          <h2>Küchenbetrieb</h2>
          <button
            className="group-list-close-btn"
            onClick={onBack}
            aria-label="Schließen"
            title="Schließen"
          >
            {isBase64Image(closeIcon) ? (
              <img src={closeIcon} alt="Schließen" className="group-list-close-icon-img" />
            ) : (
              <span>{closeIcon}</span>
            )}
          </button>
        </div>
        <div className="app-calls-content">
          <p className="app-calls-info-text">
            Sie haben keine Berechtigung, diese Seite aufzurufen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-calls-container">
      <div className="app-calls-header">
        <h2>Küchenbetrieb</h2>
        <button
          className="group-list-close-btn"
          onClick={onBack}
          aria-label="Schließen"
          title="Schließen"
        >
          {isBase64Image(closeIcon) ? (
            <img src={closeIcon} alt="Schließen" className="group-list-close-icon-img" />
          ) : (
            <span>{closeIcon}</span>
          )}
        </button>
      </div>
      <div className="app-calls-tabs" ref={tabsRef}>
        <button
          className={`app-calls-tab${activeTab === 'app' ? ' active' : ''}`}
          onClick={() => setActiveTab('app')}
        >
          App-Aufrufe
        </button>
        <button
          className={`app-calls-tab${activeTab === 'recipe' ? ' active' : ''}`}
          onClick={() => setActiveTab('recipe')}
        >
          Rezeptaufrufe
        </button>
        <button
          className={`app-calls-tab${activeTab === 'nolink' ? ' active' : ''}`}
          onClick={() => setActiveTab('nolink')}
        >
          Rezepte ohne Link
        </button>
        <button
          className={`app-calls-tab${activeTab === 'naehrwert' ? ' active' : ''}`}
          onClick={() => setActiveTab('naehrwert')}
        >
          Nährwertberechnungen
        </button>
        <button
          className={`app-calls-tab${activeTab === 'kulinariktypen' ? ' active' : ''}`}
          onClick={() => setActiveTab('kulinariktypen')}
        >
          Kulinariktypen
        </button>
      </div>
      <div className="app-calls-content">
        {activeTab === 'app' ? (
          <>
            <p className="app-calls-info-text">
              Hier sind alle Appaufrufe gemeinsam mit den zugehörigen Anwendern dokumentiert.
              Diese Übersicht dient der Nachvollziehbarkeit und kann für Auditing- oder Supportzwecke
              herangezogen werden.
            </p>
            {loading ? (
              <div className="app-calls-empty">Laden...</div>
            ) : appCalls.length === 0 ? (
              <div className="app-calls-empty">Noch keine Appaufrufe vorhanden.</div>
            ) : (
              <>
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Datum &amp; Uhrzeit</th>
                        <th>Vorname</th>
                        <th>Nachname</th>
                        <th className="app-calls-col-desktop">E-Mail</th>
                        <th className="app-calls-col-desktop">Art</th>
                        <th className="app-calls-col-mobile">Info</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appCalls.map((call) => (
                        <React.Fragment key={call.id}>
                          <tr>
                            <td>
                              {call.timestamp?.toDate
                                ? call.timestamp.toDate().toLocaleString('de-DE')
                                : '–'}
                            </td>
                            <td>{call.userVorname}</td>
                            <td>{call.userNachname}</td>
                            <td className="app-calls-col-desktop">{call.userEmail}</td>
                            <td className="app-calls-col-desktop">{call.isGuest ? 'Gast' : 'Angemeldet'}</td>
                            <td className="app-calls-col-mobile">
                              <button
                                className={`app-calls-info-btn${expandedAppCallId === call.id ? ' active' : ''}`}
                                onClick={() => setExpandedAppCallId(expandedAppCallId === call.id ? null : call.id)}
                                aria-label="Details anzeigen"
                                title="Details anzeigen"
                              >
                                ⓘ
                              </button>
                            </td>
                          </tr>
                          {expandedAppCallId === call.id && (
                            <tr className="app-calls-detail-row">
                              <td colSpan={6}>
                                <div className="app-calls-detail-content">
                                  <span><strong>E-Mail:</strong> {call.userEmail || '–'}</span>
                                  <span><strong>Art:</strong> {call.isGuest ? 'Gast' : 'Angemeldet'}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-calls-stats">
                  Gesamt: <strong>{appCalls.length}</strong> Einträge
                </div>
              </>
            )}
          </>
        ) : activeTab === 'recipe' ? (
          <>
            <p className="app-calls-info-text">
              Hier werden alle Rezeptaufrufe mit den zugehörigen Anwendern und Rezepten protokolliert.
              Diese Übersicht ermöglicht die Auswertung, welche Rezepte wie häufig aufgerufen werden.
            </p>
            {loading ? (
              <div className="app-calls-empty">Laden...</div>
            ) : recipeCalls.length === 0 ? (
              <div className="app-calls-empty">Noch keine Rezeptaufrufe vorhanden.</div>
            ) : (
              <>
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Datum &amp; Uhrzeit</th>
                        <th>Rezept</th>
                        <th>Vorname</th>
                        <th>Nachname</th>
                        <th className="app-calls-col-desktop">E-Mail</th>
                        <th className="app-calls-col-desktop">Art</th>
                        <th className="app-calls-col-mobile">Info</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipeCalls.map((call) => (
                        <React.Fragment key={call.id}>
                          <tr>
                            <td>
                              {call.timestamp?.toDate
                                ? call.timestamp.toDate().toLocaleString('de-DE')
                                : '–'}
                            </td>
                            <td>{call.recipeTitle}</td>
                            <td>{call.userVorname}</td>
                            <td>{call.userNachname}</td>
                            <td className="app-calls-col-desktop">{call.userEmail}</td>
                            <td className="app-calls-col-desktop">{call.isGuest ? 'Gast' : 'Angemeldet'}</td>
                            <td className="app-calls-col-mobile">
                              <button
                                className={`app-calls-info-btn${expandedRecipeCallId === call.id ? ' active' : ''}`}
                                onClick={() => setExpandedRecipeCallId(expandedRecipeCallId === call.id ? null : call.id)}
                                aria-label="Details anzeigen"
                                title="Details anzeigen"
                              >
                                ⓘ
                              </button>
                            </td>
                          </tr>
                          {expandedRecipeCallId === call.id && (
                            <tr className="app-calls-detail-row">
                              <td colSpan={7}>
                                <div className="app-calls-detail-content">
                                  <span><strong>E-Mail:</strong> {call.userEmail || '–'}</span>
                                  <span><strong>Art:</strong> {call.isGuest ? 'Gast' : 'Angemeldet'}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-calls-stats">
                  Gesamt: <strong>{recipeCalls.length}</strong> Einträge
                </div>
              </>
            )}
          </>
        ) : activeTab === 'nolink' ? (
          <>
            <p className="app-calls-info-text">
              Hier sind alle öffentlichen Rezepte aufgelistet, die noch keinen Shared Link besitzen.
              Per Klick auf den Button kann ein Shared Link für das jeweilige Rezept erstellt werden.
            </p>
            {recipesWithoutLink.length === 0 ? (
              <div className="app-calls-empty">Alle öffentlichen Rezepte haben bereits einen Shared Link.</div>
            ) : (
              <>
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Rezept</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipesWithoutLink.map((recipe) => (
                        <tr key={recipe.id}>
                          <td>{recipe.title}</td>
                          <td>
                            <button
                              className="app-calls-share-btn"
                              onClick={() => handleCreateShareLink(recipe)}
                              disabled={creatingShareIds[recipe.id]}
                            >
                              {creatingShareIds[recipe.id] ? 'Wird erstellt…' : 'Link erstellen'}
                            </button>
                            {shareLinkErrors[recipe.id] && (
                              <span className="app-calls-share-error">{shareLinkErrors[recipe.id]}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-calls-stats">
                  Gesamt: <strong>{recipesWithoutLink.length}</strong> {recipesWithoutLink.length === 1 ? 'Rezept' : 'Rezepte'} ohne Link
                </div>
              </>
            )}
          </>
        ) : activeTab === 'naehrwert' ? (
          <>
            <p className="app-calls-info-text">
              Übersicht aller Rezepte, bei denen gerade eine Nährwertberechnung läuft. Sie können einzelne Berechnungen hier gezielt abbrechen.
            </p>
            {(() => {
              const pending = recipes.filter(r => r.naehrwerte?.calcPending === true);
              if (pending.length === 0) {
                return <div className="app-calls-empty">Keine aktiven Berechnungen vorhanden.</div>;
              }
              return (
                <>
                  <div className="app-calls-table-container">
                    <table className="app-calls-table">
                      <thead>
                        <tr>
                          <th>Rezept</th>
                          <th>Aktion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pending.map(recipe => (
                          <tr key={recipe.id}>
                            <td>{recipe.titel || recipe.name || recipe.id}</td>
                            <td>
                              <button
                                className="nutrition-abort-settings-button"
                                onClick={() => handleAbortCalcForRecipe(recipe)}
                                disabled={abortingCalcId === recipe.id}
                                title="Berechnung abbrechen"
                              >
                                {abortingCalcId === recipe.id ? 'Wird abgebrochen…' : 'Abbrechen'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="app-calls-stats">
                    Gesamt: <strong>{pending.length}</strong> {pending.length === 1 ? 'aktive Berechnung' : 'aktive Berechnungen'}
                  </div>
                </>
              );
            })()}
          </>
        ) : (
          <>
            {/* Kulinarik-Typen section */}
            <div className="settings-section">
              <h3>Kulinarik-Typen</h3>
              <div className="list-input">
                <input
                  type="text"
                  value={newCuisineTypeName}
                  onChange={(e) => setNewCuisineTypeName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCuisineType()}
                  placeholder="Neuen Kulinarik-Typ hinzufügen..."
                  aria-label="Neuen Kulinarik-Typ eingeben"
                />
                <button onClick={handleAddCuisineType}>Hinzufügen</button>
              </div>
              <div className="list-items">
                {cuisineTypes.length === 0 ? (
                  <p className="section-description">Noch keine Kulinarik-Typen vorhanden.</p>
                ) : (
                  cuisineTypes.map((type) => (
                    <CuisineTypeListItem
                      key={type}
                      label={type}
                      onRemove={() => handleRemoveCuisineType(type)}
                      onRename={handleRenameCuisineType}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Kulinarik-Gruppen section */}
            <div className="settings-section">
              <h3>Kulinarik-Gruppen</h3>
              <p className="section-description">
                Übergeordnete Kulinariktypen für die Suchfilterung. Untergeordnete Typen müssen aus der Liste der Kulinarik-Typen ausgewählt werden.
              </p>
              <div className="list-input">
                <input
                  type="text"
                  value={newCuisineGroupName}
                  onChange={(e) => setNewCuisineGroupName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCuisineGroup()}
                  placeholder="Neue Gruppe hinzufügen (z.B. Asiatische Küche)..."
                  aria-label="Neue Kulinarik-Gruppe eingeben"
                />
                <button onClick={handleAddCuisineGroup}>Hinzufügen</button>
              </div>
              <div className="list-items">
                {cuisineGroups.length === 0 ? (
                  <p className="section-description">Noch keine Kulinarik-Gruppen vorhanden.</p>
                ) : (
                  cuisineGroups.map(group => (
                    <div key={group.name} className="cuisine-group-item">
                      <div className="cuisine-group-header">
                        <strong>{group.name}</strong>
                        <button
                          className="remove-btn"
                          onClick={() => handleRemoveCuisineGroup(group.name)}
                          title="Gruppe entfernen"
                        >×</button>
                      </div>
                      <div className="cuisine-group-children">
                        {group.children.map(child => (
                          <span key={child} className="cuisine-group-child-tag">
                            {child}
                            <button
                              className="remove-child-btn"
                              onClick={() => handleRemoveChildFromGroup(group.name, child)}
                              title="Untertyp entfernen"
                              aria-label={`${child} aus Gruppe entfernen`}
                            >×</button>
                          </span>
                        ))}
                        <select
                          className="cuisine-group-add-child"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) handleAddChildToGroup(group.name, e.target.value);
                          }}
                          aria-label={`Untertyp zu ${group.name} hinzufügen`}
                        >
                          <option value="">+ Untertyp hinzufügen...</option>
                          {cuisineTypes
                            .filter(c => !group.children.includes(c))
                            .map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Offene Vorschläge section */}
            <div className="settings-section">
              <h3>Offene Vorschläge</h3>
              <p className="app-calls-info-text">
                Hier können neue Kulinariktypen bestehenden Kulinarikgruppen zugeordnet, bearbeitet und freigegeben werden.
                Freigegebene Kulinariktypen werden in der Hauptliste ergänzt und erscheinen nicht mehr hier.
              </p>
              {cuisineProposals.length === 0 ? (
                <div className="app-calls-empty">Keine offenen Kulinariktypen vorhanden.</div>
              ) : (
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Gruppe</th>
                        <th>Quelle</th>
                        <th>Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuisineProposals.map(proposal => (
                        <tr key={proposal.id}>
                          {editingProposalId === proposal.id ? (
                            <>
                              <td>
                                <input
                                  type="text"
                                  className="cuisine-proposal-edit-input"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit(proposal.id);
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                  aria-label="Kulinariktyp Name bearbeiten"
                                  autoFocus
                                />
                              </td>
                              <td>
                                <select
                                  className="cuisine-proposal-group-select"
                                  value={editingGroup}
                                  onChange={(e) => setEditingGroup(e.target.value)}
                                  aria-label="Kulinarikgruppe bearbeiten"
                                >
                                  <option value="">Keine Gruppe</option>
                                  {cuisineGroups.map(g => (
                                    <option key={g.name} value={g.name}>{g.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                {renderSourceBadge(proposal.source)}
                              </td>
                              <td className="cuisine-proposal-actions">
                                <button
                                  className="app-calls-share-btn"
                                  onClick={() => handleSaveEdit(proposal.id)}
                                  disabled={!editingName.trim()}
                                >
                                  Speichern
                                </button>
                                <button
                                  className="cuisine-proposal-cancel-btn"
                                  onClick={handleCancelEdit}
                                >
                                  Abbrechen
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>{proposal.name}</td>
                              <td>{proposal.groupName || <span className="cuisine-proposal-no-group">–</span>}</td>
                              <td>
                                {renderSourceBadge(proposal.source)}
                              </td>
                              <td className="cuisine-proposal-actions">
                                <button
                                  className="cuisine-proposal-edit-btn"
                                  onClick={() => handleStartEdit(proposal)}
                                  title="Kulinariktyp bearbeiten"
                                >
                                  Bearbeiten
                                </button>
                                <button
                                  className="cuisine-proposal-release-btn"
                                  onClick={() => handleRelease(proposal)}
                                  disabled={releasingId === proposal.id}
                                  title="Kulinariktyp freigeben"
                                >
                                  {releasingId === proposal.id ? 'Wird freigegeben…' : '✓ Freigeben'}
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="app-calls-stats">
                Gesamt: <strong>{cuisineProposals.length}</strong> {cuisineProposals.length === 1 ? 'offener Kulinariktyp' : 'offene Kulinariktypen'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AppCallsPage;
