import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await currentUser();
  return NextResponse.json({
    id: userId,
    email: user?.emailAddresses[0]?.emailAddress,
    name: user?.fullName,
    image: user?.imageUrl,
  });
}
