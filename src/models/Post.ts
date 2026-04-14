import mongoose, { Schema } from 'mongoose';

const PostSchema = new Schema({
  userId: { type: String, index: true, sparse: true },
  url: { type: String, required: true },
  platform: { type: String, default: 'facebook' },
  author: { type: String, default: 'Unknown' },
  content: { type: String, required: true },
  scrapedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['new', 'evaluating', 'evaluated', 'approved', 'rejected', 'posted', 'skipped'],
    default: 'new',
  },
  skipReason: { type: String, default: '' },
  aiReply: String,
  aiRelevanceScore: Number,
  aiTone: String,
  aiReasoning: String,
  keywordsMatched: [String],
  likeCount: { type: Number, default: 0 },
  retweetCount: { type: Number, default: 0 },
  replyCount: { type: Number, default: 0 },
  bookmarkCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  likedByBot: { type: Boolean, default: false },
  botReaction: { type: String, default: '' }, // 'Like' | 'Love' | 'Care' | 'Haha' | 'Wow' | 'Sad' | 'Angry'
  sharedByBot:      { type: Boolean, default: false },
  retweetedByBot:   { type: Boolean, default: false },
  bookmarkedByBot:  { type: Boolean, default: false },
  crosspostedByBot: { type: Boolean, default: false },
  pinterestHeartLiked: { type: Boolean, default: false },
  subscribedByBot: { type: Boolean, default: false },
  isShort: { type: Boolean, default: false },
  editedReply: String,
  replyUrl: String,
  // Quora-specific: URL of the answer as it appears on /stats — proves the
  // answer is actually published and visible on the user's content page.
  verifiedAnswerUrl: String,
  verifiedAt: Date,
  evaluatedAt: Date,
  approvedAt: Date,
  postedAt: Date,
  postedByAccount: { type: String, default: '' },
  // Reply monitoring (Feature 3)
  botReplyEngagement: {
    likes: { type: Number, default: 0 },
    replies: { type: Number, default: 0 },
    lastChecked: Date,
  },
  botReplyReplies: [{
    author: String,
    content: String,
    scrapedAt: { type: Date, default: Date.now },
  }],
  followUpStatus: {
    type: String,
    enum: ['none', 'pending', 'posted', 'skipped'],
    default: 'none',
  },
  followUpText: String,
  followUpPostedAt: Date,
  monitorUntil: Date,
  isOriginalTweet: { type: Boolean, default: false },
  postAttempts: { type: Number, default: 0 },
  evaluationAttempts: { type: Number, default: 0 },
  // TTL: auto-delete terminal posts after expiry
  ttlExpireAt: { type: Date, default: null },
}, { timestamps: true });

PostSchema.index({ userId: 1, url: 1 }, { unique: true });
PostSchema.index({ status: 1 });
PostSchema.index({ aiRelevanceScore: -1 });
PostSchema.index({ scrapedAt: -1 });
PostSchema.index({ platform: 1, postedByAccount: 1, postedAt: -1 });
PostSchema.index({ platform: 1, status: 1, postedAt: -1 });
PostSchema.index({ userId: 1, platform: 1, status: 1 });
PostSchema.index({ userId: 1, postedAt: -1 });
PostSchema.index({ ttlExpireAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export default mongoose.models.Post || mongoose.model('Post', PostSchema);
