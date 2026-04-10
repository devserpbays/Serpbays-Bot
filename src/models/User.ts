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

export interface IUserModel extends Model<IUser> {
  cascadeDeleteUser(userId: string): Promise<{ deletedFrom: string[] }>;
}

const UserSchema = new Schema<IUser>({
  clerkId: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

/**
 * Delete all data associated with a userId across every collection.
 * Call this instead of manually deleting from each collection to ensure
 * no orphaned documents remain.
 */
UserSchema.statics.cascadeDeleteUser = async function (userId: string): Promise<{ deletedFrom: string[] }> {
  // Lazy-require models to avoid circular dependency issues
  const Settings = mongoose.model('Settings');
  const Post = mongoose.model('Post');
  const AccountState = mongoose.model('AccountState');
  const Subscription = mongoose.model('Subscription');
  const ActivityLog = mongoose.model('ActivityLog');
  const Notification = mongoose.model('Notification');
  const TwitterFollowed = mongoose.model('TwitterFollowed');

  const results = await Promise.all([
    Settings.deleteMany({ userId }),
    Post.deleteMany({ userId }),
    AccountState.deleteMany({ userId }),
    Subscription.deleteMany({ userId }),
    ActivityLog.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    TwitterFollowed.deleteMany({ userId }),
  ]);

  const collectionNames = [
    'Settings', 'Post', 'AccountState', 'Subscription',
    'ActivityLog', 'Notification', 'TwitterFollowed',
  ];

  const deletedFrom = collectionNames.filter((_, i) => results[i].deletedCount > 0);
  return { deletedFrom };
};

const User: IUserModel = (mongoose.models.User as IUserModel) || mongoose.model<IUser, IUserModel>('User', UserSchema);
export default User;
