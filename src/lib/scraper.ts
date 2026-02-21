import { connectDB } from './mongodb';
import Post from '../models/Post';
import Settings from '../models/Settings';

interface ScrapedPost {
  url: string;
  author: string;
  content: string;
  platform: string;
}

const REDDIT_USER_AGENT = 'social-engagement-bot/1.0 (monitoring)';

// --- REDDIT SCRAPER (JSON API - no login needed) ---
async function scrapeRedditSearch(keyword: string, subreddits: string[]): Promise<ScrapedPost[]> {
  const posts: ScrapedPost[] = [];

  const urls = subreddits.length > 0
    ? subreddits.map(sr => `https://www.reddit.com/r/${sr}/search.json?q=${encodeURIComponent(keyword)}&sort=new&t=week&limit=25`)
    : [`https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&t=week&limit=25`];

  for (const apiUrl of urls) {
    try {
      const res = await fetch(apiUrl, {
        headers: { 'User-Agent': REDDIT_USER_AGENT },
      });

      if (!res.ok) {
        console.error(`Reddit API returned ${res.status} for ${apiUrl}`);
        continue;
      }

      const data = await res.json();
      const children = data?.data?.children || [];

      for (const child of children) {
        const post = child?.data;
        if (!post) continue;

        const title = post.title || '';
        const selftext = post.selftext || '';
        const content = [title, selftext].filter(Boolean).join('\n\n').trim();

        if (content.length < 15) continue;

        posts.push({
          url: `https://www.reddit.com${post.permalink}`,
          author: post.author || 'Unknown',
          content: content.slice(0, 2000),
          platform: 'reddit',
        });
      }
    } catch (err) {
      console.error(`Error fetching Reddit JSON for "${keyword}":`, err);
    }
  }

  return posts;
}

// --- TWITTER SCRAPER (via cookie-authenticated search API) ---
async function scrapeTwitterSearch(keyword: string): Promise<ScrapedPost[]> {
  const { searchTweets, isTwitterConfigured } = await import('./twitter');

  if (!isTwitterConfigured()) {
    console.warn('Twitter cookies not configured, skipping Twitter scrape');
    return [];
  }

  try {
    const tweets = await searchTweets(keyword, 25);

    return tweets
      .filter(t => t.text.length >= 15)
      .map(t => ({
        url: t.url,
        author: t.authorHandle || t.author,
        content: t.text.slice(0, 2000),
        platform: 'twitter' as const,
      }));
  } catch (err) {
    console.error(`Twitter cookie search failed for "${keyword}":`, (err as Error).message);
    return [];
  }
}

// --- FACEBOOK SCRAPER (via Playwright browser automation) ---
async function scrapeFacebookGroups(groupUrls: string[], keywords: string[]): Promise<ScrapedPost[]> {
  const { ensureFacebookLoggedIn, scrapeGroupPosts, closeBrowser } = await import('./facebook');

  const loggedIn = await ensureFacebookLoggedIn();
  if (!loggedIn) {
    throw new Error('Not logged in to Facebook. Run: npx tsx scripts/fb-login.ts');
  }

  const posts: ScrapedPost[] = [];

  for (const groupUrl of groupUrls) {
    try {
      const groupPosts = await scrapeGroupPosts(groupUrl, keywords);
      for (const p of groupPosts) {
        posts.push({
          url: p.url,
          author: p.author,
          content: p.content,
          platform: 'facebook',
        });
      }
      console.log(`Facebook: scraped ${groupPosts.length} posts from ${groupUrl}`);
    } catch (err) {
      console.error(`Facebook scrape error for ${groupUrl}:`, (err as Error).message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  await closeBrowser();
  return posts;
}

// --- MAIN SCRAPER ---
export async function runScraper(platforms?: string[]): Promise<{ newPosts: number; totalScraped: number; errors: string[] }> {
  await connectDB();

  const settings = await Settings.findOne();
  if (!settings) {
    throw new Error('No settings configured. Please set up company info and keywords first.');
  }

  if (!settings.keywords?.length) {
    throw new Error('No keywords configured for monitoring.');
  }

  const activePlatforms = platforms || settings.platforms || ['twitter', 'reddit'];
  const errors: string[] = [];

  let totalScraped = 0;
  let newPosts = 0;

  for (const keyword of settings.keywords) {
    // Scrape Reddit
    if (activePlatforms.includes('reddit')) {
      try {
        const redditPosts = await scrapeRedditSearch(keyword, settings.subreddits || []);
        totalScraped += redditPosts.length;
        for (const post of redditPosts) {
          const exists = await Post.findOne({ url: post.url });
          if (!exists) {
            await Post.create({
              ...post,
              keywordsMatched: [keyword],
            });
            newPosts++;
          }
        }
      } catch (err) {
        const msg = `Reddit error for "${keyword}": ${(err as Error).message}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    // Scrape Twitter/X
    if (activePlatforms.includes('twitter')) {
      try {
        const tweets = await scrapeTwitterSearch(keyword);
        totalScraped += tweets.length;
        for (const post of tweets) {
          const exists = await Post.findOne({ url: post.url });
          if (!exists) {
            await Post.create({
              ...post,
              keywordsMatched: [keyword],
            });
            newPosts++;
          }
        }
      } catch (err) {
        const msg = `Twitter error for "${keyword}": ${(err as Error).message}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    // Small delay between keywords to be polite
    await new Promise(r => setTimeout(r, 1000));
  }

  // Scrape Facebook groups (keyword-independent — groups scraped once per run)
  if (activePlatforms.includes('facebook')) {
    const fbGroups: string[] = settings.facebookGroups || [];
    const fbKeywords: string[] = settings.facebookKeywords?.length
      ? settings.facebookKeywords
      : settings.keywords;

    if (fbGroups.length === 0) {
      errors.push('Facebook enabled but no facebookGroups configured in settings');
    } else {
      try {
        const fbPosts = await scrapeFacebookGroups(fbGroups, fbKeywords);
        totalScraped += fbPosts.length;
        for (const post of fbPosts) {
          const exists = await Post.findOne({ url: post.url });
          if (!exists) {
            await Post.create({
              ...post,
              keywordsMatched: fbKeywords.filter(kw =>
                post.content.toLowerCase().includes(kw.toLowerCase())
              ),
            });
            newPosts++;
          }
        }
      } catch (err) {
        const msg = `Facebook error: ${(err as Error).message}`;
        console.error(msg);
        errors.push(msg);
      }
    }
  }

  return { newPosts, totalScraped, errors };
}
