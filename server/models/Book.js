import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200, unique: true },
    author: { type: String, trim: true, maxlength: 120, default: '' },
    cover: { type: String, trim: true, maxlength: 500, default: '' },
    color: { type: String, trim: true, match: /^#[0-9a-fA-F]{6}$/, default: '#52196f' },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Book = mongoose.model('Book', bookSchema);
