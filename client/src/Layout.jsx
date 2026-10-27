import React from 'react';

export default function Layout({ children, wide, admin }) {
  return (
    <>
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <header className="site-header">
        <a href="https://tanukilibros.com" aria-label="Tanuki Libros">
          <img src="/tanuki-logo.webp" alt="Tanuki Libros" width="160" height="40" />
        </a>
        {admin && <span className="badge">Administración</span>}
      </header>
      <main id="contenido" className={wide ? 'wrap wide' : 'wrap'}>
        {children}
      </main>
      <footer className="site-footer">
        <a href="https://tanukilibros.com">Visita tanukilibros.com</a>
      </footer>
    </>
  );
}
