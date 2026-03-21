import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/signup(.*)',
  '/reset-password(.*)',
  '/pricing',
  '/terms',
  '/privacy',
  '/api/billing/webhook',
  '/api/health',
])

const isAuthRoute = createRouteMatcher(['/login(.*)', '/signup(.*)'])
const isLegacyAuthRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/register(.*)'])

const isDashboardRoute = createRouteMatcher(['/dashboard(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding'])
const isApiRoute = createRouteMatcher(['/api(.*)'])

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth()

  // Build the canonical origin from forwarded headers (behind nginx proxy)
  const proto = req.headers.get('x-forwarded-proto') || 'http'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost'
  const origin = `${proto}://${host}`

  // Security headers on all responses
  const addSecurityHeaders = (res: NextResponse) => {
    res.headers.set('X-Frame-Options', 'DENY')
    res.headers.set('X-Content-Type-Options', 'nosniff')
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.headers.set('X-DNS-Prefetch-Control', 'off')
    res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.headers.set('X-XSS-Protection', '1; mode=block')
    return res
  }

  // Legacy auth URL aliases → redirect to canonical routes
  if (isLegacyAuthRoute(req)) {
    const pathname = req.nextUrl.pathname
    const dest = pathname.startsWith('/sign-up') || pathname.startsWith('/register') ? '/signup' : '/login'
    return addSecurityHeaders(NextResponse.redirect(new URL(dest, origin)))
  }

  // Already logged in and visiting login/signup → redirect to dashboard
  // (Dashboard middleware will bounce to /onboarding if onboarding isn't done yet)
  if (userId && isAuthRoute(req)) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', origin)))
  }

  // Public routes — no auth required
  // Exception: logged-in users on the home page → send to dashboard
  if (isPublicRoute(req)) {
    if (userId && req.nextUrl.pathname === '/') {
      return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', origin)))
    }
    return addSecurityHeaders(NextResponse.next())
  }

  // Not signed in on a protected route → redirect to login
  // Only protect dashboard, onboarding, and API routes; let unknown routes
  // pass through so Next.js can render the 404 page.
  if (!userId) {
    if (isDashboardRoute(req) || isOnboardingRoute(req) || isApiRoute(req)) {
      const loginUrl = new URL('/login', origin)
      loginUrl.searchParams.set('redirect_url', `${origin}${req.nextUrl.pathname}`)
      return addSecurityHeaders(NextResponse.redirect(loginUrl))
    }
    return addSecurityHeaders(NextResponse.next())
  }

  // Check onboarding status from Clerk metadata or fallback cookie
  // (JWT may not have refreshed yet after completing onboarding)
  const onboardingDone =
    (sessionClaims?.publicMetadata as { onboardingCompleted?: boolean })?.onboardingCompleted === true
    || req.cookies.get('ob_done')?.value === '1'

  // On onboarding page but already completed → go to dashboard
  if (isOnboardingRoute(req) && onboardingDone) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', origin)))
  }

  // On dashboard but hasn't completed onboarding → redirect to onboarding
  if (isDashboardRoute(req) && !onboardingDone) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/onboarding', origin)))
  }

  return addSecurityHeaders(NextResponse.next())
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
