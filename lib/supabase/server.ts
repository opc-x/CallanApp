import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient, DEV_USER_ID } from "@/lib/supabase/admin";

const DEV_USER = {
  id: DEV_USER_ID,
  email: "dev@callanapp.local",
  user_metadata: {} as Record<string, unknown>,
  app_metadata: {} as Record<string, unknown>,
  aud: "authenticated",
  created_at: new Date().toISOString(),
};

export async function createClient() {
  const cookieStore = await cookies();

  const realClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component — safe to ignore
          }
        },
      },
    },
  );

  if (process.env.DEV_BYPASS_AUTH !== "true") return realClient;

  const admin = createAdminClient();
  const db = admin ?? realClient;

  return {
    auth: {
      getUser: async () => ({ data: { user: DEV_USER }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: realClient.auth.signOut.bind(realClient.auth),
    },
    from: db.from.bind(db),
    rpc: db.rpc.bind(db),
    storage: db.storage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
