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
}

export interface ISettings {
  _id?: string;
  companyName: string;
  companyDescription: string;
  keywords: string[];
  platforms: string[];
  subreddits: string[];
  promptTemplate: string;
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
  linkedinKeywords?: string[];
  linkedinDailyLimit?: number;
  linkedinAutoPostThreshold?: number;
}

export interface AIEvaluation {
  relevant: boolean;
  score: number;
  suggestedReply: string;
  tone: string;
  reasoning: string;
}
