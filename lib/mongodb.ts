import mongoose from "mongoose";
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/assistant';

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB conectado');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
};

