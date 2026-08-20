import React, { useEffect } from 'react';
import './ImportProgressDialog.css';

function statusLabel(status) {
  switch (status) {
    case 'queued':
      return 'Wartet…';
    case 'processing':
      return 'Wird analysiert…';
    case 'error':
      return 'Fehlgeschlagen';
    default:
      return '';
  }
}

// Detail view opened by clicking the header's import progress donut. Shows
// every queued/running/failed background import job; finished imports leave
// this list immediately and show up as pending reviews on "Neues Rezept
// hinzufügen" instead.
function ImportProgressDialog({ jobs, onClose, onDismissJob, onRestartJob, onCancelJob }) {
  // Lock body scroll while this dialog is open (iOS Safari safe)
  useEffect(() => {
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="import-progress-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="import-progress-dialog-header">
          <h2>Rezept-Import</h2>
          <button className="close-button" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        <div className="import-progress-dialog-content">
          {jobs.length === 0 ? (
            <p className="import-progress-empty">Kein Import aktiv.</p>
          ) : (
            <ul className="import-progress-list">
              {jobs.map((job) => (
                <li key={job.id} className={`import-progress-item status-${job.status}`}>
                  <div className="import-progress-item-main">
                    <span className="import-progress-item-label">{job.label || 'Rezept-Import'}</span>
                    <span className="import-progress-item-status">{statusLabel(job.status)}</span>
                  </div>
                  {(job.status === 'processing' || job.status === 'queued') && (
                    <div className="import-progress-item-bar">
                      <div
                        className="import-progress-item-bar-fill"
                        style={{ width: `${job.progress || 0}%` }}
                      />
                    </div>
                  )}
                  {job.status === 'queued' && (
                    <div className="import-progress-item-actions">
                      {job.canRestart && (
                        <button
                          type="button"
                          className="import-progress-item-restart"
                          onClick={() => onRestartJob(job.id)}
                          title="Import neu starten"
                          aria-label={`${job.label || 'Import'} neu starten`}
                        >
                          Neu starten
                        </button>
                      )}
                      <button
                        type="button"
                        className="import-progress-item-dismiss"
                        onClick={() => onCancelJob(job.id)}
                        title="Import abbrechen"
                        aria-label={`${job.label || 'Import'} abbrechen`}
                      >
                        Abbrechen
                      </button>
                    </div>
                  )}
                  {job.status === 'processing' && (
                    <div className="import-progress-item-actions">
                      {job.canRestart && (
                        <button
                          type="button"
                          className="import-progress-item-restart"
                          onClick={() => onRestartJob(job.id)}
                          title="Import neu starten"
                          aria-label={`${job.label || 'Import'} neu starten`}
                        >
                          Neu starten
                        </button>
                      )}
                      <button
                        type="button"
                        className="import-progress-item-dismiss"
                        onClick={() => onCancelJob(job.id)}
                        title="Import abbrechen"
                        aria-label={`${job.label || 'Import'} abbrechen`}
                      >
                        Abbrechen
                      </button>
                    </div>
                  )}
                  {job.status === 'error' && (
                    <div className="import-progress-item-error">
                      <span>{job.error}</span>
                      <div className="import-progress-item-error-actions">
                        {job.canRestart && (
                          <button
                            type="button"
                            className="import-progress-item-restart"
                            onClick={() => onRestartJob(job.id)}
                            title="Import neu starten"
                            aria-label={`${job.label || 'Import'} neu starten`}
                          >
                            Neu starten
                          </button>
                        )}
                        <button
                          type="button"
                          className="import-progress-item-dismiss"
                          onClick={() => onDismissJob(job.id)}
                        >
                          Verwerfen
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="import-progress-hint">
            Fertige Importe findest du unter „Neues Rezept hinzufügen" zur Überprüfung.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ImportProgressDialog;
