import React, { useState, useEffect, useMemo } from 'react';
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

  // Kulinariktypen state
  const [cuisineProposals, setCuisineProposals] = useState([]);
  const [cuisineGroups, setCuisineGroups] = useState([]);
  const [newCuisineName, setNewCuisineName] = useState('');
  const [newCuisineGroup, setNewCuisineGroup] = useState('');
  const [newCuisineDuplicateError, setNewCuisineDuplicateError] = useState(false);
  const [editingProposalId, setEditingProposalId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingGroup, setEditingGroup] = useState('');
  const [cuisineLoading, setCuisineLoading] = useState(false);
  const [releasingId, setReleasingId] = useState(null);

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
    // Load cuisine data (groups + proposals)
    getCustomLists().then((lists) => {
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

      // Add to the main cuisineTypes list and optionally to a cuisineGroup
      const lists = await getCustomLists();
      const updatedTypes = lists.cuisineTypes.some(t => t.toLowerCase() === proposal.name.toLowerCase())
        ? lists.cuisineTypes
        : [...lists.cuisineTypes, proposal.name];

      let updatedGroups = lists.cuisineGroups || [];
      if (proposal.groupName) {
        updatedGroups = updatedGroups.map(g =>
          g.name === proposal.groupName && !g.children.includes(proposal.name)
            ? { ...g, children: [...g.children, proposal.name] }
            : g
        );
      }

      await saveCustomLists({ cuisineTypes: updatedTypes, cuisineGroups: updatedGroups });

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
      <div className="app-calls-tabs">
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
                        <th>E-Mail</th>
                        <th>Art</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appCalls.map((call) => (
                        <tr key={call.id}>
                          <td>
                            {call.timestamp?.toDate
                              ? call.timestamp.toDate().toLocaleString('de-DE')
                              : '–'}
                          </td>
                          <td>{call.userVorname}</td>
                          <td>{call.userNachname}</td>
                          <td>{call.userEmail}</td>
                          <td>{call.isGuest ? 'Gast' : 'Angemeldet'}</td>
                        </tr>
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
                        <th>E-Mail</th>
                        <th>Art</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipeCalls.map((call) => (
                        <tr key={call.id}>
                          <td>
                            {call.timestamp?.toDate
                              ? call.timestamp.toDate().toLocaleString('de-DE')
                              : '–'}
                          </td>
                          <td>{call.recipeTitle}</td>
                          <td>{call.userVorname}</td>
                          <td>{call.userNachname}</td>
                          <td>{call.userEmail}</td>
                          <td>{call.isGuest ? 'Gast' : 'Angemeldet'}</td>
                        </tr>
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
            <p className="app-calls-info-text">
              Hier können neue Kulinariktypen angelegt, bestehenden Kulinarikgruppen zugeordnet und bearbeitet werden.
              Freigegebene Kulinariktypen werden in der Hauptliste der Einstellungen ergänzt und erscheinen nicht mehr hier.
            </p>
            <div className="cuisine-proposal-form">
              <input
                type="text"
                className="cuisine-proposal-input"
                value={newCuisineName}
                onChange={(e) => { setNewCuisineName(e.target.value); setNewCuisineDuplicateError(false); }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCuisineProposal()}
                placeholder="Neuen Kulinariktyp eingeben…"
                aria-label="Name des neuen Kulinariktyps"
              />
              <select
                className="cuisine-proposal-group-select"
                value={newCuisineGroup}
                onChange={(e) => setNewCuisineGroup(e.target.value)}
                aria-label="Kulinarikgruppe auswählen"
              >
                <option value="">Keine Gruppe</option>
                {cuisineGroups.map(g => (
                  <option key={g.name} value={g.name}>{g.name}</option>
                ))}
              </select>
              <button
                className="app-calls-share-btn"
                onClick={handleAddCuisineProposal}
                disabled={cuisineLoading || !newCuisineName.trim()}
              >
                Hinzufügen
              </button>
            </div>
            {newCuisineDuplicateError && (
              <p className="cuisine-proposal-duplicate-error">
                Dieser Kulinariktyp ist bereits in der Liste vorhanden.
              </p>
            )}
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
          </>
        )}
      </div>
    </div>
  );
}

export default AppCallsPage;
