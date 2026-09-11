# Fix Google OAuth Redirect (30-second fix)

The root cause of `localhost:3000/?code=...` is that Supabase doesn't know
your /auth/callback URL is allowed. Add it once and it's fixed forever.

## Steps

1. Open: https://supabase.com/dashboard/project/cxujipeulvhreiryaptr/auth/url-configuration

2. Under **"Redirect URLs"** click **"Add URL"** and add ALL of these:

```
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=/business
http://localhost:3001/auth/callback
https://your-production-domain.com/auth/callback
```

3. Under **"Site URL"** make sure it is:
```
http://localhost:3000
```

4. Click **Save**.

That's it. Google OAuth will now redirect to /auth/callback correctly
instead of dropping the path and landing on localhost:3000/?code=...

## Why this happens
Supabase only allows redirectTo URLs that exactly match an entry in the
Redirect URLs allowlist. If no match is found, Supabase strips the path
and falls back to the Site URL (localhost:3000) — causing the error you saw.

## Current code protection (belt-and-suspenders)
Even without this fix, the code now handles stray codes via:
- src/app/page.tsx → catches ?code= at root, forwards to /auth/callback
- src/middleware.ts → intercepts at middleware level before page renders
- Both preserve business vs user intent via strivup_business_intent cookie
