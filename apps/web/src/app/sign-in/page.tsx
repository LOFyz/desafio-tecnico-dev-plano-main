import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/auth/safe-next';
import { SignInForm } from '@/components/molecules/sign-in-form';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/atoms/ui/card';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  const session = await getSession();
  if (session) redirect(next);

  const signUpHref = `/sign-up?next=${encodeURIComponent(next)}`;

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SignInForm />
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link className="underline" href={signUpHref}>
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
