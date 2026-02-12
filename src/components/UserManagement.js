import React, { useState, useEffect } from 'react';
import './UserManagement.css';
import { getUsers, updateUserAdminStatus, getAdminCount } from '../utils/userManagement';

function UserManagement({ onBack, currentUser }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' }); // 'success' or 'error'

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
    </div>
  );
}

export default UserManagement;
