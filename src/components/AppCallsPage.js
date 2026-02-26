import React, { useState, useEffect } from 'react';
import './AppCallsPage.css';
import { getAppCalls } from '../utils/appCallsFirestore';

function AppCallsPage({ onBack, currentUser }) {
  const [appCalls, setAppCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAppCalls = async () => {
      const calls = await getAppCalls();
      setAppCalls(calls);
      setLoading(false);
    };
    loadAppCalls();
  }, []);

  if (!currentUser?.isAdmin) {
    return (
      <div className="app-calls-container">
        <div className="app-calls-header">
          <button className="back-button" onClick={onBack}>← Zurück</button>
          <h2>Appaufrufe</h2>
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
        <button className="back-button" onClick={onBack}>← Zurück</button>
        <h2>Appaufrufe</h2>
      </div>
      <div className="app-calls-content">
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
      </div>
    </div>
  );
}

export default AppCallsPage;
