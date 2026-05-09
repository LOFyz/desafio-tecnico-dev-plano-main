import Link from 'next/link';

import { Button } from '@/components/atoms/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/atoms/ui/card';

export default function SignInPage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Sign-in form lands in a follow-up change. Use the Better Auth API
            (POST /api/auth/sign-in/email) for now.
          </p>
          <Button asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
