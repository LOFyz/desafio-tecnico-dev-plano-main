import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/atoms/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/atoms/ui/card';
import { getSession } from '@/lib/auth/session';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in?next=%2Fdashboard');

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm">
            Hello, <span className="font-medium">{session.user.name}</span>.
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/blog-copilot">Open blog copilot</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
