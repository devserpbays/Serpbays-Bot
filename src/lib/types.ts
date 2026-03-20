export type PostStatus = 'new' | 'evaluating' | 'evaluated' | 'approved' | 'rejected' | 'posted';

export interface IPost {
  _id?: string;
  url: string;
  platform: string;
  author: string;
  content: string;
  scrapedAt: Date;
  status: PostStatus;
  aiReply?: string;
  aiRelevanceScore?: number;
  aiTone?: string;
  aiReasoning?: string;
  keywordsMatched?: string[];
  editedReply?: string;
  replyUrl?: string;
  evaluatedAt?: Date;
  approvedAt?: Date;
  postedAt?: Date;
  postedByAccount?: string;
}

export interface SocialAccount {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  profileDir: string;
  accountIndex: number;
  addedAt: string;
  active?: boolean;
  verifiedAt?: string;   // ISO string — when cookies were last verified
  cookieVerified?: boolean;
}

export interface ISettings {
  _id?: string;
  companyName: string;
  companyDescription: string;
  keywords: string[];
  platforms: string[];
  subreddits: string[];
  promptTemplate: string;
  socialAccounts?: SocialAccount[];
  facebookGroups?: string[];
  facebookKeywords?: string[];
  facebookDailyLimit?: number;
  facebookAutoPostThreshold?: number;
  facebookBrandMentionRate?: number;
  facebookCooldownMinutes?: number;
  twitterKeywords?: string[];
  twitterCommunityIds?: string[];
  twitterDailyLimit?: number;
  twitterAutoPostThreshold?: number;
  twitterBrandMentionRate?: number;
  twitterCooldownMinutes?: number;
  redditKeywords?: string[];
  redditDailyLimit?: number;
  redditAutoPostThreshold?: number;
  redditBrandMentionRate?: number;
  redditCooldownMinutes?: number;
  quoraKeywords?: string[];
  quoraDailyLimit?: number;
  quoraAutoPostThreshold?: number;
  quoraBrandMentionRate?: number;
  quoraCooldownMinutes?: number;
  youtubeKeywords?: string[];
  youtubeDailyLimit?: number;
  youtubeAutoPostThreshold?: number;
  youtubeBrandMentionRate?: number;
  youtubeCooldownMinutes?: number;
  pinterestKeywords?: string[];
  pinterestDailyLimit?: number;
  pinterestAutoPostThreshold?: number;
  pinterestBrandMentionRate?: number;
  pinterestCooldownMinutes?: number;
  cronTimezone?: string;
  cronStartHour?: number;
  cronEndHour?: number;
  cronDays?: number[];
  cronIntervalMinutes?: number;
  notificationEmail?: string;
  notifyViaEmail?: boolean;
}

export interface AIEvaluation {
  relevant: boolean;
  score: number;
  suggestedReply: string;
  tone: string;
  reasoning: string;
}
