import Link from 'next/link';
import { useFragment, type FragmentType } from '@/gql';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/atoms/ui/card';
import { AuthorDisplay } from '@/lib/blog/author-display';
import { POST_CARD_FRAGMENT } from '@/lib/blog/operations/post-card.fragment';

type PostCardProps = {
  post: FragmentType<typeof POST_CARD_FRAGMENT>;
};

export function PostCard({ post }: PostCardProps) {
  const p = useFragment(POST_CARD_FRAGMENT, post);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {p.slug ? (
            <Link href={`/blog/${p.slug}`} className="hover:underline">
              {p.title ?? 'Untitled'}
            </Link>
          ) : (
            (p.title ?? 'Untitled')
          )}
        </CardTitle>
        {p.date && (
          <p className="text-xs text-muted-foreground">
            {new Date(p.date).toLocaleDateString()}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {p.excerpt && (
          <div
            className="prose prose-sm max-w-none text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: p.excerpt }}
          />
        )}
        <AuthorDisplay author={p.appUser} />
      </CardContent>
    </Card>
  );
}
