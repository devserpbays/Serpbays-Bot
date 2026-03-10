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

/**
 * Resolve keywords for a specific platform.
 * Priority: platformKeywords > global keywords.
 * Returns empty array if nothing configured.
 */
function getKeywordsForPlatform(settings: any, platform: string): string[] {
  const platformField = `${platform}Keywords`;
  const platformKw: string[] | undefined = settings[platformField];
  if (platformKw && platformKw.length > 0) return platformKw;
  if (settings.keywords?.length) return settings.keywords;
  return [];
}

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
    throw new Error('Not logged in to Facebook. Set cookies from dashboard.');
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
export async function runScraper(platforms?: string[], userId?: string): Promise<{ newPosts: number; totalScraped: number; errors: string[] }> {
  await connectDB();

  const settingsQuery = userId ? { userId } : {};
  const settings = await Settings.findOne(settingsQuery);
  if (!settings) {
    throw new Error('No settings configured. Please set up company info and keywords first.');
  }

  const activePlatforms = platforms || settings.platforms || [];
  if (activePlatforms.length === 0) {
    throw new Error('No platforms enabled. Enable platforms in dashboard settings.');
  }

  const errors: string[] = [];
  let totalScraped = 0;
  let newPosts = 0;

  // Helper: check duplicate and create post scoped to this user
  const upsertPost = async (post: ScrapedPost, keywordsMatched: string[]) => {
    const dupQuery = userId ? { userId, url: post.url } : { url: post.url };
    const exists = await Post.findOne(dupQuery);
    if (!exists) {
      await Post.create({ ...post, keywordsMatched, ...(userId && { userId }) });
      newPosts++;
    }
  };

  // --- Reddit: scrape per keyword ---
  if (activePlatforms.includes('reddit')) {
    const keywords = getKeywordsForPlatform(settings, 'reddit');
    if (keywords.length === 0) {
      errors.push('Reddit enabled but no keywords configured');
    } else {
      for (const keyword of keywords) {
        try {
          const redditPosts = await scrapeRedditSearch(keyword, settings.subreddits || []);
          totalScraped += redditPosts.length;
          for (const post of redditPosts) {
            await upsertPost(post, [keyword]);
          }
        } catch (err) {
          const msg = `Reddit error for "${keyword}": ${(err as Error).message}`;
          console.error(msg);
          errors.push(msg);
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // --- Twitter: scrape per keyword ---
  if (activePlatforms.includes('twitter')) {
    const keywords = getKeywordsForPlatform(settings, 'twitter');
    if (keywords.length === 0) {
      errors.push('Twitter enabled but no keywords configured');
    } else {
      for (const keyword of keywords) {
        try {
          const tweets = await scrapeTwitterSearch(keyword);
          totalScraped += tweets.length;
          for (const post of tweets) {
            await upsertPost(post, [keyword]);
          }
        } catch (err) {
          const msg = `Twitter error for "${keyword}": ${(err as Error).message}`;
          console.error(msg);
          errors.push(msg);
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // --- Facebook: scrape groups with keywords ---
  if (activePlatforms.includes('facebook')) {
    const keywords = getKeywordsForPlatform(settings, 'facebook');
    const fbGroups: string[] = settings.facebookGroups || [];

    if (fbGroups.length === 0) {
      errors.push('Facebook enabled but no Facebook groups configured');
    } else if (keywords.length === 0) {
      errors.push('Facebook enabled but no keywords configured');
    } else {
      try {
        const fbPosts = await scrapeFacebookGroups(fbGroups, keywords);
        totalScraped += fbPosts.length;
        for (const post of fbPosts) {
          await upsertPost(post, keywords.filter(kw =>
            post.content.toLowerCase().includes(kw.toLowerCase())
          ));
        }
      } catch (err) {
        const msg = `Facebook error: ${(err as Error).message}`;
        console.error(msg);
        errors.push(msg);
      }
    }
  }

  // --- YouTube: scrape videos by keywords ---
  if (activePlatforms.includes('youtube')) {
    const keywords = getKeywordsForPlatform(settings, 'youtube');
    if (keywords.length === 0) {
      errors.push('YouTube enabled but no keywords configured');
    } else {
      try {
        const { ensureYouTubeLoggedIn, scrapeYouTubeVideos, closeBrowser } = await import('./youtube');
        const profileDir = settings.socialAccounts?.find((a: any) => a.platform === 'youtube')?.profileDir
          || '.youtube-profile';
        const fullProfileDir = require('path').join(process.cwd(), profileDir);

        const loggedIn = await ensureYouTubeLoggedIn(fullProfileDir);
        if (!loggedIn) {
          errors.push('YouTube: not logged in. Set cookies from dashboard.');
        } else {
          const videos = await scrapeYouTubeVideos(keywords, fullProfileDir);
          totalScraped += videos.length;
          for (const v of videos) {
            await upsertPost({
              url: v.url,
              author: v.author,
              content: v.content,
              platform: 'youtube',
            }, keywords.filter(kw => v.content.toLowerCase().includes(kw.toLowerCase())));
          }
          console.log(`YouTube: scraped ${videos.length} videos`);
          await closeBrowser(fullProfileDir);
        }
      } catch (err) {
        const msg = `YouTube error: ${(err as Error).message}`;
        console.error(msg);
        errors.push(msg);
      }
    }
  }

  // --- Pinterest: scrape pins by keywords ---
  if (activePlatforms.includes('pinterest')) {
    const keywords = getKeywordsForPlatform(settings, 'pinterest');
    if (keywords.length === 0) {
      errors.push('Pinterest enabled but no keywords configured');
    } else {
      try {
        const { ensurePinterestLoggedIn, scrapePinterestPins, closeBrowser } = await import('./pinterest');
        const profileDir = settings.socialAccounts?.find((a: any) => a.platform === 'pinterest')?.profileDir
          || '.pinterest-profile';
        const fullProfileDir = require('path').join(process.cwd(), profileDir);

        const loggedIn = await ensurePinterestLoggedIn(fullProfileDir);
        if (!loggedIn) {
          errors.push('Pinterest: not logged in. Set cookies from dashboard.');
        } else {
          const pins = await scrapePinterestPins(keywords, fullProfileDir);
          totalScraped += pins.length;
          for (const p of pins) {
            await upsertPost({
              url: p.url,
              author: p.author,
              content: p.content,
              platform: 'pinterest',
            }, keywords.filter(kw => p.content.toLowerCase().includes(kw.toLowerCase())));
          }
          console.log(`Pinterest: scraped ${pins.length} pins`);
          await closeBrowser(fullProfileDir);
        }
      } catch (err) {
        const msg = `Pinterest error: ${(err as Error).message}`;
        console.error(msg);
        errors.push(msg);
      }
    }
  }

  // --- Quora: scrape questions by keywords ---
  if (activePlatforms.includes('quora')) {
    const keywords = getKeywordsForPlatform(settings, 'quora');
    if (keywords.length === 0) {
      errors.push('Quora enabled but no keywords configured');
    } else {
      try {
        const { ensureQuoraLoggedIn, scrapeQuoraQuestions, closeBrowser } = await import('./quora');

        const loggedIn = await ensureQuoraLoggedIn();
        if (!loggedIn) {
          errors.push('Quora: not logged in. Set cookies from dashboard.');
        } else {
          const questions = await scrapeQuoraQuestions(keywords);
          totalScraped += questions.length;
          for (const q of questions) {
            await upsertPost({
              url: q.url,
              author: q.author,
              content: q.content,
              platform: 'quora',
            }, keywords.filter(kw => q.content.toLowerCase().includes(kw.toLowerCase())));
          }
          console.log(`Quora: scraped ${questions.length} questions`);
          await closeBrowser();
        }
      } catch (err) {
        const msg = `Quora error: ${(err as Error).message}`;
        console.error(msg);
        errors.push(msg);
      }
    }
  }

  return { newPosts, totalScraped, errors };
}
