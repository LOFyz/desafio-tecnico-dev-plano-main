import { useFragment, type FragmentType } from '@/gql';
import { POST_DETAIL_FRAGMENT } from '@/lib/blog/operations/post-detail.fragment';
import { AuthorDisplay } from '@/lib/blog/author-display';

type PostDetailProps = {
  post: FragmentType<typeof POST_DETAIL_FRAGMENT>;
};

export function PostDetail({ post }: PostDetailProps) {
  const p = useFragment(POST_DETAIL_FRAGMENT, post);
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold tracking-tight">
          {p.title ?? 'Untitled'}
        </h1>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <AuthorDisplay author={p.author?.node?.appUser ?? null} />
          {p.date && <time>{new Date(p.date).toLocaleDateString()}</time>}
        </div>
      </header>
      {p.content && (
        <div
          className="prose prose-slate max-w-none"
          dangerouslySetInnerHTML={{ __html: p.content }}
        />
      )}
    </article>
  );
}
