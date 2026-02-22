import React, { useState } from 'react';
import './PersonalDataPage.css';
import { updateUserProfile } from '../utils/userManagement';

function PersonalDataPage({ currentUser, onBack, onProfileUpdated }) {
  const [vorname, setVorname] = useState(currentUser?.vorname || '');
  const [nachname, setNachname] = useState(currentUser?.nachname || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [signatureSatz, setSignatureSatz] = useState(currentUser?.signatureSatz || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const result = await updateUserProfile(currentUser.id, {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      email: email.trim(),
      signatureSatz: signatureSatz.trim()
    });

    setSaving(false);
    setMessage({ success: result.success, text: result.message });

    if (result.success && onProfileUpdated) {
      onProfileUpdated({
        ...currentUser,
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim(),
        signatureSatz: signatureSatz.trim()
      });
    }
  };

  return (
    <div className="personal-data-page">
      <div className="personal-data-header">
        <h2>Persönliche Daten</h2>
      </div>
      <form className="personal-data-form" onSubmit={handleSubmit}>
        <div className="personal-data-field">
          <label htmlFor="vorname">Vorname</label>
          <input
            id="vorname"
            type="text"
            value={vorname}
            onChange={(e) => setVorname(e.target.value)}
            required
          />
        </div>
        <div className="personal-data-field">
          <label htmlFor="nachname">Nachname</label>
          <input
            id="nachname"
            type="text"
            value={nachname}
            onChange={(e) => setNachname(e.target.value)}
            required
          />
        </div>
        <div className="personal-data-field">
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="personal-data-field">
          <label htmlFor="signatureSatz">Signature-Satz (optional)</label>
          <textarea
            id="signatureSatz"
            value={signatureSatz}
            onChange={(e) => setSignatureSatz(e.target.value)}
            placeholder="Wird als letzter Zubereitungsschritt bei neuen Rezepten übernommen"
            rows={3}
          />
        </div>
        {message && (
          <div className={`personal-data-message ${message.success ? 'success' : 'error'}`}>
            {message.text}
          </div>
        )}
        <div className="personal-data-actions">
          <button type="button" className="personal-data-cancel-btn" onClick={onBack}>
            Abbrechen
          </button>
          <button type="submit" className="personal-data-save-btn" disabled={saving}>
            {saving ? 'Wird gespeichert…' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PersonalDataPage;
