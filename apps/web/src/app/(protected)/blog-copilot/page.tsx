import { redirect } from 'next/navigation';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/atoms/ui/card';
import { BlogCopilotForm } from '@/components/organisms/ai/blog-copilot-form';
import { getSession } from '@/lib/auth/session';

export default async function BlogCopilotPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in?next=%2Fblog-copilot');

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Blog copilot</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Ask the copilot to create, update, or delete posts on the blog.
            Generation typically takes 10&ndash;25 seconds.
          </p>
          <BlogCopilotForm />
        </CardContent>
      </Card>
    </main>
  );
}
