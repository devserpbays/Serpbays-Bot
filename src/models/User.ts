// User authentication is now managed by Clerk.
// This model is kept only for any business-logic fields
// that cannot be stored in Clerk publicMetadata.
// The clerk userId (e.g. "user_abc123") is used as the foreign key
// in Settings and Post models.

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  clerkId: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  clerkId: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export default User;
