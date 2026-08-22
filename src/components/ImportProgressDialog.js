import React, { useEffect } from 'react';
import './ImportProgressDialog.css';
import './UndoSnackbar.css';
import DeleteRowButton from './DeleteRowButton';
import RestartIcon from './icons/RestartIcon';
import CloseThinIcon from './icons/CloseThinIcon';

const RING_SIZE = 20;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function statusLabel(status, progress) {
  switch (status) {
    case 'queued':
      return 'Wartet…';
    case 'processing':
      return `Analysiert · ${Math.round(progress || 0)} %`;
    default:
      return '';
  }
}

// Compact per-row status glyph: a progress ring for queued/processing (empty
// track while queued, filling as it processes), a solid warning dot for
// error — replaces the old full-width status text + separate progress bar
// so a row stays a single line.
function RowStatusIcon({ status, progress }) {
  if (status === 'error') {
    return (
      <svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 20 20" className="import-row-icon" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="#a33a26" />
        <rect x="9" y="5" width="2" height="6" rx="1" fill="#fff" />
        <circle cx="10" cy="14" r="1.2" fill="#fff" />
      </svg>
    );
  }
  const clamped = Math.max(0, Math.min(100, progress || 0));
  const offset = RING_CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="import-row-icon" aria-hidden="true">
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        strokeWidth={RING_STROKE}
        fill="none"
        className="import-row-icon-track"
      />
      {status === 'processing' && (
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          fill="none"
          className="import-row-icon-fill"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      )}
    </svg>
  );
}

// Detail view opened by clicking the header's import progress donut. Shows
// every queued/running/failed background import job; finished imports leave
// this list immediately and show up as pending reviews on "Neues Rezept
// hinzufügen" instead.
function ImportProgressDialog({ jobs, deleteBanners = [], onClose, onDismissJob, onRestartJob, onCancelJob, onUndoDelete }) {
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
          <div className="import-progress-dialog-title">
            <h2>Rezept-Import</h2>
            {jobs.length > 0 && (
              <span className="import-progress-dialog-count">{jobs.length} aktiv</span>
            )}
          </div>
          <button className="close-button" onClick={onClose} aria-label="Schließen" title="Schließen">
            <CloseThinIcon size={13} />
          </button>
        </div>

        <div className="import-progress-dialog-content">
          {jobs.length === 0 ? (
            <p className="import-progress-empty">Kein Import aktiv.</p>
          ) : (
            <ul className="import-progress-list">
              {jobs.map((job) => {
                const label = job.label || 'Rezept-Import';
                return (
                  <li key={job.id} className={`import-progress-item status-${job.status} delete-row-hover-target`}>
                    <RowStatusIcon status={job.status} progress={job.progress} />
                    <div className="import-progress-item-body">
                      <span className="import-progress-item-label">{label}</span>
                      {job.status === 'error' && (
                        <span className="import-progress-item-error-text">{job.error}</span>
                      )}
                    </div>
                    {job.status !== 'error' && (
                      <span className="import-progress-item-status">{statusLabel(job.status, job.progress)}</span>
                    )}
                    <div className="import-progress-item-actions">
                      {job.canRestart && (
                        <button
                          type="button"
                          className="import-progress-item-restart"
                          onClick={() => onRestartJob(job.id)}
                          title="Import neu starten"
                          aria-label={`${label} neu starten`}
                        >
                          <RestartIcon size={14} />
                        </button>
                      )}
                      <DeleteRowButton
                        itemName={label}
                        onClick={() => (
                          job.status === 'error' ? onDismissJob(job.id, label) : onCancelJob(job.id, label)
                        )}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="import-progress-hint">
            Fertige Importe findest du unter „Neues Rezept hinzufügen" zur Überprüfung.
          </p>
        </div>
      </div>

      {deleteBanners.map((banner, index) => (
        <div
          key={banner.id}
          className="undo-snackbar"
          role="status"
          style={{ bottom: `${24 + index * 56}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="undo-snackbar-message">{banner.message}</span>
          <button type="button" className="undo-snackbar-action" onClick={() => onUndoDelete(banner.id)}>
            Rückgängig
          </button>
        </div>
      ))}
    </div>
  );
}

export default ImportProgressDialog;
