import { createBrowserClient } from "@supabase/ssr";
import { DEV_USER_ID } from "@/lib/supabase/admin";

const DEV_USER = {
  id: DEV_USER_ID,
  email: "dev@callanapp.local",
  user_metadata: {} as Record<string, unknown>,
  app_metadata: {} as Record<string, unknown>,
  aud: "authenticated",
  created_at: new Date().toISOString(),
};

export function createClient() {
  const real = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );

  if (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH !== "true") return real;

  return {
    ...real,
    auth: {
      ...real.auth,
      getUser: async () => ({ data: { user: DEV_USER }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
