import Link from 'next/link';

import { Button } from '@/components/atoms/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms/ui/card';
import { graphql } from '@/gql';
import { getClient } from '@/lib/apollo/client';
import { getSession } from '@/lib/auth/session';
import {
  UserBadge,
  UserBadge_UserFragment,
} from '@/components/molecules/user-badge';
import { SignOutButton } from '@/components/molecules/sign-out-button';

const Foundation_HomePageQuery = graphql(`
  query Foundation_HomePageQuery {
    me {
      id
      ...UserBadge_UserFragment
    }
  }
`);

void UserBadge_UserFragment;

export default async function Home() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Sign in to access the dashboard, or read the blog without an
              account.
            </p>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/blog">Read the blog</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { data } = await getClient().query({ query: Foundation_HomePageQuery });
  const me = data?.me;

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>You&apos;re signed in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {me ? (
            <UserBadge user={me} />
          ) : (
            <p className="text-sm text-muted-foreground">No user data.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/blog">Blog</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/blog-copilot">Copilot</Link>
            </Button>
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
