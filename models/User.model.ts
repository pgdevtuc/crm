import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  userId: string; // ID único del usuario (puede ser de tu sistema de auth)
  email?: string;
  name?: string;
  threadId?: string; // Thread actual de OpenAI
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    email: {
      type: String,
      sparse: true
    },
    name: {
      type: String
    },
    threadId: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IUser>('User', UserSchema);