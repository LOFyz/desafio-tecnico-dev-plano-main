## Context

`web-frontend-foundation` (archived 2026-05-09) shipped:
- `apps/web/src/lib/auth/client.ts` — `createAuthClient` from `better-auth/react` exporting `useSession, signIn, signUp, signOut`. The `baseURL` resolves to `${window.location.origin}/api/auth` in the browser.
- `apps/web/src/lib/auth/session.ts` — `cache()`-wrapped server-side `getSession()` reading cookies via `next/headers`.
- A same-origin Next.js rewrite `/api/auth/:path* → ${authUrl}/auth/:path*` (so cookies stay first-party).
- `apps/web/src/proxy.ts` (Next.js 16 deprecation-renamed middleware) matching `/dashboard/:path*` and redirecting unauthenticated traffic to `/sign-in?next=…`.
- `apps/web/src/app/sign-in/page.tsx` placeholder Card pointing users at the API.
- shadcn primitives in `apps/web/src/components/atoms/ui/`: `button`, `card`, `input`, `sonner` (the toaster is mounted in the root layout).

Better Auth server config (`libs/auth/src/lib/init-auth.ts`):
- `emailAndPassword: { enabled: true }` — credential auth is on.
- `socialProviders.google` is conditionally enabled but **not used** by this change.
- The Nest auth subgraph mounts `toNodeHandler(auth)` at `/auth`, so `/auth/sign-in/email`, `/auth/sign-up/email`, `/auth/sign-out` are all available behind the gateway proxy.

Forms convention in the repo: there is none yet — this change establishes it. The user picked **react-hook-form + zod + shadcn `Form`**, which is the documented shadcn pattern and integrates with the existing `Input`/`Button`/`Card` primitives.

## Goals / Non-Goals

**Goals:**
- Replace the sign-in placeholder with a working email/password form that closes the loop on the foundation's `proxy.ts` redirect (`/dashboard → /sign-in?next=… → /dashboard`).
- Provide a sign-up route so dev/QA can create accounts without curl.
- Provide a sign-out affordance reachable from the authenticated home page.
- Establish the form pattern (`react-hook-form` + `zod` + shadcn `Form`) once, so future feature changes (post composer, newsletter signup) reuse it.
- Map Better Auth error codes to user-readable strings in **one** place.

**Non-Goals:**
- Password reset / email verification (needs email transport — separate change).
- OAuth / social provider buttons (server is configured, but UX deferred).
- Server Actions for auth submission (the Better Auth React SDK is the path of least resistance and matches what the foundation already exports).
- Session refresh / "remember me" tuning (Better Auth defaults stand).
- Account settings / profile edit / delete.
- Adding e2e tests in `apps/web-e2e` (a follow-up change owns that).
- Touching `apps/users-subgraph`, `libs/auth`, or the gateway.

## Decisions

### 1. Submit via the Better Auth React SDK, not Server Actions

Use `authClient.signIn.email({ email, password })` etc. from `apps/web/src/lib/auth/client.ts`.

**Why:** the foundation already exports these and wires the same-origin proxy (cookies are first-party). The SDK handles the cookie-setting `Set-Cookie` response automatically because it's a same-origin `fetch`. A Server Action would have to:
- run server-side, where the `baseURL` would have to be the gateway URL (not `window.location.origin`),
- forward the response's `Set-Cookie` header back through Next's `cookies()` API,
- and we'd lose the SDK's typed error shape.

**Alternative considered:** Next.js Server Action calling `auth.api.signInEmail(...)` from the Better Auth instance. Rejected because (a) it duplicates plumbing the foundation already built, (b) the Better Auth instance lives in the `users-subgraph` Nest app, not in `apps/web`, so we'd have to re-instantiate it or proxy through the subgraph anyway.

### 2. react-hook-form + zod + shadcn `Form`

Forms use `useForm({ resolver: zodResolver(schema) })`, with shadcn `Form, FormField, FormItem, FormLabel, FormControl, FormMessage` wrapping `<Input />`.

**Why:**
- shadcn's `Form` primitive is **built on** `react-hook-form` — using anything else means dropping the primitive.
- `zod` schemas live in `lib/auth/schemas.ts` and can be reused by future flows (password reset, profile edit).
- The user picked this combination explicitly.

**Alternative considered:** native `<form action>` + `useFormState`. Rejected — pairs awkwardly with the SDK call (which is a client-side `fetch`), and gives weaker per-field error UX.

### 3. Centralize Better Auth error mapping in `lib/auth/errors.ts`

A single `mapAuthError(err: unknown): string` returns a friendly message. Components never render `err.code` verbatim.

