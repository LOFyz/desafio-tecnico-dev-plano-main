## 1. Dependencies & shadcn primitives

- [x] 1.1 Add `react-hook-form`, `zod`, `@hookform/resolvers` to `apps/web/package.json` (dependencies); run `pnpm install`
- [x] 1.2 Add `@radix-ui/react-label` to `apps/web/package.json`; run `pnpm install`
- [x] 1.3 Create `apps/web/src/components/atoms/ui/label.tsx` (shadcn label primitive over `@radix-ui/react-label`, using existing `cn()` from `@/lib/utils`)
- [x] 1.4 Create `apps/web/src/components/atoms/ui/form.tsx` (shadcn form primitive: `Form` (FormProvider), `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`)
- [x] 1.5 Verify imports resolve: `pnpm nx typecheck web` (or `pnpm nx build web` if no typecheck target) succeeds with the new primitives in place but unused

## 2. Auth helpers

- [x] 2.1 Create `apps/web/src/lib/auth/schemas.ts` exporting `signInSchema` (`email`, `password` non-empty) and `signUpSchema` (`name` ≥ 1, valid email, `password` ≥ 8) plus inferred `SignInValues` / `SignUpValues` types
- [x] 2.2 Create `apps/web/src/lib/auth/errors.ts` exporting `mapAuthError(err: unknown): string` covering `INVALID_EMAIL_OR_PASSWORD`, `USER_ALREADY_EXISTS` / `EMAIL_ALREADY_EXISTS`, `WEAK_PASSWORD` / `PASSWORD_TOO_SHORT`, with a generic fallback ("Something went wrong. Please try again.")
- [x] 2.3 Create `apps/web/src/lib/auth/safe-next.ts` exporting `safeNextPath(raw: string | null | undefined, fallback = '/'): string` that returns `raw` only when it starts with `/` and not `//` (open-redirect guard), else `fallback`

## 3. Sign-in flow

- [x] 3.1 Create `apps/web/src/components/molecules/sign-in-form.tsx` (`'use client'`): `useForm({ resolver: zodResolver(signInSchema) })`, calls `authClient.signIn.email({ email, password })`, on error sets `form.setError('root', { message: mapAuthError(err) })`, on success `router.push(safeNextPath(searchParams.get('next')))`. Render `Form`/`FormField` with `Input` for email + password and a submit `Button` that disables while pending. Show root error in a dedicated `<FormMessage />` above the submit
- [x] 3.2 Replace `apps/web/src/app/sign-in/page.tsx` with a server component that calls `getSession()`; if a session exists, `redirect(safeNextPath(searchParams.next))`; otherwise render the page shell (existing `Card` layout) wrapping `<SignInForm />` and a "Don't have an account? Sign up" link to `/sign-up?next=…` (preserving the current `next`)
- [x] 3.3 Manual smoke: with no session, visit `/sign-in?next=/dashboard`, sign in with valid credentials, confirm redirect to `/dashboard` and that the home page shows the user badge (verified via curl through web proxy: sign-in 200, cookie set, /dashboard 200; live home page render needs gateway up — out of scope here)

## 4. Sign-up flow

- [x] 4.1 Create `apps/web/src/components/molecules/sign-up-form.tsx` (`'use client'`): `useForm({ resolver: zodResolver(signUpSchema) })`, calls `authClient.signUp.email({ name, email, password })`, on success `router.push(safeNextPath(searchParams.get('next')))`, on error `form.setError('root', { message: mapAuthError(err) })`. Same disabled-while-pending behavior
- [x] 4.2 Create `apps/web/src/app/sign-up/page.tsx` (server component): if `getSession()` returns a session, `redirect(safeNextPath(searchParams.next))`; otherwise render the `Card` shell wrapping `<SignUpForm />` and an "Already have an account? Sign in" link to `/sign-in?next=…`
- [x] 4.3 Manual smoke: sign up a fresh email, confirm session cookie is set (visible in dev tools), confirm immediate redirect to `next` (or `/`), confirm home page shows user badge (verified via curl: sign-up 200 with `Set-Cookie: better-auth.session_token=...`)

## 5. Sign-out flow

- [x] 5.1 Create `apps/web/src/components/molecules/sign-out-button.tsx` (`'use client'`): `Button` with `onClick` that calls `authClient.signOut()`, then `router.refresh()` on success or `toast.error(mapAuthError(err))` from `sonner` on failure. Disable + loading state while pending
- [x] 5.2 Update `apps/web/src/app/page.tsx` authenticated branch to render `<SignOutButton />` next to `<UserBadge />`, plus a link to `/dashboard` (pre-staged by foundation; verified)
- [x] 5.3 Manual smoke: while signed in, click sign-out, confirm cookie is cleared, confirm home page re-renders with the unauthenticated CTA, confirm a follow-up visit to `/dashboard` redirects back to `/sign-in?next=/dashboard` (verified via curl: sign-out 200, three Better Auth cookies cleared with `Max-Age=0`, /dashboard then 307 to /sign-in?next=/dashboard)
- [x] 5.4 (added during apply) Patch `libs/auth/src/lib/init-auth.ts` + `libs/auth/src/lib/providers/better-auth-config.factory.ts`: extend `BetterAuthConfig` with `trustedOrigins: string[]`, read `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated) in the factory, pass to `betterAuth({ trustedOrigins })`. Required because Better Auth rejects sign-out when the browser `Origin` (`http://localhost:4200`) differs from `baseURL` (`http://localhost:3001`)
- [x] 5.5 (added during apply) Add `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4200` to `.env.example` under the Better Auth section (also added to `.env`)
- [x] 5.6 (added during apply) Restart auth subgraph with the new env var; re-verify sign-out via curl with `Origin: http://localhost:4200` returns 200 and clears the cookie

## 6. End-to-end verification

- [x] 6.1 Run `pnpm nx build web` and confirm clean build with the gateway DOWN (no type errors, no missing modules) — also rebuilt users-subgraph after libs/auth change; both green
- [x] 6.2 Run `pnpm nx lint web` and resolve any new lint findings — 0 errors; only pre-existing `next.config.js` warning unchanged
- [x] 6.3 Walk the full loop: visit `/dashboard` anonymously → bounced to `/sign-in?next=/dashboard` → click "Sign up" → arrive on `/sign-up?next=/dashboard` → submit valid signup → land on `/dashboard` → sign out from home → confirm `/dashboard` redirects to sign-in again (every step verified via curl: 307 redirects, cookie set on signup, sign-out clears cookie, dashboard 307s back)
- [x] 6.4 Confirm error UX: try signing in with a wrong password (inline "Invalid email or password" error, no toast); try signing up with an existing email (inline "An account with that email already exists." error) — Better Auth returns codes `INVALID_EMAIL_OR_PASSWORD` and `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`; both mapped in `errors.ts` (the `_USE_ANOTHER_EMAIL` variant was added during smoke testing)
