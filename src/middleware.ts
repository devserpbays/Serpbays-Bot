import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/signup(.*)',
  '/pricing',
  '/terms',
  '/privacy',
  '/api/billing/webhook',
])

const isDashboardRoute = createRouteMatcher(['/dashboard(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding'])
const isApiRoute = createRouteMatcher(['/api(.*)'])

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth()

  // Public routes — no auth required
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // Not signed in on a protected route → redirect to login
  // Only protect dashboard, onboarding, and API routes; let unknown routes
  // pass through so Next.js can render the 404 page.
  if (!userId) {
    if (isDashboardRoute(req) || isOnboardingRoute(req) || isApiRoute(req)) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('redirect_url', req.url)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // Check onboarding status from Clerk metadata or fallback cookie
  // (JWT may not have refreshed yet after completing onboarding)
  const onboardingDone =
    (sessionClaims?.publicMetadata as { onboardingCompleted?: boolean })?.onboardingCompleted === true
    || req.cookies.get('ob_done')?.value === '1'

  // On onboarding page but already completed → go to dashboard
  if (isOnboardingRoute(req) && onboardingDone) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // On dashboard but hasn't completed onboarding → redirect to onboarding
  if (isDashboardRoute(req) && !onboardingDone) {
    return NextResponse.redirect(new URL('/onboarding', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
