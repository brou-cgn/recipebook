import React, { useState, useEffect } from 'react';
import './UserManagement.css';
import { 
  getUsers, 
  updateUserRole,
  getAdminCount, 
  updateUserName, 
  setTemporaryPassword,
  validatePassword,
  deleteUser,
  ROLES,
  getRoleDisplayName
} from '../utils/userManagement';

function UserManagement({ onBack, currentUser }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' }); // 'success' or 'error'
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ vorname: '', nachname: '' });
  const [passwordResetUser, setPasswordResetUser] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [roleEditUser, setRoleEditUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const users = await getUsers();
    setUsers(users);
  };

  const handleRoleChange = (userId, newRole) => {
    const result = updateUserRole(userId, newRole);
    
    if (result.success) {
      loadUsers();
      setMessage({ text: result.message, type: 'success' });
      setRoleEditUser(null);
      setSelectedRole('');
    } else {
      setMessage({ text: result.message, type: 'error' });
    }
    
    // Clear message after 3 seconds
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleOpenRoleEdit = (user) => {
    setRoleEditUser(user);
    setSelectedRole(user.role);
  };

  const handleCancelRoleEdit = () => {
    setRoleEditUser(null);
    setSelectedRole('');
  };

  const handleDeleteUser = (userId) => {
    const result = deleteUser(userId);
    
    if (result.success) {
      loadUsers();
      setMessage({ text: result.message, type: 'success' });
      setDeleteConfirmUser(null);
    } else {
      setMessage({ text: result.message, type: 'error' });
      setDeleteConfirmUser(null);
    }
    
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleOpenDeleteConfirm = (user) => {
    setDeleteConfirmUser(user);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmUser(null);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditForm({ vorname: user.vorname, nachname: user.nachname });
  };

  const handleSaveEdit = () => {
    const result = updateUserName(editingUser.id, editForm.vorname, editForm.nachname);
    
    if (result.success) {
      loadUsers();
      setMessage({ text: result.message, type: 'success' });
      setEditingUser(null);
      setEditForm({ vorname: '', nachname: '' });
    } else {
      setMessage({ text: result.message, type: 'error' });
    }
    
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditForm({ vorname: '', nachname: '' });
  };

  const handleOpenPasswordReset = (user) => {
    setPasswordResetUser(user);
    setTempPassword('');
    setPasswordError('');
  };

  const handleSetTemporaryPassword = () => {
    // Validate password
    const validation = validatePassword(tempPassword);
    if (!validation.valid) {
      setPasswordError(validation.message);
      return;
    }

    const result = setTemporaryPassword(passwordResetUser.id, tempPassword);
    
    if (result.success) {
      setMessage({ text: result.message, type: 'success' });
      setPasswordResetUser(null);
      setTempPassword('');
      setPasswordError('');
    } else {
      setPasswordError(result.message);
    }
    
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleCancelPasswordReset = () => {
    setPasswordResetUser(null);
    setTempPassword('');
    setPasswordError('');
  };

  return (
    <div className="user-management-container">
      <div className="user-management-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h2>Benutzerverwaltung</h2>
      </div>

      <div className="user-management-content">
        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}
        <p className="info-text">
          Hier können Sie alle registrierten Benutzerkonten einsehen und Berechtigungen verwalten.
        </p>
        
        <div className="permissions-info">
          <h3>Berechtigungshierarchie:</h3>
          <ul>
            <li><strong>Administrator:</strong> Vollzugriff - kann alle Rezepte bearbeiten und löschen, Benutzer verwalten. Beinhaltet alle anderen Berechtigungen.</li>
            <li><strong>Bearbeiten:</strong> Kann eigene Rezepte bearbeiten und kommentieren. Beinhaltet Kommentieren und Lesen.</li>
            <li><strong>Kommentieren:</strong> Kann Rezepte kommentieren (zukünftige Funktion). Beinhaltet Lesen.</li>
            <li><strong>Lesen:</strong> Kann Rezepte nur ansehen.</li>
            <li><strong>Gast:</strong> Temporärer Zugriff nur zum Lesen.</li>
          </ul>
        </div>
        
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
                      <span className={`role-badge role-${user.role}`}>
                        {getRoleDisplayName(user.role)}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button 
                          className="action-btn edit-btn" 
                          onClick={() => handleEditUser(user)}
                          title="Name bearbeiten"
                        >
                          ✏️
                        </button>
                        <button 
                          className="action-btn role-btn" 
                          onClick={() => handleOpenRoleEdit(user)}
                          title="Berechtigung ändern"
                        >
                          🔐
                        </button>
                        <button 
                          className="action-btn password-btn" 
                          onClick={() => handleOpenPasswordReset(user)}
                          title="Temporäres Passwort setzen"
                        >
                          🔑
                        </button>
                        <button 
                          className="action-btn delete-btn" 
                          onClick={() => handleOpenDeleteConfirm(user)}
                          title="Benutzer löschen"
                          disabled={user.id === currentUser?.id}
                        >
                          🗑️
                        </button>
                      </div>
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
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Benutzer bearbeiten</h3>
            <p className="modal-subtitle">
              E-Mail: {editingUser.email}
            </p>
            <div className="form-group">
              <label>Vorname</label>
              <input
                type="text"
                value={editForm.vorname}
                onChange={(e) => setEditForm({ ...editForm, vorname: e.target.value })}
                placeholder="Vorname"
              />
            </div>
            <div className="form-group">
              <label>Nachname</label>
              <input
                type="text"
                value={editForm.nachname}
                onChange={(e) => setEditForm({ ...editForm, nachname: e.target.value })}
                placeholder="Nachname"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={handleCancelEdit}>
                Abbrechen
              </button>
              <button className="btn-save" onClick={handleSaveEdit}>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Edit Modal */}
      {roleEditUser && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Berechtigung ändern</h3>
            <p className="modal-subtitle">
              Benutzer: {roleEditUser.vorname} {roleEditUser.nachname} ({roleEditUser.email})
            </p>
            <p className="modal-info">
              Aktuelle Berechtigung: <strong>{getRoleDisplayName(roleEditUser.role)}</strong>
            </p>
            <div className="form-group">
              <label>Neue Berechtigung</label>
              <select 
                value={selectedRole} 
                onChange={(e) => setSelectedRole(e.target.value)}
                className="role-select"
              >
                {/* GUEST role is not included as it's a temporary role for unauthenticated access */}
                <option value={ROLES.ADMIN}>Administrator</option>
                <option value={ROLES.EDIT}>Bearbeiten</option>
                <option value={ROLES.COMMENT}>Kommentieren</option>
                <option value={ROLES.READ}>Lesen</option>
              </select>
            </div>
            <div className="role-description">
              {selectedRole === ROLES.ADMIN && (
                <p>Vollzugriff - kann alle Rezepte bearbeiten und löschen, Benutzer verwalten.</p>
              )}
              {selectedRole === ROLES.EDIT && (
                <p>Kann eigene Rezepte bearbeiten. Beinhaltet Kommentieren und Lesen.</p>
              )}
              {selectedRole === ROLES.COMMENT && (
                <p>Kann Rezepte kommentieren (zukünftige Funktion). Beinhaltet Lesen.</p>
              )}
              {selectedRole === ROLES.READ && (
                <p>Kann Rezepte nur ansehen.</p>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={handleCancelRoleEdit}>
                Abbrechen
              </button>
              <button 
                className="btn-save" 
                onClick={() => handleRoleChange(roleEditUser.id, selectedRole)}
                disabled={selectedRole === roleEditUser.role}
              >
                Berechtigung ändern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordResetUser && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Temporäres Passwort setzen</h3>
            <p className="modal-subtitle">
              Benutzer: {passwordResetUser.vorname} {passwordResetUser.nachname} ({passwordResetUser.email})
            </p>
            <p className="modal-info">
              Der Benutzer wird beim nächsten Login aufgefordert, ein neues Passwort zu vergeben.
            </p>
            <div className="form-group">
              <label>Temporäres Passwort</label>
              <input
                type="text"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
              />
              {passwordError && (
                <div className="field-error">{passwordError}</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={handleCancelPasswordReset}>
                Abbrechen
              </button>
              <button className="btn-save" onClick={handleSetTemporaryPassword}>
                Passwort setzen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteConfirmUser && (
        <div className="modal-overlay">
          <div className="modal modal-danger">
            <h3>Benutzer löschen</h3>
            <p className="modal-subtitle">
              Benutzer: {deleteConfirmUser.vorname} {deleteConfirmUser.nachname} ({deleteConfirmUser.email})
            </p>
            <p className="modal-warning">
              ⚠️ Sind Sie sicher, dass Sie diesen Benutzer löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={handleCancelDelete}>
                Abbrechen
              </button>
              <button 
                className="btn-delete" 
                onClick={() => handleDeleteUser(deleteConfirmUser.id)}
              >
                Benutzer löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
