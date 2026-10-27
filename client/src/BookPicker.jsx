import React, { useEffect, useMemo, useRef, useState } from 'react';

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Texto oscuro o blanco según la luminosidad del color del libro (contraste legible).
function readableOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1f1f1f' : '#ffffff';
}

export const styleOf = (b) => {
  const color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#52196f';
  return { '--c': color, '--on': readableOn(color) };
};

// Portada con carga a demanda: solo se descarga cuando está cerca de la pantalla. Con red lenta el
// "lazy" nativo del navegador adelanta hasta 2500 px y baja casi todas las portadas de entrada.
function Cover({ src, eager, priority }) {
  const box = useRef(null);
  const [show, setShow] = useState(eager);

  useEffect(() => {
    if (show) return undefined;
    if (!('IntersectionObserver' in window)) {
      setShow(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px 200px 300px 200px' }
    );
    io.observe(box.current);
    return () => io.disconnect();
  }, [show]);

  return (
    <span ref={box} className="cover-fill">
      {show && (
        <img
          src={src}
          alt=""
          draggable="false"
          width="180"
          height="252"
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
    </span>
  );
}

const Arrow = ({ dir }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function BookPicker({ books, selected, onToggle, error, loadError }) {
  const [q, setQ] = useState('');
  const [layout, setLayout] = useState('swipe'); // 'swipe' | 'grid'
  const track = useRef(null);

  const visible = useMemo(() => {
    const t = norm(q).trim();
    if (!t) return books || [];
    return (books || []).filter((b) => norm(`${b.title} ${b.author}`).includes(t));
  }, [books, q]);

  const onSearch = (e) => {
    setQ(e.target.value);
    track.current?.scrollTo({ left: 0 });
  };

  // Arrastrar con el mouse (con el dedo o el trackpad el navegador ya desliza solo).
  const drag = useRef({ active: false, moved: false, x: 0, left: 0 });
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = track.current;
    drag.current = { active: true, moved: false, x: e.clientX, left: el.scrollLeft };
    const move = (ev) => {
      const d = drag.current;
      const dx = ev.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 5) {
        d.moved = true;
        el.classList.add('dragging');
      }
      if (d.moved) el.scrollLeft = d.left - dx;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      drag.current.active = false;
      el.classList.remove('dragging');
      // El click que sigue a un arrastre no debe marcar ni desmarcar un libro.
      if (drag.current.moved) setTimeout(() => { drag.current.moved = false; }, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const onClickCapture = (e) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const scrollBy = (dir) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <fieldset id="books" className="picker" aria-describedby={error ? 'books-err' : undefined}>
      <legend className="sr">¿Qué libros te interesan?</legend>

      {loadError && <p className="error">No pudimos cargar los libros. Recarga la página.</p>}
      {!books && !loadError && <p className="muted">Cargando libros…</p>}
      {books?.length === 0 && <p className="muted">Por ahora no hay libros para elegir. Vuelve pronto.</p>}

      {books?.length > 0 && (
        <>
          <div className="picker-tools">
            <div className="search">
              <label htmlFor="book-search" className="sr">Buscar por título o autor</label>
              <input
                id="book-search"
                type="search"
                value={q}
                onChange={onSearch}
                placeholder="Busca por título o autor"
                autoComplete="off"
                enterKeyHint="search"
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              />
            </div>
            <div className="seg" role="group" aria-label="Cómo ver los libros">
              <button type="button" aria-pressed={layout === 'swipe'} onClick={() => setLayout('swipe')}>Deslizar</button>
              <button type="button" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>Ver todos</button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="muted empty">
              No encontramos ese libro.{' '}
              <button type="button" className="link-btn" onClick={() => setQ('')}>Ver todos</button>
            </p>
          ) : (
            <div className={`books-view v-${layout}`}>
              {layout === 'swipe' && (
                <>
                  <button type="button" className="nav prev" onClick={() => scrollBy(-1)} aria-label="Ver libros anteriores"><Arrow dir="prev" /></button>
                  <button type="button" className="nav next" onClick={() => scrollBy(1)} aria-label="Ver más libros"><Arrow dir="next" /></button>
                </>
              )}
              <ul className="track" ref={track} onPointerDown={onPointerDown} onClickCapture={onClickCapture}>
                {visible.map((b, i) => {
                  const on = selected.includes(b._id);
                  return (
                    <li key={b._id}>
                      <label className={`book${on ? ' on' : ''}`} style={styleOf(b)}>
                        <input type="checkbox" className="sr" checked={on} onChange={(e) => onToggle(b._id, e.target.checked)} />
                        <span className="cover">
                          {b.cover && <Cover src={b.cover} eager={i < 3} priority={i < 2} />}
                          <span className="tick" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </span>
                        </span>
                        <span className="meta">
                          <span className="book-title">{b.title}</span>
                          {b.author && <span className="book-author">{b.author}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {error && <p className="error" id="books-err" role="alert">{error}</p>}
    </fieldset>
  );
}
