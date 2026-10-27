import React, { useCallback, useEffect, useState } from 'react';

const KEY = 'tanuki-admin-auth';
const fmt = (d) => new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

function useApi(auth, onUnauthorized) {
  return useCallback(
    async (path, opts = {}) => {
      const res = await fetch(`/api/admin${path}`, {
        ...opts,
        headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Basic ${auth}` },
      });
      if (res.status === 401) {
        onUnauthorized();
        throw new Error('Usuario o contraseña incorrectos.');
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Algo salió mal.');
      }
      return res;
    },
    [auth, onUnauthorized]
  );
}

export default function Admin() {
  const [auth, setAuth] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  });
  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {}
    setAuth('');
  }, []);

  if (!auth) return <Login onLogin={setAuth} />;
  return <Panel auth={auth} logout={logout} />;
}

function Login({ onLogin }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    const token = btoa(unescape(encodeURIComponent(`${user}:${pass}`)));
    try {
      const res = await fetch('/api/admin/me', { headers: { Authorization: `Basic ${token}` } });
      if (res.ok) {
        try {
          sessionStorage.setItem(KEY, token);
        } catch {}
        onLogin(token);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'No pudimos entrar.');
      }
    } catch {
      setError('No pudimos conectarnos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>Entrar</h1>
      <div className="field">
        <label htmlFor="user">Usuario</label>
        <input id="user" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="pass">Contraseña</label>
        <input id="pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}

function Panel({ auth, logout }) {
  const api = useApi(auth, logout);
  const [summary, setSummary] = useState(null);
  const [signups, setSignups] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api('/summary').then((r) => r.json()), api('/signups').then((r) => r.json())]);
      setSummary(s);
      setSignups(l);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function exportCsv() {
    try {
      const blob = await api('/export.csv').then((r) => r.blob());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'inscripciones-tanuki.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="admin">
      <div className="toolbar">
        <h1>Inscripciones</h1>
        <div className="actions">
          <button className="btn btn-outline" onClick={exportCsv}>Exportar CSV</button>
          <button className="btn btn-ghost" onClick={logout}>Salir</button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <PublishBox api={api} />

      {summary && (
        <>
          <p className="total"><strong>{summary.total}</strong> personas inscritas</p>
          <BooksAdmin api={api} summary={summary} reload={load} />
        </>
      )}

      <h2>Lista de inscripciones</h2>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Lista de inscripciones">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Nombre</th><th>Ciudad</th><th>Correo</th><th>Teléfono</th><th>Libros</th><th>Autorización</th></tr>
          </thead>
          <tbody>
            {signups.map((s) => (
              <tr key={s._id}>
                <td>{fmt(s.createdAt)}</td>
                <td>{s.name}</td>
                <td>{s.city}</td>
                <td>{s.email}</td>
                <td>{s.phone}</td>
                <td>{s.books.map((b) => b.title).join(', ')}</td>
                <td>v{s.consent.textVersion}<br />{fmt(s.consent.acceptedAt)}</td>
              </tr>
            ))}
            {!signups.length && <tr><td colSpan="7" className="muted">Aún no hay inscripciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Publicar: recompila el sitio (Vercel) para fijar en la página la lista de libros incrustada en el HTML.
function PublishBox({ api }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api('/publish').then((r) => r.json()).then((d) => setEnabled(d.enabled)).catch(() => {});
  }, [api]);

  async function publish() {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await api('/publish', { method: 'POST' });
      setNote('Publicando… los cambios de libros estarán fijos en la página en aproximadamente un minuto.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <section className="publish card" aria-labelledby="publish-title">
      <div className="publish-head">
        <div>
          <h2 id="publish-title">Publicar cambios</h2>
          <p className="muted">
            Los libros van incrustados en la página para que cargue al instante. Los cambios que hagas aquí se ven en el
            formulario en cerca de un minuto; pulsa Publicar para dejarlos fijos.
          </p>
        </div>
        <button className="btn btn-outline" onClick={publish} disabled={busy}>
          {busy ? 'Publicando…' : 'Publicar cambios'}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p className="publish-note" role="status">{note}</p>}
    </section>
  );
}

function BooksAdmin({ api, summary, reload }) {
  const [editing, setEditing] = useState(null); // { _id?, title, author }
  const [msg, setMsg] = useState('');

  const save = (path, method, body) =>
    api(path, { method, body: JSON.stringify(body) })
      .then(() => {
        setMsg('');
        return reload();
      })
      .catch((e) => setMsg(e.message));

  async function submit(ev) {
    ev.preventDefault();
    const { _id, title, author, cover, color } = editing;
    await (_id ? save(`/books/${_id}`, 'PATCH', { title, author, cover, color }) : save('/books', 'POST', { title, author, cover, color }));
    setEditing((cur) => (cur === editing ? null : cur));
  }

  return (
    <>
      <div className="toolbar">
        <h2>Libros e inscritos</h2>
        <button className="btn btn-outline" onClick={() => setEditing({ title: '', author: '', cover: '', color: '#52196f' })}>Agregar libro</button>
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}

      {editing && (
        <form className="card" onSubmit={submit}>
          <h3>{editing._id ? 'Editar libro' : 'Nuevo libro'}</h3>
          <div className="field">
            <label htmlFor="bt">Título (nombre completo)</label>
            <input id="bt" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="ba">Autor</label>
            <input id="ba" value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="bc">Portada (dirección de la imagen)</label>
            <input id="bc" value={editing.cover} onChange={(e) => setEditing({ ...editing, cover: e.target.value })} placeholder="/covers/mi-libro.webp o https://…" />
          </div>
          <div className="field">
            <label htmlFor="bcol">Color del libro</label>
            <div className="swatch-row">
              <input id="bcol" type="color" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
              <code>{editing.color}</code>
            </div>
          </div>
          <div className="actions">
            <button className="btn">Guardar</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <ul className="admin-books">
        {summary.books.map((b) => (
          <BookRow key={b._id} b={b} onEdit={() => setEditing({ _id: b._id, title: b.title, author: b.author, cover: b.cover || '', color: b.color || '#52196f' })} save={save} />
        ))}
      </ul>
    </>
  );
}

function BookRow({ b, onEdit, save }) {
  return (
    <li className="admin-book" style={{ '--c': b.color || '#52196f' }}>
      {b.cover ? <img className="admin-cover" src={b.cover} alt="" width="44" height="62" /> : <span className="admin-cover" />}
      <div>
        <strong>{b.title}</strong>
        <span className="book-author">{b.author || 'Sin autor'}</span>
      </div>
      <div className="count" aria-label={`${b.count} inscritos`}>{b.count}</div>
      <div className="actions">
        <label className="switch">
          <input
            type="checkbox"
            defaultChecked={b.active !== false}
            onChange={(e) => save(`/books/${b._id}`, 'PATCH', { active: e.target.checked })}
          />
          <span>Visible en el formulario</span>
        </label>
        <button className="btn btn-ghost" onClick={onEdit}>Editar</button>
      </div>
    </li>
  );
}
