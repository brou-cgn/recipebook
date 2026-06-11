import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './darkMode.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    if (registration && registration.waiting) {
      const banner = document.createElement('div');
      banner.innerHTML = `
        <div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
                    background:#402C1C;color:white;padding:14px 24px;
                    border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.35);
                    z-index:10000;display:flex;gap:14px;align-items:center;
                    font-family:inherit;font-size:14px;white-space:nowrap;">
          <span>Neue Version verfügbar!</span>
          <button id="sw-update-btn"
                  style="background:white;color:#402C1C;border:none;
                         padding:7px 16px;border-radius:4px;cursor:pointer;
                         font-weight:bold;font-size:14px;">
            Aktualisieren
          </button>
        </div>
      `;
      document.body.appendChild(banner);

      banner.querySelector('#sw-update-btn').addEventListener('click', () => {
        banner.remove();
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    }
  },
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
