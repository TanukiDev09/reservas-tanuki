import mongoose from 'mongoose';

export const signupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true, maxlength: 200 },
    // Identificador del envío (lo genera el formulario): si un reintento por señal floja llega dos veces, no se duplica.
    submissionId: { type: String, trim: true, maxlength: 64, unique: true, sparse: true },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    books: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    consent: {
      termsAccepted: { type: Boolean, required: true },
      dataAuthorized: { type: Boolean, required: true },
      textVersion: { type: String, required: true },
      acceptedAt: { type: Date, required: true },
    },
  },
  { timestamps: true }
);
