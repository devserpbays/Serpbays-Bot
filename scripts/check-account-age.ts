import connectDB from '../src/lib/db';
import Settings from '../src/models/Settings';

async function main() {
  await connectDB();
  const s = await Settings.findOne({ userId: 'user_3AbWsUIAEJFqWQTTaRlhNYaiWPH' }).lean() as any;
  const acc = s?.socialAccounts?.find((a: any) => a.platform === 'twitter');
  console.log('Twitter addedAt:', acc?.addedAt ?? 'NOT SET');
  const days = acc?.addedAt ? ((Date.now() - new Date(acc.addedAt).getTime()) / 86400000).toFixed(1) : null;
  console.log('Days old:', days ?? 'unknown — warmup defaults to limit=1');
  process.exit(0);
}
main().catch(console.error);
