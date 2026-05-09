## ADDED Requirements

### Requirement: Sign-in page form
The `/sign-in` route SHALL render a public client-rendered form that accepts an email and a password, validates them with a zod schema (email syntax, password non-empty), and submits via `authClient.signIn.email(...)` from `apps/web/src/lib/auth/client.ts`. The page SHALL NOT depend on `getSession()` and SHALL NOT be matched by the auth `proxy.ts` matcher.

#### Scenario: Successful sign-in redirects to next
- **WHEN** an unauthenticated visitor lands on `/sign-in?next=/dashboard`, fills valid credentials, and submits
- **THEN** the form calls `authClient.signIn.email({ email, password })`, the Better Auth response sets the session cookie, and the page navigates to `/dashboard`

#### Scenario: Successful sign-in without next falls back to home
- **WHEN** the visitor signs in successfully on `/sign-in` with no `next` query param
- **THEN** the page navigates to `/`

#### Scenario: Invalid credentials surfaces a friendly error
- **WHEN** Better Auth returns the `INVALID_EMAIL_OR_PASSWORD` error
- **THEN** the form shows the message "Invalid email or password" inline (not a silent failure) and does not navigate

#### Scenario: Network failure surfaces a generic error
- **WHEN** the auth subgraph is unreachable and the call rejects
- **THEN** the form shows "Something went wrong. Please try again." and stays on `/sign-in` with the entered email preserved

#### Scenario: Submit button is disabled while pending
- **WHEN** the form is mid-submission
- **THEN** the submit button is disabled and shows a loading state, preventing double-submit

### Requirement: Sign-up page form
The `/sign-up` route SHALL render a public client-rendered form accepting `name`, `email`, and `password`, validates them with a zod schema (`name` ≥ 1 char, valid email, password ≥ 8 chars), and submits via `authClient.signUp.email(...)`. On success the visitor SHALL be considered authenticated immediately (no extra sign-in round-trip).

#### Scenario: Successful sign-up sets session and redirects
- **WHEN** the visitor submits a valid name, email, and previously-unused password on `/sign-up?next=/dashboard`
- **THEN** Better Auth creates the account, the response sets the session cookie, and the page navigates to `/dashboard`

#### Scenario: Email already in use surfaces a friendly error
- **WHEN** Better Auth returns `USER_ALREADY_EXISTS` (or equivalent code for duplicate email)
- **THEN** the form shows "An account with that email already exists." and the visitor stays on `/sign-up`

#### Scenario: Weak password is rejected client-side
- **WHEN** the password field has fewer than 8 characters at submit time
- **THEN** the zod resolver attaches a "Password must be at least 8 characters" error to the password field and the form does not call the auth client

#### Scenario: Sign-in link points to /sign-in preserving next
- **WHEN** the page is rendered with `?next=/dashboard`
- **THEN** the "Already have an account? Sign in" link href is `/sign-in?next=%2Fdashboard`

### Requirement: Sign-out action
A `<SignOutButton />` molecule SHALL be available, invoke `authClient.signOut()`, and after the call resolves SHALL force the current route to refetch session-derived UI (e.g. via `router.refresh()` from `next/navigation`). The component SHALL be rendered in the authenticated branch of the home page (`apps/web/src/app/page.tsx`).

#### Scenario: Click clears session and updates UI
- **WHEN** an authenticated user clicks the sign-out button
- **THEN** Better Auth clears the `better-auth.session_token` cookie and the home page re-renders showing the unauthenticated CTA in place of the user badge

#### Scenario: Disabled while pending
- **WHEN** sign-out is in flight
- **THEN** the button is disabled and shows a loading state until the call resolves or rejects

#### Scenario: Failure surfaces toast and keeps user signed in
- **WHEN** `authClient.signOut()` rejects (e.g. network error)
- **THEN** a `sonner` error toast is shown and the user remains authenticated (cookie not cleared)

### Requirement: Cross-flow navigation links
The sign-in and sign-up pages SHALL each link to the other and SHALL preserve the `next` query parameter when navigating between them.

#### Scenario: Sign-in links to sign-up preserving next
- **WHEN** the visitor is on `/sign-in?next=/dashboard`
- **THEN** the "Don't have an account? Sign up" link href is `/sign-up?next=%2Fdashboard`

#### Scenario: Sign-up links to sign-in preserving next
- **WHEN** the visitor is on `/sign-up?next=/dashboard/posts`
- **THEN** the "Already have an account? Sign in" link href is `/sign-in?next=%2Fdashboard%2Fposts`

### Requirement: Auth error mapping
The change SHALL provide a single `mapAuthError(err)` helper in `apps/web/src/lib/auth/errors.ts` that converts Better Auth error responses (and thrown errors) into user-readable strings. Components MUST NOT render Better Auth error codes verbatim.

#### Scenario: Known code maps to a friendly message
- **WHEN** `mapAuthError({ code: 'INVALID_EMAIL_OR_PASSWORD' })` is called
- **THEN** it returns "Invalid email or password"

#### Scenario: Unknown error returns a generic fallback
- **WHEN** `mapAuthError(new Error('boom'))` is called with no recognizable code
- **THEN** it returns "Something went wrong. Please try again."

### Requirement: Form primitives available
The `apps/web/src/components/atoms/ui/` directory SHALL contain shadcn `form.tsx` and `label.tsx` primitives so feature forms can compose `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` over `react-hook-form`.

#### Scenario: Primitives importable from atoms
- **WHEN** a component imports `Form, FormField, FormItem, FormLabel, FormControl, FormMessage` from `@/components/atoms/ui/form`
- **THEN** the imports resolve and the bundle compiles without missing-module errors
