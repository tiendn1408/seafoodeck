import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './pilot/PilotApp';
import './styles.css';
import './trade.css';
import './pilot/pilot.css';
import './learner/tokens.css';
import './learner/shell.css';
import { applyStoredTheme } from './learner/theme';

applyStoredTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
