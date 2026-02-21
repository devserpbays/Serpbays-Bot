import { NextResponse } from 'next/server';

// bot-serp has no authentication — allow all requests.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
