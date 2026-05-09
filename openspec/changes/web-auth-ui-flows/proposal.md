## Why

The `web-frontend-foundation` change wired Better Auth client/server plumbing and a same-origin `/api/auth` proxy, but the actual user-facing flows are still placeholders: `/sign-in` shows a "use the API directly" stub, there is no sign-up route, and there is no UI affordance for sign-out. The middleware-equivalent `proxy.ts` already redirects unauthenticated visitors to `/sign-in?next=…`, so a usable sign-in form is the missing piece blocking every authenticated path (`/dashboard/*`, future post composer, future newsletter admin). Sign-up is required because the app has no other way to create an account in dev/prod, and sign-out is required so QA and real users can switch accounts without clearing cookies by hand.

## What Changes

- Replace the `/sign-in` placeholder with a real email + password sign-in form (react-hook-form + zod + shadcn `Form`), submitting via `authClient.signIn.email(...)` and honoring the `next` query param on success.
- Add a `/sign-up` route with name + email + password form, submitting via `authClient.signUp.email(...)`; on success the Better Auth response sets the session cookie, so route to `next` (or `/`) without an extra sign-in round-trip.
- Add a `<SignOutButton />` molecule that calls `authClient.signOut()` and refreshes the route; mount it in the existing authenticated landing area (currently `app/page.tsx` renders the sign-in CTA / `UserBadge`).
- Add shared form primitives: install shadcn `form` + `label` (and the `react-hook-form` + `zod` + `@hookform/resolvers` deps); place them under `components/atoms/ui/` to match existing convention.
- Add zod schemas + a tiny `mapAuthError(err)` helper so Better Auth error codes (`INVALID_EMAIL_OR_PASSWORD`, `USER_ALREADY_EXISTS`, `WEAK_PASSWORD`, network) become user-readable messages without leaking server internals.
- Surface success/failure with the existing `sonner` toaster (already mounted by the foundation) — no new toast system.

Non-goals (explicitly out of scope, deferred):
- Password reset / email verification (needs email transport).
- OAuth social providers (already configured server-side but no UX in this change).
- Account settings / profile edit / delete.
- Server Actions for auth submission (the client SDK is the path of least resistance here).

## Capabilities

### New Capabilities
- `web-auth-ui-flows`: Browser-side sign-in, sign-up, and sign-out user flows for the Next.js app, built on the Better Auth client wired by `web-frontend-foundation`.

### Modified Capabilities
<!-- None. The foundation requirement that auth state flows via the same-origin `/api/auth` proxy is unchanged; this change consumes it rather than altering it. -->

## Impact

- **Code**:
  - `apps/web/src/app/sign-in/page.tsx` — replace placeholder with real form.
  - `apps/web/src/app/sign-up/page.tsx` — new route.
  - `apps/web/src/components/molecules/sign-in-form.tsx`, `sign-up-form.tsx`, `sign-out-button.tsx` — new client components.
  - `apps/web/src/components/atoms/ui/form.tsx`, `label.tsx` — new shadcn primitives.
  - `apps/web/src/lib/auth/schemas.ts`, `apps/web/src/lib/auth/errors.ts` — zod schemas + Better Auth error mapper.
  - `apps/web/src/app/page.tsx` — render `<SignOutButton />` (and a "Go to dashboard" link) in the authenticated branch.
- **Dependencies** (add to `apps/web/package.json`): `react-hook-form`, `zod`, `@hookform/resolvers`. The shadcn `form` primitive depends on `@radix-ui/react-label` (pulled in by the `label` primitive) and `@radix-ui/react-slot` (already present via `button`).
- **APIs**: Consumes existing Better Auth endpoints (`POST /api/auth/sign-in/email`, `POST /api/auth/sign-up/email`, `POST /api/auth/sign-out`) through the foundation's same-origin rewrite.
- **`libs/auth` (added during apply)**: Better Auth enforces `trustedOrigins` on sign-out (CSRF). Because the browser's `Origin` is the web app's URL (`http://localhost:4200`) but `baseURL` is the auth subgraph (`http://localhost:3001`), sign-out is rejected with `Invalid origin`. Fix: `BetterAuthConfig` gains a `trustedOrigins: string[]` field; `BetterAuthConfigFactory` reads `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated) from env; `init-auth.ts` passes them to `betterAuth({ trustedOrigins })`. `.env.example` documents the new var with the dev default `http://localhost:4200`.
- **Routes affected by the foundation's `proxy.ts` matcher**: only `/dashboard/:path*`. Sign-in/sign-up are public and stay public.
- **Tests / verification**: manual smoke (sign up → cookie set → `/` shows badge → sign out → cookie cleared → `/dashboard` redirects to `/sign-in?next=/dashboard` → sign in → bounced back to `/dashboard`). No new automated test suite is added in this change; e2e for auth lives in `apps/web-e2e` as a follow-up.
