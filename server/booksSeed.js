// Autor, portada (client/public/covers) y color de acento tomados de tanukilibros.com.
export const initialBooks = [
  ['El desfile nocturno de cientos de demonios', 'Sekien Toriyama', '/covers/desfile-nocturno.webp', '#7ea98e'],
  ['El desfile continuo de cientos de demonios: ayer y hoy', 'Sekien Toriyama', '/covers/desfile-continuo.webp', '#395a50'],
  ['Resignación', 'Toshiko Tamura', '/covers/resignacion.webp', '#e75b78'],
  ['Un lápiz labial para una momia', 'Toshiko Tamura', '/covers/lapiz-labial.webp', '#fddc43'],
  ['El tambor encantado', 'Kyusaku Yumeno', '/covers/tambor-encantado.webp', '#5b7028'],
  ['El secreto del alma número diez', 'Juza Unno', '/covers/numero-diez.webp', '#6ed3f1'],
  ['Historia de una vieja geisha', 'Kanoko Okamoto', '/covers/vieja-geisha.webp', '#804694'],
  ['El hombre que dejó de respirar', 'Ikujiro Ran', '/covers/hombre-respirar.webp', '#ad3070'],
  ['El huevo', 'Kyusaku Yumeno', '/covers/el-huevo.webp', '#113d6a'],
  ['Sobre el horror', 'Juza Unno', '/covers/sobre-el-horror.webp', '#eb1f20'],
  ['Indigno de ser humano', 'Osamu Dazai', '/covers/indigno.webp', '#ac1c1c'],
];

// Inserta los títulos que faltan y completa autor, portada y color solo si están vacíos
// (o en el color por defecto); nunca pisa ediciones hechas desde /admin.
export async function seedBooks(repo) {
  const existing = new Map((await repo.listBooks()).map((b) => [b.title, b]));
  let created = 0;
  for (const [i, [title, author, cover, color]] of initialBooks.entries()) {
    const book = existing.get(title);
    if (!book) {
      await repo.createBook({ title, author, cover, color, active: true, order: (i + 1) * 10 });
      created += 1;
      continue;
    }
    const patch = {};
    if (!book.author) patch.author = author;
    if (!book.cover) patch.cover = cover;
    if (!book.color || book.color === '#52196f') patch.color = color;
    if (Object.keys(patch).length) await repo.updateBook(book._id, patch);
  }
  return created;
}
