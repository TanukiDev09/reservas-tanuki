// Caché en memoria de la lista pública de libros: evita ir a la base en cada visita.
const TTL_MS = 60_000;
let books = null;
let at = 0;

export const booksCache = {
  get: () => (books && Date.now() - at < TTL_MS ? books : null),
  set: (value) => {
    books = value;
    at = Date.now();
  },
  clear: () => {
    books = null;
  },
};
