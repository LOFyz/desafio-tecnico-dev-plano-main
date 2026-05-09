import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/auth/safe-next';
import { SignUpForm } from '@/components/molecules/sign-up-form';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/atoms/ui/card';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  const session = await getSession();
  if (session) redirect(next);

  const signInHref = `/sign-in?next=${encodeURIComponent(next)}`;

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SignUpForm />
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link className="underline" href={signInHref}>
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
