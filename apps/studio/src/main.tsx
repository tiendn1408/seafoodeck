import React from 'react';
import ReactDOM from 'react-dom/client';
import StudioApp from './StudioApp';
import '@web/styles.css';
import '@web/trade.css';
import '@web/pilot/pilot.css';
import '@web/learner/tokens.css';
import '@web/learner/shell.css';
import { applyStoredTheme } from '@web/learner/theme';

applyStoredTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StudioApp />
  </React.StrictMode>,
);
