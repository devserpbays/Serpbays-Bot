import mongoose, { Schema } from 'mongoose';

const TwitterFollowedSchema = new Schema({
  userId: { type: String, required: true, index: true },   // our app user
  targetHandle: { type: String, required: true },           // @username without @
  followedAt: { type: Date, default: Date.now },
  unfollowedAt: { type: Date, default: null },
  isFollowing: { type: Boolean, default: true, index: true },
}, { timestamps: true });

TwitterFollowedSchema.index({ userId: 1, targetHandle: 1 }, { unique: true });
TwitterFollowedSchema.index({ userId: 1, isFollowing: 1, followedAt: 1 });

export default mongoose.models.TwitterFollowed
  || mongoose.model('TwitterFollowed', TwitterFollowedSchema);
