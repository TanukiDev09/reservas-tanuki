import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import './styles.css';
import Layout from './Layout.jsx';
import SignupForm from './SignupForm.jsx';
import Admin from './Admin.jsx';

const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin';

createRoot(document.getElementById('root')).render(
  <Layout wide={isAdmin} admin={isAdmin}>
    {isAdmin ? <Admin /> : <SignupForm />}
  </Layout>
);
