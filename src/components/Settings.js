import React, { useState, useEffect } from 'react';
import './Settings.css';
import { getCustomLists, saveCustomLists, resetCustomLists } from '../utils/customLists';
import { 
  getUsers, 
  getAdminCount, 
  isCurrentUserAdmin, 
  updateUserRole,
  deleteUser,
  ROLES,
  getRoleDisplayName
} from '../utils/userManagement';

function Settings({ onBack, currentUser }) {
  const [lists, setLists] = useState({
    cuisineTypes: [],
    mealCategories: [],
    units: []
  });
  const [newCuisine, setNewCuisine] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' }); // 'success' or 'error'
  const [activeTab, setActiveTab] = useState('lists'); // 'lists' or 'users'
  const isAdmin = isCurrentUserAdmin();

  // Cleanup timeout on unmount
  useEffect(() => {
    let timeoutId;
    if (message.text) {
      timeoutId = setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [message.text]);

  useEffect(() => {
    setLists(getCustomLists());
    if (isAdmin) {
      setUsers(getUsers());
    }
  }, [isAdmin]);

  const handleSave = () => {
    saveCustomLists(lists);
    alert('Einstellungen erfolgreich gespeichert!');
  };

  const handleReset = () => {
    if (window.confirm('Möchten Sie wirklich alle Listen auf die Standardwerte zurücksetzen?')) {
      const defaultLists = resetCustomLists();
      setLists(defaultLists);
      alert('Listen auf Standardwerte zurückgesetzt!');
    }
  };

  const addCuisine = () => {
    if (newCuisine.trim() && !lists.cuisineTypes.includes(newCuisine.trim())) {
      setLists({
        ...lists,
        cuisineTypes: [...lists.cuisineTypes, newCuisine.trim()]
      });
      setNewCuisine('');
    }
  };

  const removeCuisine = (cuisine) => {
    setLists({
      ...lists,
      cuisineTypes: lists.cuisineTypes.filter(c => c !== cuisine)
    });
  };

  const addCategory = () => {
    if (newCategory.trim() && !lists.mealCategories.includes(newCategory.trim())) {
      setLists({
        ...lists,
        mealCategories: [...lists.mealCategories, newCategory.trim()]
      });
      setNewCategory('');
    }
  };

  const removeCategory = (category) => {
    setLists({
      ...lists,
      mealCategories: lists.mealCategories.filter(c => c !== category)
    });
  };

  const addUnit = () => {
    if (newUnit.trim() && !lists.units.includes(newUnit.trim())) {
      setLists({
        ...lists,
        units: [...lists.units, newUnit.trim()]
      });
      setNewUnit('');
    }
  };

  const removeUnit = (unit) => {
    setLists({
      ...lists,
      units: lists.units.filter(u => u !== unit)
    });
  };

  const handleRoleChange = (userId, newRole) => {
    const result = updateUserRole(userId, newRole);
    
    if (result.success) {
      setUsers(getUsers());
      setMessage({ text: result.message, type: 'success' });
    } else {
      setMessage({ text: result.message, type: 'error' });
    }
  };

  const handleDeleteUser = (userId, userName) => {
    if (window.confirm(`Möchten Sie den Benutzer "${userName}" wirklich löschen?`)) {
      const result = deleteUser(userId);
      
      if (result.success) {
        setUsers(getUsers());
        setMessage({ text: result.message, type: 'success' });
      } else {
        setMessage({ text: result.message, type: 'error' });
      }
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h2>Einstellungen</h2>
      </div>

      {isAdmin && (
        <div className="settings-tabs">
          <button
            className={`tab-button ${activeTab === 'lists' ? 'active' : ''}`}
            onClick={() => setActiveTab('lists')}
          >
            Listen & Kategorien
          </button>
          <button
            className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Benutzerverwaltung
          </button>
        </div>
      )}

      <div className="settings-content">
        {activeTab === 'lists' ? (
          <>
            <div className="settings-section">
          <h3>Kulinarik-Typen</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCuisine}
              onChange={(e) => setNewCuisine(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCuisine()}
              placeholder="Neuen Kulinarik-Typ hinzufügen..."
            />
            <button onClick={addCuisine}>Hinzufügen</button>
          </div>
          <div className="list-items">
            {lists.cuisineTypes.map((cuisine) => (
              <div key={cuisine} className="list-item">
                <span>{cuisine}</span>
                <button
                  className="remove-btn"
                  onClick={() => removeCuisine(cuisine)}
                  title="Entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Speisekategorien</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              placeholder="Neue Speisekategorie hinzufügen..."
            />
            <button onClick={addCategory}>Hinzufügen</button>
          </div>
          <div className="list-items">
            {lists.mealCategories.map((category) => (
              <div key={category} className="list-item">
                <span>{category}</span>
                <button
                  className="remove-btn"
                  onClick={() => removeCategory(category)}
                  title="Entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Maßeinheiten</h3>
          <div className="list-input">
            <input
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addUnit()}
              placeholder="Neue Einheit hinzufügen..."
            />
            <button onClick={addUnit}>Hinzufügen</button>
          </div>
          <div className="list-items">
            {lists.units.map((unit) => (
              <div key={unit} className="list-item">
                <span>{unit}</span>
                <button
                  className="remove-btn"
                  onClick={() => removeUnit(unit)}
                  title="Entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-actions">
          <button className="reset-button" onClick={handleReset}>
            Auf Standard zurücksetzen
          </button>
          <button className="save-button" onClick={handleSave}>
            Einstellungen speichern
          </button>
        </div>
      </>
        ) : (
          <>
            {message.text && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}
            <p className="info-text">
              Hier können Sie alle registrierten Benutzerkonten einsehen, Berechtigungen verwalten und Benutzer löschen.
              <br /><br />
              <strong>Berechtigungsgruppen:</strong>
              <br />• <strong>Administrator:</strong> Volle Rechte inkl. Benutzerverwaltung und Rezepte löschen
              <br />• <strong>Bearbeiten:</strong> Kann Rezepte erstellen und bearbeiten
              <br />• <strong>Kommentieren:</strong> Aktuell nur Leserechte (zukünftig zusätzliche Rechte)
              <br />• <strong>Lesen:</strong> Nur Leserechte
            </p>
            
            {users.length === 0 ? (
              <div className="empty-state">
                <p>Keine Benutzer vorhanden.</p>
              </div>
            ) : (
              <div className="users-table-container">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Vorname</th>
                      <th>Nachname</th>
                      <th>E-Mail</th>
                      <th>Registriert am</th>
                      <th>Berechtigung</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className={user.id === currentUser?.id ? 'current-user' : ''}>
                        <td>{user.vorname}</td>
                        <td>{user.nachname}</td>
                        <td>{user.email}</td>
                        <td>{new Date(user.createdAt).toLocaleDateString('de-DE')}</td>
                        <td>
                          <select
                            className="role-select"
                            value={user.role || (user.isAdmin ? ROLES.ADMIN : ROLES.READ)}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          >
                            <option value={ROLES.ADMIN}>{getRoleDisplayName(ROLES.ADMIN)}</option>
                            <option value={ROLES.EDIT}>{getRoleDisplayName(ROLES.EDIT)}</option>
                            <option value={ROLES.COMMENT}>{getRoleDisplayName(ROLES.COMMENT)}</option>
                            <option value={ROLES.READ}>{getRoleDisplayName(ROLES.READ)}</option>
                          </select>
                        </td>
                        <td>
                          <button
                            className="delete-user-btn"
                            onClick={() => handleDeleteUser(user.id, `${user.vorname} ${user.nachname}`)}
                            title="Benutzer löschen"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            <div className="user-stats">
              <div className="stat-item">
                <strong>Gesamt:</strong> {users.length} Benutzer
              </div>
              <div className="stat-item">
                <strong>Administratoren:</strong> {getAdminCount()}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Settings;
