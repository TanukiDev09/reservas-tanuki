import mongoose from 'mongoose';

const signupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 200 },
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

export const Signup = mongoose.model('Signup', signupSchema);