Recognised codes (start with the ones Better Auth's email/password flow actually emits):
- `INVALID_EMAIL_OR_PASSWORD` → "Invalid email or password"
- `USER_ALREADY_EXISTS` (and aliases like `EMAIL_ALREADY_EXISTS`) → "An account with that email already exists."
- `WEAK_PASSWORD` / `PASSWORD_TOO_SHORT` → "Password is too weak. Use at least 8 characters."
- Anything else → "Something went wrong. Please try again."

**Why:** error code strings vary across Better Auth versions; isolating the mapping prevents copy-paste drift across forms and gives one place to update when a new code appears. Returning a string (not throwing) keeps form components shallow.

### 4. `next` query param threading, not session storage

Both `/sign-in` and `/sign-up` read `next` from `useSearchParams()` and call `router.push(next ?? '/')` on success. The cross-flow links re-encode `next` into their hrefs.

**Why:** the foundation's `proxy.ts` already constructs `?next=…`; threading it through the URL keeps the redirect target observable in dev tools and survives full-page reload. No client storage needed.

**Sanitization:** treat `next` as untrusted. Only honor values that start with `/` and don't start with `//` (open-redirect guard). Anything else falls back to `/`.

### 5. Toast for sign-out, inline errors for sign-in/sign-up

- Sign-in / sign-up surface failure **inline** in the form's `FormMessage` slot — that's where users are looking.
- Sign-out happens out-of-form, so failures use a `sonner` error toast (the toaster is already mounted by the foundation in the root layout).

**Why:** matches user expectations — a form error belongs near the form; a one-shot button click belongs in a toast.

### 6. Sign-out re-renders via `router.refresh()`

After `authClient.signOut()` resolves, call `router.refresh()` (from `next/navigation`). The home page is a server component reading `getSession()`, so refresh re-evaluates and the unauthenticated branch renders.

**Why:** `useSession()` is reactive on the client, but the **server-rendered** parts of `app/page.tsx` (and the Apollo `me` query) only update on a refresh. `router.refresh()` is cheaper than `router.replace(window.location.pathname)` and preserves scroll.

### 7. Add only `react-hook-form`, `zod`, `@hookform/resolvers`, `@radix-ui/react-label`

Pinned versions follow the shadcn `form` + `label` recipe. We don't add `@radix-ui/react-form` (shadcn's Form is a thin wrapper over react-hook-form, not a Radix primitive).

**Risk addressed by this scope:** Avoid pulling in unused validators (yup, valibot) — zod is the de-facto pick for shadcn forms and already paired with the project's TypeScript-first stance.

### 8. Mount `<SignOutButton />` in `app/page.tsx`'s authenticated branch only

The button lives next to `<UserBadge />` so it's discoverable without yet building a header organism. A future `header` organism change can move it.

**Why:** scope discipline — building a global header now would conflate two changes.

## Risks / Trade-offs

- **[Cookie SameSite / cross-site]** → Mitigation: same-origin proxy means `/api/auth/*` is first-party; Better Auth's default cookie attributes work. No `SameSite=None` needed.
- **[Open-redirect via `next` param]** → Mitigation: server-side and client-side sanitization (allow only paths starting with `/` and not `//`). Documented in decision #4 and enforced in a tiny `safeNextPath()` helper.
- **[Zod errors and Better Auth errors compete for the same `FormMessage`]** → Mitigation: zod errors attach to specific fields via the resolver; auth errors are surfaced as a root-level form error via `form.setError('root', { message })` and displayed in a dedicated `FormMessage` for `root`. They never overwrite per-field validation.
- **[SDK error shape varies across Better Auth versions]** → Mitigation: `mapAuthError` accepts `unknown` and inspects both `err.error?.code` and `err.code` (and the message string as last resort). Centralized so a version bump touches one file.
- **[`router.refresh()` after sign-out doesn't clear Apollo cache]** → Mitigation: documented limitation. The home page's `me` query will return null on the next request; a follow-up could call `apolloClient.clearStore()` if cross-tab leak surfaces. Out of scope here.
- **[shadcn Form requires a `FormProvider`/`useForm` context per form]** → Mitigation: that's the documented pattern; no workaround needed.

## Migration Plan

Single-PR rollout, no DB or schema changes:
1. Install deps, run `pnpm install`.
2. Add `form.tsx` + `label.tsx` shadcn primitives.
3. Add `lib/auth/schemas.ts`, `lib/auth/errors.ts`, `lib/auth/safe-next.ts`.
4. Build `<SignInForm />`, `<SignUpForm />`, `<SignOutButton />` molecules.
5. Replace `/sign-in/page.tsx`, add `/sign-up/page.tsx`.
6. Wire `<SignOutButton />` into the authenticated branch of `app/page.tsx`.
7. Manual smoke per the proposal's "Tests / verification" line.

**Rollback:** revert the PR. The foundation still works; users would just see the placeholder again.

## Open Questions

- Should the password schema enforce a complexity rule beyond length (digit + symbol)? Default: **no** — Better Auth doesn't enforce one and stricter rules without server agreement creates a UX trap. Revisit when password reset is added.
- Do we want a "Show password" toggle in this change? Default: **no** — extra component, easy to add later.
- Should `/sign-in` and `/sign-up` redirect away to `/` if a session already exists? Default: **yes, server-side** — adds two `getSession()` calls (already cached) and prevents a confusing "log in while logged in" UX. Captured as a task.
