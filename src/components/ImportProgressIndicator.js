import React from 'react';
import './ImportProgressIndicator.css';

const SIZE = 28;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Small circular progress "donut" shown next to the hamburger menu while
// background recipe imports (Web-Import / Foto-OCR) are running. Clicking
// it opens the ImportProgressDialog with the full job list.
function ImportProgressIndicator({ jobs, onClick }) {
  if (!jobs || jobs.length === 0) return null;

  const activeJob = jobs.find((job) => job.status === 'processing') || jobs[0];
  const hasError = jobs.some((job) => job.status === 'error');
  const progress = Math.max(0, Math.min(100, activeJob?.progress || 0));
  const offset = CIRCUMFERENCE * (1 - progress / 100);
  const extraCount = jobs.length - 1;

  return (
    <button
      type="button"
      className={`import-progress-indicator${hasError ? ' has-error' : ''}`}
      onClick={onClick}
      title={hasError ? 'Import fehlgeschlagen – Details anzeigen' : `Rezept-Import läuft (${progress}%)`}
      aria-label="Import-Fortschritt anzeigen"
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          className="import-progress-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
        />
        {!hasError && (
          <circle
            className="import-progress-fill"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
      </svg>
      {hasError && <span className="import-progress-error-dot" aria-hidden="true" />}
      {extraCount > 0 && (
        <span className="import-progress-badge">{extraCount}</span>
      )}
    </button>
  );
}

export default ImportProgressIndicator;
