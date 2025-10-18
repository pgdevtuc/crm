import mongoose, { Schema, Document } from 'mongoose';

export interface IConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface IConversation extends Document {
  conversationId: string;
  userId: string;
  messages: IConversationMessage[];
  state: Record<string, any>; // Estado del grafo
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationMessageSchema = new Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  }
}, { _id: false });

const ConversationSchema: Schema = new Schema(
  {
    conversationId: {
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
    messages: [ConversationMessageSchema],
    state: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    },
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

// Índice compuesto
ConversationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IConversation>('Conversation', ConversationSchema);