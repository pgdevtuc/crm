import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface IThread extends Document {
  threadId: string; // ID del thread de OpenAI
  userId: string; // Referencia al usuario
  assistantId: string; // ID del asistente de OpenAI
  messages: IMessage[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const ThreadSchema: Schema = new Schema(
  {
    threadId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    assistantId: {
      type: String,
      required: true
    },
    messages: [MessageSchema],
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Índice compuesto para consultas eficientes
ThreadSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IThread>('Thread', ThreadSchema);