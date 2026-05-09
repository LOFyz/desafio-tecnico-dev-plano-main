'use client';

import { Button } from '@/components/atoms/ui/button';
import { useRelayConnection } from '@/lib/apollo/use-relay-connection';
import { POSTS_LIST_QUERY } from '@/lib/blog/operations/posts-list.query';
import type { FragmentType } from '@/gql';
import type { POST_CARD_FRAGMENT } from '@/lib/blog/operations/post-card.fragment';
import { PostCard } from '@/components/molecules/blog/post-card';

type PostNode = FragmentType<typeof POST_CARD_FRAGMENT>;

const PAGE_SIZE = 10;

export function PostList() {
  const { items, hasNextPage, loadMore, isLoadingMore, loading } =
    useRelayConnection<PostNode>(POSTS_LIST_QUERY, {
      variables: { first: PAGE_SIZE, after: null },
      connectionPath: 'posts',
    });

  if (loading && items.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading posts…</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No posts yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4">
        {items.map((node, idx) => (
          <PostCard key={idx} post={node} />
        ))}
      </div>
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
