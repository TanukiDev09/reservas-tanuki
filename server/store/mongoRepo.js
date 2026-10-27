import mongoose from 'mongoose';
import { bookSchema } from '../models/Book.js';
import { signupSchema } from '../models/Signup.js';

// Almacén sobre MongoDB: ids siempre como texto, objetos planos.

const duplicate = () => Object.assign(new Error('Ya existe un libro con ese título.'), { code: 'DUPLICATE' });

const plainBook = (b) => ({
  _id: String(b._id),
  title: b.title,
  author: b.author ?? '',
  cover: b.cover ?? '',
  color: b.color ?? '#52196f',
  active: b.active !== false,
  order: b.order ?? 0,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

const plainSignup = (s) => ({
  _id: String(s._id),
  email: s.email,
  name: s.name,
  city: s.city,
  phone: s.phone ?? '',
  books: (s.books || []).map(String),
  consent: s.consent,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

export async function openMongo(uri, ms = 15000) {
  const conn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: ms, maxPoolSize: 5 });
  // Un corte de red momentáneo no debe tumbar el servidor: el driver reconecta solo.
  conn.on('error', (e) => console.error(`MongoDB: ${e.message}`));
  await conn.asPromise();
  const Book = conn.model('Book', bookSchema);
  const Signup = conn.model('Signup', signupSchema);
  // Los índices se verifican en segundo plano: no se espera por ellos en el arranque en frío.
  Promise.all([Book.init(), Signup.init()]).catch((e) => console.error('MongoDB índices:', e.message));
  return mongoRepo(Book, Signup);
}

function mongoRepo(Book, Signup) {
  return {

    async listBooks({ activeOnly = false } = {}) {
      const rows = await Book.find(activeOnly ? { active: true } : {}).sort({ order: 1, title: 1 }).lean();
      return rows.map(plainBook);
    },

    async activeBookIds(ids) {
      const rows = await Book.find({ _id: { $in: ids }, active: true }).select('_id').lean();
      return rows.map((b) => String(b._id));
    },

    // Si el correo ya existe: actualiza datos, suma libros nuevos y renueva la autorización.
    async upsertSignup({ name, city, email, phone, bookIds, consent }) {
      await Signup.updateOne(
        { email },
        { $set: { name, city, phone, consent }, $addToSet: { books: { $each: bookIds } }, $setOnInsert: { email } },
        { upsert: true }
      );
    },

    async summary() {
      const [total, counts, books] = await Promise.all([
        Signup.countDocuments(),
        Signup.aggregate([{ $unwind: '$books' }, { $group: { _id: '$books', count: { $sum: 1 } } }]),
        this.listBooks(),
      ]);
      const byId = new Map(counts.map((c) => [String(c._id), c.count]));
      return { total, books: books.map((b) => ({ ...b, count: byId.get(b._id) || 0 })) };
    },

    async listSignups() {
      const [rows, books] = await Promise.all([Signup.find().sort({ updatedAt: -1 }).lean(), this.listBooks()]);
      const titles = new Map(books.map((b) => [b._id, b.title]));
      return rows.map((s) => ({
        ...plainSignup(s),
        books: (s.books || []).map((id) => ({ _id: String(id), title: titles.get(String(id)) })).filter((b) => b.title),
      }));
    },

    async lastBookOrder() {
      const b = await Book.findOne().sort({ order: -1 }).select('order').lean();
      return b?.order || 0;
    },

    async createBook(data) {
      try {
        return plainBook((await Book.create(data)).toObject());
      } catch (e) {
        throw e?.code === 11000 ? duplicate() : e;
      }
    },

    async updateBook(id, data) {
      try {
        const b = await Book.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
        return b ? plainBook(b) : null;
      } catch (e) {
        throw e?.code === 11000 ? duplicate() : e;
      }
    },
  };
}
