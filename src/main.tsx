// MUST be the first import to ensure Buffer is available globally
import './polyfills';
// Polices chargées via <link> Google Fonts dans index.html : les imports
// @fontsource cassaient le serveur de preview (paquet absent de node_modules).
import './index.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
    <BrowserRouter>
        <App />
    </BrowserRouter>,
);
