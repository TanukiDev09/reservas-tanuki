import { Book } from './models/Book.js';

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
export async function seedBooks() {
  let created = 0;
  for (const [i, [title, author, cover, color]] of initialBooks.entries()) {
    const res = await Book.updateOne(
      { title },
      { $setOnInsert: { title, author, cover, color, active: true, order: (i + 1) * 10 } },
      { upsert: true }
    );
    if (res.upsertedCount) {
      created += 1;
      continue;
    }
    const unset = (field, ...empty) => ({ title, $or: [{ [field]: { $exists: false } }, { [field]: { $in: empty } }] });
    await Book.updateOne(unset('author', ''), { $set: { author } });
    await Book.updateOne(unset('cover', ''), { $set: { cover } });
    await Book.updateOne(unset('color', '', '#52196f'), { $set: { color } });
  }
  return created;
}
