import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../sidepanel/App';
import '../sidepanel/styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App surface="popout" />
  </React.StrictMode>
);
