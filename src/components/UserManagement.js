import React, { useState, useEffect } from 'react';
import './UserManagement.css';
import { 
  getUsers, 
  updateUserAdminStatus, 
  getAdminCount, 
  updateUserName, 
  setTemporaryPassword,
  validatePassword 
} from '../utils/userManagement';

function UserManagement({ onBack, currentUser }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' }); // 'success' or 'error'
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ vorname: '', nachname: '' });
  const [passwordResetUser, setPasswordResetUser] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = () => {
    setUsers(getUsers());
  };

  const handleToggleAdmin = (userId, currentAdminStatus) => {
    const newAdminStatus = !currentAdminStatus;
    const result = updateUserAdminStatus(userId, newAdminStatus);
    
    if (result.success) {
      loadUsers();
      setMessage({ text: result.message, type: 'success' });
    } else {
      setMessage({ text: result.message, type: 'error' });
    }
    
    // Clear message after 3 seconds
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const canRemoveAdmin = (userId, isAdmin) => {
    if (!isAdmin) return true;
    const adminCount = getAdminCount();
    return adminCount > 1;
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
          Hier können Sie alle registrierten Benutzerkonten einsehen und Administrator-Rechte verwalten.
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
                  <th>Administrator</th>
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
                      <label className="admin-toggle">
                        <input
                          type="checkbox"
                          checked={user.isAdmin}
                          onChange={() => handleToggleAdmin(user.id, user.isAdmin)}
                          disabled={!canRemoveAdmin(user.id, user.isAdmin)}
                          title={
                            !canRemoveAdmin(user.id, user.isAdmin)
                              ? 'Es muss mindestens ein Administrator vorhanden sein'
                              : 'Admin-Status ändern'
                          }
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      {user.isAdmin && getAdminCount() === 1 && (
                        <span className="admin-lock-hint" title="Einziger Administrator">
                          🔒
                        </span>
                      )}
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
                          className="action-btn password-btn" 
                          onClick={() => handleOpenPasswordReset(user)}
                          title="Temporäres Passwort setzen"
                        >
                          🔑
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
    </div>
  );
}

export default UserManagement;
