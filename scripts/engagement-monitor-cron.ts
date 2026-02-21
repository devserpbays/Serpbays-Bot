/**
 * Engagement Monitor Cron Script
 *
 * Checks replies/engagement on bot's posted comments across all platforms.
 * Generates follow-up responses when someone replies to our comments.
 *
 * Schedule: every 30 minutes via node-cron in server.js
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { connectDB } from '../src/lib/mongodb';
import { askOpenClaw } from '../src/lib/openclaw';
import { scrapeCommentEngagement as redditScrape, closeBrowser as closeReddit } from '../src/lib/reddit';
import { scrapeCommentEngagement as facebookScrape, closeBrowser as closeFacebook } from '../src/lib/facebook';
import { scrapeCommentEngagement as linkedinScrape, closeBrowser as closeLinkedin } from '../src/lib/linkedin';
import Post from '../src/models/Post';

const MONITOR_DAYS = 7;
const MAX_POSTS_PER_RUN = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateFollowUp(
  originalComment: string,
  replyContent: string,
  replyAuthor: string,
  platform: string
): Promise<string> {
  const prompt = `Someone replied to your comment on ${platform}. Write a natural follow-up that continues the conversation.

YOUR ORIGINAL COMMENT:
"""
${originalComment.slice(0, 300)}
"""

THEIR REPLY (by ${replyAuthor}):
"""
${replyContent.slice(0, 300)}
"""

RULES:
- Write ONLY the follow-up text — no quotes, no labels
- Be conversational and natural — like a real person continuing a discussion
- Do NOT repeat Serpbays or any brand mention — you already mentioned it
- Keep it 1-2 sentences max
- Be helpful and engaging, not pushy
- Platform: ${platform}

Write the follow-up now:`;

  try {
    const raw = await askOpenClaw(prompt);
    let text = raw;

    if (text.trimStart().startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        text = parsed?.payloads?.[0]?.text || parsed?.content || parsed?.message || '';
      } catch {
        const m = text.match(/"text"\s*:\s*"([^"]+)"/);
        if (m) text = m[1];
      }
    }

    text = text
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\n/g, ' ')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (text.length > 300) text = text.slice(0, 297) + '...';
    return text;
  } catch (err) {
    console.error('Failed to generate follow-up:', (err as Error).message);
    return '';
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Engagement Monitor: starting`);

  await connectDB();

  const now = new Date();
  const monitorCutoff = new Date(now.getTime() - MONITOR_DAYS * 24 * 60 * 60 * 1000);

  // Find posted comments that should still be monitored
  const postsToMonitor = await Post.find({
    status: 'posted',
    postedAt: { $gte: monitorCutoff },
    $or: [
      { monitorUntil: { $exists: false } },
      { monitorUntil: null },
      { monitorUntil: { $gt: now } },
    ],
  })
    .sort({ postedAt: -1 })
    .limit(MAX_POSTS_PER_RUN);

  console.log(`Found ${postsToMonitor.length} posted comments to monitor`);

  for (const post of postsToMonitor) {
    const commentText = post.editedReply || post.aiReply || '';
    if (!commentText || !post.url) continue;

    console.log(`Checking engagement on ${post.platform}: ${post.url}`);

    // Set monitorUntil if not set
    if (!post.monitorUntil) {
      const monitorEnd = new Date((post.postedAt || now).getTime() + MONITOR_DAYS * 24 * 60 * 60 * 1000);
      await Post.findByIdAndUpdate(post._id, { monitorUntil: monitorEnd });
    }

    try {
      let engagement: { likes: number; replies: number; replyTexts: Array<{ author: string; content: string }> } = { likes: 0, replies: 0, replyTexts: [] };

      // Scrape engagement based on platform
      if (post.platform === 'reddit') {
        engagement = await redditScrape(post.url, commentText);
      } else if (post.platform === 'facebook') {
        engagement = await facebookScrape(post.url, commentText);
      } else if (post.platform === 'linkedin') {
        engagement = await linkedinScrape(post.url, commentText);
      } else if (post.platform === 'twitter') {
        // Twitter uses API — skip Playwright scraping for now
        console.log('  Twitter engagement monitoring via API (skipping Playwright)');
        continue;
      } else {
        continue;
      }

      console.log(`  Engagement: ${engagement.likes} likes, ${engagement.replies} replies`);

      // Update engagement data
      const updateData: Record<string, unknown> = {
        'botReplyEngagement.likes': engagement.likes,
        'botReplyEngagement.replies': engagement.replies,
        'botReplyEngagement.lastChecked': now,
      };

      await Post.findByIdAndUpdate(post._id, { $set: updateData });

      // Process new replies
      if (engagement.replyTexts.length > 0) {
        const existingReplies = post.botReplyReplies || [];
        const existingTexts = new Set(existingReplies.map((r: { content: string }) => r.content?.slice(0, 30)));

        for (const reply of engagement.replyTexts) {
          if (existingTexts.has(reply.content?.slice(0, 30))) continue;

          // New reply found — add to list
          await Post.findByIdAndUpdate(post._id, {
            $push: {
              botReplyReplies: {
                author: reply.author,
                content: reply.content,
                scrapedAt: now,
              },
            },
          });

          console.log(`  New reply from ${reply.author}: "${reply.content.slice(0, 60)}..."`);

          // Generate follow-up if none pending
          if (post.followUpStatus === 'none' || !post.followUpStatus) {
            const followUp = await generateFollowUp(commentText, reply.content, reply.author, post.platform);
            if (followUp && followUp.length >= 5) {
              await Post.findByIdAndUpdate(post._id, {
                followUpStatus: 'pending',
                followUpText: followUp,
              });
              console.log(`  Generated follow-up: "${followUp.slice(0, 60)}..."`);
            }
          }
        }
      }

      await sleep(3000); // Be polite between checks
    } catch (err) {
      console.error(`  Error monitoring ${post.url}:`, (err as Error).message);
    }
  }

  console.log(`[${new Date().toISOString()}] Engagement Monitor: complete`);

  // Close all browsers
  await Promise.all([
    closeReddit().catch(() => {}),
    closeFacebook().catch(() => {}),
    closeLinkedin().catch(() => {}),
  ]);

  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await Promise.all([
    closeReddit().catch(() => {}),
    closeFacebook().catch(() => {}),
    closeLinkedin().catch(() => {}),
  ]);
  process.exit(1);
});
