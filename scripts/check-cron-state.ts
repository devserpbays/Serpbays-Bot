import { config } from 'dotenv'; config({ path: '.env.local' });
import { connectDB } from '../src/lib/mongodb';
import Settings from '../src/models/Settings';
import Post from '../src/models/Post';
import BrowserCookie from '../src/models/BrowserCookie';
import { getTodayStartUTC, getHourInTimezone, isWithinSchedule } from '../src/lib/schedule';

async function main() {
  await connectDB();
  const settings = await Settings.findOne({}).lean() as any;
  const tz = settings?.cronTimezone || 'America/New_York';
  const todayStart = getTodayStartUTC(tz);
  const hour = getHourInTimezone(tz);

  console.log('\n=== CRON STATE CHECK ===');
  console.log('Timezone:', tz);
  console.log('Current hour in tz:', hour);
  const days = settings?.cronDays ?? [0,1,2,3,4,5,6];
  const startHour = settings?.cronStartHour ?? 9;
  const endHour = settings?.cronEndHour ?? 18;
  console.log('Schedule: hours', startHour, '-', endHour, '| days:', days);
  const inSchedule = isWithinSchedule({ timezone: tz, days, startHour, endHour });
  console.log('Within schedule:', inSchedule);

  const twCount = await Post.countDocuments({ platform: 'twitter', status: 'posted', postedAt: { $gte: todayStart } });
  const fbCount = await Post.countDocuments({ platform: 'facebook', status: 'posted', postedAt: { $gte: todayStart } });
  console.log('\nTwitter posts today:', twCount, '/', settings?.twitterDailyLimit ?? 4);
  console.log('Facebook posts today:', fbCount, '/', settings?.facebookDailyLimit ?? 3);

  const twHealth = await BrowserCookie.findOne({ platform: 'twitter' }).lean() as any;
  const fbHealth = await BrowserCookie.findOne({ platform: 'facebook' }).lean() as any;
  console.log('\nTwitter health:', twHealth?.healthScore ?? 'N/A', '| autoPaused:', twHealth?.autoPaused ?? false, '| backoffUntil:', twHealth?.backoffUntil ?? 'none');
  console.log('Facebook health:', fbHealth?.healthScore ?? 'N/A', '| autoPaused:', fbHealth?.autoPaused ?? false, '| backoffUntil:', fbHealth?.backoffUntil ?? 'none');

  const lastTw = await Post.findOne({ platform: 'twitter', status: 'posted', isOriginalTweet: { $ne: true } }).sort({ postedAt: -1 }).lean() as any;
  const lastFb = await Post.findOne({ platform: 'facebook', status: 'posted' }).sort({ postedAt: -1 }).lean() as any;
  const twCooldown = settings?.twitterCooldownMinutes ?? 60;
  const fbCooldown = settings?.facebookCooldownMinutes ?? 90;
  const twElapsed = lastTw ? Math.round((Date.now() - new Date(lastTw.postedAt).getTime()) / 60000) : Infinity;
  const fbElapsed = lastFb ? Math.round((Date.now() - new Date(lastFb.postedAt).getTime()) / 60000) : Infinity;
  console.log('\nLast Twitter post:', lastTw?.postedAt ?? 'never', '| cooldown:', twCooldown + 'min | elapsed:', twElapsed === Infinity ? 'never posted' : twElapsed + 'min | OK:', twElapsed >= twCooldown);
  console.log('Last Facebook post:', lastFb?.postedAt ?? 'never', '| cooldown:', fbCooldown + 'min | elapsed:', fbElapsed === Infinity ? 'never posted' : fbElapsed + 'min | OK:', fbElapsed >= fbCooldown);

  const twPending = await Post.countDocuments({ platform: 'twitter', status: 'evaluated', aiRelevanceScore: { $gte: settings?.twitterAutoPostThreshold ?? 70 } });
  const fbPending = await Post.countDocuments({ platform: 'facebook', status: 'evaluated', aiRelevanceScore: { $gte: settings?.facebookAutoPostThreshold ?? 70 } });
  console.log('\nTwitter pending posts (score >=', settings?.twitterAutoPostThreshold ?? 70, '):', twPending);
  console.log('Facebook pending posts (score >=', settings?.facebookAutoPostThreshold ?? 70, '):', fbPending);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
