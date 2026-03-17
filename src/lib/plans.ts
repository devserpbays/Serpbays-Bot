export interface PlanLimits {
  platforms: number;
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

export const PLANS: Record<string, PlanDef> = {
  free: {
    id: 'free',
    name: 'Starter',
    price: 0,
    priceYearly: 0,
    description: 'Get started with basic social engagement',
    paypalPlanId: '',
    paypalPlanIdYearly: '',
    limits: {
      platforms: 2,
      dailyPostsPerPlatform: 3,
      keywords: 5,
      autoPosting: false,
      cronScheduling: false,
      prioritySupport: false,
    },
    features: [
      '2 social platforms',
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
    description: 'Scale your engagement across platforms',
    paypalPlanId: process.env.PAYPAL_PLAN_PRO || '',
    paypalPlanIdYearly: process.env.PAYPAL_PLAN_PRO_YEARLY || '',
    popular: true,
    limits: {
      platforms: 4,
      dailyPostsPerPlatform: 15,
      keywords: 25,
      autoPosting: true,
      cronScheduling: true,
      prioritySupport: false,
    },
    features: [
      '4 social platforms',
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
    description: 'Full power for agencies and teams',
    paypalPlanId: process.env.PAYPAL_PLAN_BUSINESS || '',
    paypalPlanIdYearly: process.env.PAYPAL_PLAN_BUSINESS_YEARLY || '',
    limits: {
      platforms: 6,
      dailyPostsPerPlatform: 50,
      keywords: 100,
      autoPosting: true,
      cronScheduling: true,
      prioritySupport: true,
    },
    features: [
      'All 6 platforms',
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
