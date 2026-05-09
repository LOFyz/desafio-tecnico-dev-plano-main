import { PostList } from '@/components/organisms/blog/post-list';

export default function BlogIndexPage() {
  return (
    <main className="container mx-auto flex min-h-screen flex-col gap-8 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Blog</h1>
        <p className="text-sm text-muted-foreground">
          Posts published on the WordPress backend, joined with their authors
          via the federated gateway.
        </p>
      </header>
      <PostList />
    </main>
  );
}
