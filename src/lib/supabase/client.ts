import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client for use in browser (Client Component) contexts.
 *
 * Usage:
 *   const supabase = createClient();
 *   const { data, error } = await supabase.from("table").select();
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const proofUploadPath = `${url.replace(/\/$/, "")}/storage/v1/object/proof-media/`;
  return createBrowserClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (input, init) => {
          const requestUrl = input instanceof Request ? input.url : String(input);
          if (init?.method === "POST" && requestUrl.startsWith(proofUploadPath) && !init.signal) {
            // Storage upload does not expose a per-request abort signal.
            // Bound the request so a stalled connection can be retried.
            return fetch(input, { ...init, signal: AbortSignal.timeout(60_000) });
          }
          return fetch(input, init);
        },
      },
    },
  );
}
