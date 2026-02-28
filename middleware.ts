import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isLoginPage = nextUrl.pathname === '/login';
  const isAdminRoute = nextUrl.pathname.startsWith('/admin');
  const isApiAuthRoute = nextUrl.pathname.startsWith('/api/auth');

  if (isApiAuthRoute) return NextResponse.next();
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', nextUrl));
  }
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/', nextUrl));
  }
  if (isAdminRoute && req.auth) {
    const role = (req.auth.user as { role?: string }).role;
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/', nextUrl));
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
