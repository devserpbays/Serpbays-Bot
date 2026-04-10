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
  '/api/extension/ping',
  '/api/extension/tasks(.*)',
  '/api/extension/settings',
  '/api/extension/status',
  '/api/extension/scrape',
  '/api/extension/log',
  '/api/extension/immediate',
])

const isAuthRoute = createRouteMatcher(['/login(.*)', '/signup(.*)'])
const isLegacyAuthRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/register(.*)'])

const isDashboardRoute = createRouteMatcher(['/dashboard(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding'])
const isApiRoute = createRouteMatcher(['/api(.*)'])

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth()

  // Build the canonical origin from forwarded headers (behind nginx proxy)
  // Bug #4: Validate x-forwarded-host against allowed domains to prevent open redirect
  const ALLOWED_HOSTS = new Set([
    'localhost',
    'localhost:3005',
    'engageai.pro',
    'www.engageai.pro',
    'app.engageai.pro',
    ...(process.env.EXTRA_ALLOWED_HOSTS?.split(',').map(h => h.trim()).filter(Boolean) || []),
  ])
  const proto = req.headers.get('x-forwarded-proto') || 'http'
  const rawHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost'
  const host = ALLOWED_HOSTS.has(rawHost) ? rawHost : (req.headers.get('host') || 'localhost')
  const origin = `${proto}://${host}`

  // Handle CORS preflight for extension API routes
  const isExtensionRoute = req.nextUrl.pathname.startsWith('/api/extension/')
  if (isExtensionRoute && req.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 })
    res.headers.set('Access-Control-Allow-Origin', '*')
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Extension-Key')
    res.headers.set('Access-Control-Max-Age', '86400')
    return res
  }

  // Security headers on all responses
  const addSecurityHeaders = (res: NextResponse) => {
    res.headers.set('X-Frame-Options', 'DENY')
    res.headers.set('X-Content-Type-Options', 'nosniff')
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.headers.set('X-DNS-Prefetch-Control', 'off')
    res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.headers.set('X-XSS-Protection', '1; mode=block')
    // Add CORS for extension API routes
    if (isExtensionRoute) {
      res.headers.set('Access-Control-Allow-Origin', '*')
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Extension-Key')
    }
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

  // Check onboarding status from Clerk metadata or fallback cookie.
  // (JWT may not have refreshed yet after completing onboarding)
  //
  // SECURITY NOTE (Bug #15): The ob_done cookie can be set by any client, so it
  // should NOT gate access to sensitive resources. It only controls the
  // onboarding-vs-dashboard redirect — a user who forges it merely skips being
  // redirected to /onboarding and lands on /dashboard (which is already
  // auth-protected). The Clerk JWT publicMetadata is the authoritative source;
  // the cookie is a grace-period fallback until the JWT refreshes.
  const clerkOnboardingDone =
    (sessionClaims?.publicMetadata as { onboardingCompleted?: boolean })?.onboardingCompleted === true
  const cookieOnboardingDone = req.cookies.get('ob_done')?.value === '1'
  // Prefer the Clerk JWT claim; only trust the cookie if JWT metadata is not yet populated
  const onboardingDone = clerkOnboardingDone || (!sessionClaims?.publicMetadata && cookieOnboardingDone)

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
