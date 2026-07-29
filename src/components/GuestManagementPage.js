import React, { useState, useEffect } from 'react';
import './EventsPage.css';
import { subscribeToGuestProfiles, saveGuestProfile, deleteGuestProfile } from '../utils/eventsFirestore';

const emptyForm = () => ({
  name: '',
  adults: 10,
  children: 0,
});

function GuestManagementPage({ onBack, currentUser }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubscribe = subscribeToGuestProfiles(currentUser.id, (loaded) => {
      setProfiles(loaded);
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser?.id]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm());
    setError('');
    setShowForm(true);
  };

  const openEdit = (profile) => {
    setEditId(profile.id);
    setForm({
      name: profile.name || '',
      adults: profile.adults ?? 10,
      children: profile.children ?? 0,
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Bitte einen Namen angeben.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveGuestProfile(
        currentUser.id,
        {
          name: form.name.trim(),
          adults: Number(form.adults) || 0,
          children: Number(form.children) || 0,
        },
        editId || undefined,
      );
      setShowForm(false);
    } catch (err) {
      console.error('Error saving guest profile:', err);
      setError('Das Gästeprofil konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (profile) => {
    if (!window.confirm(`Möchtest du "${profile.name}" wirklich löschen?`)) return;
    try {
      await deleteGuestProfile(currentUser.id, profile.id);
    } catch (err) {
      console.error('Error deleting guest profile:', err);
    }
  };

  if (showForm) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>{editId ? 'Gästeprofil bearbeiten' : 'Neues Gästeprofil'}</h2>
          <button
            className="events-close-btn"
            onClick={() => setShowForm(false)}
            aria-label="Abbrechen"
            title="Abbrechen"
          >
            ×
          </button>
        </div>
        <form className="events-form" onSubmit={handleSave}>
          <label className="events-form-field">
            <span>Name des Profils</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="z. B. Familie, Büro-Team, ..."
              required
            />
          </label>

          <div className="events-form-row">
            <label className="events-form-field">
              <span>Erwachsene</span>
              <input
                type="number"
                min="0"
                value={form.adults}
                onChange={(e) => setForm((f) => ({ ...f, adults: e.target.value }))}
              />
            </label>
            <label className="events-form-field">
              <span>Kinder</span>
              <input
                type="number"
                min="0"
                value={form.children}
                onChange={(e) => setForm((f) => ({ ...f, children: e.target.value }))}
              />
            </label>
          </div>

          {error && <p className="events-error-text">{error}</p>}

          <div className="events-form-actions">
            <button
              type="button"
              className="events-secondary-btn"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button type="submit" className="events-primary-btn" disabled={saving}>
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Gäste verwalten</h2>
        {onBack && (
          <button
            className="events-close-btn"
            onClick={onBack}
            aria-label="Zurück"
            title="Zurück"
          >
            ×
          </button>
        )}
      </div>

      {loading ? (
        <div className="events-empty-state">Laden...</div>
      ) : profiles.length === 0 ? (
        <div className="events-empty-state">
          <p>Noch keine Gästeprofile angelegt.</p>
          <button type="button" className="events-primary-btn" onClick={openNew}>
            Erstes Profil anlegen
          </button>
        </div>
      ) : (
        <>
          <div className="events-list">
            {profiles.map((profile) => (
              <div key={profile.id} className="events-card" onClick={() => openEdit(profile)}>
                <div className="events-card-main">
                  <h3>{profile.name}</h3>
                  <p className="events-card-meta">
                    {profile.adults ?? 0} Erw. / {profile.children ?? 0} Kinder
                  </p>
                </div>
                <button
                  type="button"
                  className="events-secondary-btn events-delete-btn"
                  onClick={(e) => { e.stopPropagation(); handleDelete(profile); }}
                  aria-label={`${profile.name} löschen`}
                >
                  Löschen
                </button>
              </div>
            ))}
          </div>
          <button
            className="events-add-fab-button"
            onClick={openNew}
            title="Profil anlegen"
            aria-label="Profil anlegen"
          >
            +
          </button>
        </>
      )}
    </div>
  );
}

export default GuestManagementPage;
