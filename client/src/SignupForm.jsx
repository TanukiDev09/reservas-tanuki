import React, { useEffect, useRef, useState } from 'react';
import BookPicker, { styleOf } from './BookPicker.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const empty = { name: '', city: '', email: '', phone: '', website: '', books: [], termsAccepted: false, dataAuthorized: false };

function validate(f) {
  const e = {};
  if (!f.name.trim()) e.name = 'Cuéntanos tu nombre.';
  if (!f.city.trim()) e.city = 'Cuéntanos de qué ciudad eres.';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Revisa tu correo, parece que le falta algo.';
  if (!f.books.length) e.books = 'Elige al menos un libro.';
  if (!f.termsAccepted) e.termsAccepted = 'Necesitamos que aceptes los términos y condiciones.';
  if (!f.dataAuthorized) e.dataAuthorized = 'Necesitamos tu autorización para poder avisarte.';
  return e;
}

const ORDER = ['name', 'city', 'email', 'phone', 'termsAccepted', 'dataAuthorized'];
const plural = (n) => (n === 1 ? '1 libro elegido' : `${n} libros elegidos`);

// Con señal floja el envío puede tardar o cortarse: se reintenta hasta 3 veces con tiempo límite.
// Es seguro repetirlo: cada envío lleva un identificador y el servidor no guarda dos veces el mismo.
async function postWithRetry(body, onRetry) {
  const waits = [12000, 20000, 30000];
  let lastError;
  for (let i = 0; i < waits.length; i += 1) {
    if (i > 0) {
      onRetry(true);
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), waits[i]);
    try {
      const res = await fetch('/api/signups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal });
      const data = await res.json().catch(() => ({}));
      if (res.status < 500 && res.status !== 429) return { res, data }; // éxito o error de validación: no se reintenta
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status === 429) return { res, data };
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export default function SignupForm() {
  // Los libros y los enlaces legales vienen incrustados en el HTML al compilar: se pintan al instante.
  const seed = window.__DATA__;
  const [books, setBooks] = useState(seed?.books?.length ? seed.books : null);
  const [cfg, setCfg] = useState(seed?.config || { termsUrl: '#', privacyUrl: '#' });
  const [retrying, setRetrying] = useState(false);
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(1);
  const [sending, setSending] = useState(false);
  const [sentName, setSentName] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState('');
  const tokenRef = useRef(null); // token antispam del servidor (hora de carga del formulario)
  const doneRef = useRef(null);
  const headingRef = useRef(null);
  const firstRender = useRef(true);

  // Se actualiza en segundo plano, sin bloquear nada. Además "calienta" la función y la base de datos
  // para que el envío del formulario (minutos después) no pague el arranque en frío.
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      Promise.all([fetch('/api/books').then((r) => r.json()), fetch('/api/config').then((r) => r.json())])
        .then(([b, c]) => {
          if (!alive || !Array.isArray(b)) return;
          setBooks(b);
          setCfg(c);
        })
        .catch(() => alive && !books && setLoadError(true));
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
    idle(refresh);
    fetch('/api/form-token')
      .then((r) => r.json())
      .then((d) => {
        tokenRef.current = d.token;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El botón "atrás" del celular vuelve al paso 1 sin perder lo escrito.
  useEffect(() => {
    const onPop = (e) => setStep(e.state?.step === 2 ? 2 : 1);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (sentName) doneRef.current?.focus();
  }, [sentName]);

  const goStep2 = () => {
    if (!f.books.length) {
      setErrors((p) => ({ ...p, books: 'Elige al menos un libro para continuar.' }));
      return;
    }
    setErrors((p) => ({ ...p, books: undefined }));
    window.history.pushState({ step: 2 }, '');
    setStep(2);
  };
  const goStep1 = () => (window.history.state?.step === 2 ? window.history.back() : setStep(1));

  const set = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const toggle = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.checked }));
  const toggleBook = (id, checked) => {
    setErrors((p) => ({ ...p, books: undefined }));
    setF((p) => ({ ...p, books: checked ? [...new Set([...p.books, id])] : p.books.filter((x) => x !== id) }));
  };

  const focusFirst = (errs) => {
    const key = ORDER.find((k) => errs[k]);
    if (key) document.getElementById(key)?.focus();
  };

  async function submit(ev) {
    ev.preventDefault();
    setFormError('');
    const errs = validate(f);
    setErrors(errs);
    if (errs.books) return goStep1();
    if (Object.keys(errs).length) return focusFirst(errs);

    setSending(true);
    try {
      const submissionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!tokenRef.current) {
        tokenRef.current = await fetch('/api/form-token').then((r) => r.json()).then((d) => d.token).catch(() => null);
      }
      const { res, data } = await postWithRetry(JSON.stringify({ ...f, submissionId, formToken: tokenRef.current }), setRetrying);
      if (res.ok) {
        setSentName(f.name.trim().split(/\s+/)[0]);
        setSentEmail(f.email.trim());
        setF(empty);
        setStep(1);
      } else if (data.errors) {
        setErrors(data.errors);
        if (data.errors.books) goStep1();
        else focusFirst(data.errors);
      } else {
        setFormError(data.error || 'No pudimos guardar tu inscripción. Inténtalo de nuevo.');
      }
    } catch {
      setFormError('No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      setSending(false);
      setRetrying(false);
    }
  }

  if (sentName) {
    return (
      <section className="card done" ref={doneRef} tabIndex={-1} role="status" aria-live="polite">
        <h1>Listo, {sentName}</h1>
        <p>
          Quedaste anotado. Te escribiremos a <strong>{sentEmail}</strong> cuando los libros que elegiste estén
          disponibles.
        </p>
        <p>Gracias por leer con nosotros.</p>
        <button type="button" className="btn btn-outline" onClick={() => setSentName('')}>
          Avisarme de otro libro
        </button>
      </section>
    );
  }

  const chosen = (books || []).filter((b) => f.books.includes(b._id));

  const field = (id, label, props = {}) => (
    <div className="field">
      <label htmlFor={id}>
        {label} {props.required === false ? <span className="opt">(opcional)</span> : null}
      </label>
      <input
        id={id}
        value={f[id]}
        onChange={set(id)}
        aria-invalid={errors[id] ? 'true' : undefined}
        aria-describedby={errors[id] ? `${id}-err` : undefined}
        {...props.input}
      />
      {errors[id] && (
        <p className="error" id={`${id}-err`}>
          {errors[id]}
        </p>
      )}
    </div>
  );

  return (
    <section className="flow">
      <p className="steps" aria-label={`Paso ${step} de 2`}>
        <span className="bar on" />
        <span className={`bar${step === 2 ? ' on' : ''}`} />
        <span className="steps-label">Paso {step} de 2</span>
      </p>

      {step === 1 ? (
        <>
          <h1 ref={headingRef} tabIndex={-1}>Avísame cuando vuelva</h1>
          <p className="lead">Toca los libros que te interesan y te escribiremos cuando estén disponibles.</p>

          <BookPicker books={books} selected={f.books} onToggle={toggleBook} error={errors.books} loadError={loadError} />

          <div className="sticky-bar">
            <div className="sticky-info" aria-live="polite">
              {chosen.length === 0 ? (
                <span className="muted">Toca una portada para elegirla</span>
              ) : (
                <>
                  <span className="mini-covers" aria-hidden="true">
                    {chosen.slice(0, 4).map((b) => (
                      <span key={b._id} className="mini" style={styleOf(b)}>
                        {b.cover && <img src={b.cover} alt="" width="28" height="40" />}
                      </span>
                    ))}
                    {chosen.length > 4 && <span className="more">+{chosen.length - 4}</span>}
                  </span>
                  <strong>{plural(chosen.length)}</strong>
                </>
              )}
            </div>
            <button type="button" className="btn" onClick={goStep2}>Continuar</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <button type="button" className="back" onClick={goStep1}>← Cambiar libros</button>
          <h1 ref={headingRef} tabIndex={-1}>Tus datos</h1>

          <div className="summary">
            <ul className="mini-list">
              {chosen.map((b) => (
                <li key={b._id} className="mini" style={styleOf(b)} title={b.title}>
                  {b.cover && <img src={b.cover} alt="" width="28" height="40" />}
                </li>
              ))}
            </ul>
            <p>
              <strong>{plural(chosen.length)}.</strong>{' '}
              <span className="muted">{chosen.map((b) => b.title).join(' · ')}</span>
            </p>
          </div>

          <div className="card">
            {field('name', 'Nombre', { input: { autoComplete: 'name', required: true } })}
            {field('city', 'Ciudad', { input: { autoComplete: 'address-level2', required: true } })}
            {field('email', 'Correo', { input: { type: 'email', inputMode: 'email', autoComplete: 'email', required: true } })}
            {field('phone', 'Teléfono', { required: false, input: { type: 'tel', inputMode: 'tel', autoComplete: 'tel' } })}

            <div className="field consents">
              <label className="check">
                <input
                  id="termsAccepted"
                  type="checkbox"
                  checked={f.termsAccepted}
                  onChange={toggle('termsAccepted')}
                  aria-invalid={errors.termsAccepted ? 'true' : undefined}
                  aria-describedby={errors.termsAccepted ? 'termsAccepted-err' : undefined}
                />
                <span>
                  Acepto los{' '}
                  <a href={cfg.termsUrl} target="_blank" rel="noopener noreferrer">términos y condiciones</a>.
                </span>
              </label>
              {errors.termsAccepted && <p className="error" id="termsAccepted-err">{errors.termsAccepted}</p>}

              <label className="check">
                <input
                  id="dataAuthorized"
                  type="checkbox"
                  checked={f.dataAuthorized}
                  onChange={toggle('dataAuthorized')}
                  aria-invalid={errors.dataAuthorized ? 'true' : undefined}
                  aria-describedby={errors.dataAuthorized ? 'dataAuthorized-err' : undefined}
                />
                <span>
                  Autorizo el tratamiento de mis datos personales para que Tanuki Libros me avise cuando los libros
                  que elegí estén disponibles, según la Ley 1581 de 2012 y la{' '}
                  <a href={cfg.privacyUrl} target="_blank" rel="noopener noreferrer">política de tratamiento de datos</a>.
                </span>
              </label>
              {errors.dataAuthorized && <p className="error" id="dataAuthorized-err">{errors.dataAuthorized}</p>}
            </div>

            {/* Campo trampa: oculto para personas y lectores de pantalla. */}
            <div className="hp" aria-hidden="true">
              <label htmlFor="website">No llenes este campo</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
            </div>

            {formError && <p className="error form-error" role="alert">{formError}</p>}
          </div>

          <div className="sticky-bar">
            <button className="btn" type="submit" disabled={sending}>
              {sending ? (retrying ? 'Reintentando…' : 'Enviando…') : 'Avísame'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
