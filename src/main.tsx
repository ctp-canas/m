import React from 'react';import{createRoot}from'react-dom/client';import App from './App';import {InstitutionalAccess} from './institutional-access';import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><InstitutionalAccess><App/></InstitutionalAccess></React.StrictMode>);
