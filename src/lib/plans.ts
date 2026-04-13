export interface PlanLimits {
  platforms: number;
  // Fixed, non-negotiable list of platforms a plan user has access to.
  // Users CANNOT toggle platforms off — they're locked to their plan tier.
  // This prevents users from swapping platforms around to circumvent daily limits.
  allowedPlatforms: readonly string[];
  dailyPostsPerPlatform: number;
  keywords: number;
  autoPosting: boolean;
  cronScheduling: boolean;
  prioritySupport: boolean;
}

export interface PlanDef {
  id: string;
  name: string;
  price: number; // monthly USD
  priceYearly: number; // yearly USD
  description: string;
  limits: PlanLimits;
  features: string[];
  paypalPlanId: string;
  paypalPlanIdYearly: string;
  popular?: boolean;
}

// ── Fixed platform tiers ────────────────────────────────────────────────
// Each plan gets a FIXED set of platforms. Users cannot toggle these off
// or swap in other platforms — the list is determined entirely by the plan.
//
// Tier ladder:
//   Free:     Twitter                                     (1 platform)
//   Pro:      Twitter, Facebook, Pinterest, Skool         (4 platforms)
//   Business: all 7 platforms                             (Twitter, Facebook,
//             Pinterest, Skool, Reddit, Quora, YouTube)

const FREE_PLATFORMS     = ['twitter'] as const;
const PRO_PLATFORMS      = ['twitter', 'facebook', 'pinterest', 'skool'] as const;
const BUSINESS_PLATFORMS = ['twitter', 'facebook', 'pinterest', 'skool', 'reddit', 'quora', 'youtube'] as const;

export const PLANS: Record<string, PlanDef> = {
  free: {
    id: 'free',
    name: 'Starter',
    price: 0,
    priceYearly: 0,
    description: 'Get started with Twitter engagement',
    paypalPlanId: '',
    paypalPlanIdYearly: '',
    limits: {
      platforms: FREE_PLATFORMS.length,
      allowedPlatforms: FREE_PLATFORMS,
      dailyPostsPerPlatform: 3,
      keywords: 5,
      autoPosting: false,
      cronScheduling: false,
      prioritySupport: false,
    },
    features: [
      'Twitter / X only',
      '3 posts per day',
      '5 keywords',
      'AI-powered replies',
      'Manual posting only',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 49,
    priceYearly: 470,
    description: 'Scale engagement across 4 core platforms',
    paypalPlanId: process.env.PAYPAL_PLAN_PRO || '',
    paypalPlanIdYearly: process.env.PAYPAL_PLAN_PRO_YEARLY || '',
    popular: true,
    limits: {
      platforms: PRO_PLATFORMS.length,
      allowedPlatforms: PRO_PLATFORMS,
      dailyPostsPerPlatform: 15,
      keywords: 25,
      autoPosting: true,
      cronScheduling: true,
      prioritySupport: false,
    },
    features: [
      'Twitter, Facebook, Pinterest, Skool',
      '15 posts per day per platform',
      '25 keywords',
      'AI-powered replies',
      'Auto-posting',
      'Cron scheduling',
      'Activity logs',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 149,
    priceYearly: 1430,
    description: 'Full power across all 7 platforms',
    paypalPlanId: process.env.PAYPAL_PLAN_BUSINESS || '',
    paypalPlanIdYearly: process.env.PAYPAL_PLAN_BUSINESS_YEARLY || '',
    limits: {
      platforms: BUSINESS_PLATFORMS.length,
      allowedPlatforms: BUSINESS_PLATFORMS,
      dailyPostsPerPlatform: 50,
      keywords: 100,
      autoPosting: true,
      cronScheduling: true,
      prioritySupport: true,
    },
    features: [
      'All 7 platforms (+ Reddit, Quora, YouTube)',
      '50 posts per day per platform',
      '100 keywords',
      'AI-powered replies',
      'Auto-posting',
      'Cron scheduling',
      'Activity logs',
      'Priority support',
    ],
  },
};

export function getPlanLimits(planId: string): PlanLimits {
  return PLANS[planId]?.limits || PLANS.free.limits;
}

/**
 * Return the fixed platform list for a plan. This is the SINGLE source of
 * truth for which platforms a user can use — the UI should render these as
 * locked/enabled and the backend should enforce them on every settings save.
 */
export function getAllowedPlatforms(planId: string): readonly string[] {
  return PLANS[planId]?.limits.allowedPlatforms || PLANS.free.limits.allowedPlatforms;
}
