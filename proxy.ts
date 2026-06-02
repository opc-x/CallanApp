import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "@/lib/utils";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next({ request });
  }

  const intlResponse = intlMiddleware(request);

  if (!hasEnvVars) {
    return intlResponse;
  }

  let supabaseResponse = intlResponse ?? NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { pathname } = request.nextUrl;
  const localeMatch = pathname.match(/^\/(zh)(\/|$)/);
  const locale = localeMatch ? localeMatch[1] : routing.defaultLocale;
  const isProtected = pathname.includes("/protected");

  if (process.env.DEV_BYPASS_AUTH === "true") {
    return supabaseResponse;
  }

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/auth/login`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
