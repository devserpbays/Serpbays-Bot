import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };
global.mongooseCache = cached;

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    // Read URI at call time so dotenv has a chance to load first
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-engagement-bot';
    const isWorker = !!process.env.WORKER_PROCESS;
    cached.promise = mongoose.connect(uri, {
      maxPoolSize: isWorker ? 15 : 50,
      minPoolSize: isWorker ? 2 : 5,
      serverSelectionTimeoutMS: 10000,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
