import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const BYPASS = /^\/(api|manifest\.webmanifest|icon|apple-icon|manifest-icon)(\/|$)/;

export async function proxy(request: NextRequest) {
  if (BYPASS.test(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!api|manifest\\.webmanifest|icon|apple-icon|manifest-icon|_next/static|_next/image|favicon.ico|audio/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)",
  ],
};
