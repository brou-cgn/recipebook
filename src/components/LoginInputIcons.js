import React from 'react';

// Icons in den Eingabefeldern von Anmeldung und Registrierung (Gestaltung in Login.css)

export function EmailIcon() {
  return (
    <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="3"></rect>
      <path d="M3 6.5l9 6 9-6"></path>
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="10" rx="2.5"></rect>
      <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
    </svg>
  );
}
