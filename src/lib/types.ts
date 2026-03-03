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
  twitterKeywords?: string[];
  twitterDailyLimit?: number;
  twitterAutoPostThreshold?: number;
  redditKeywords?: string[];
  redditDailyLimit?: number;
  redditAutoPostThreshold?: number;
  quoraKeywords?: string[];
  quoraDailyLimit?: number;
  quoraAutoPostThreshold?: number;
  youtubeKeywords?: string[];
  youtubeDailyLimit?: number;
  youtubeAutoPostThreshold?: number;
  pinterestKeywords?: string[];
  pinterestDailyLimit?: number;
  pinterestAutoPostThreshold?: number;
}

export interface AIEvaluation {
  relevant: boolean;
  score: number;
  suggestedReply: string;
  tone: string;
  reasoning: string;
}
