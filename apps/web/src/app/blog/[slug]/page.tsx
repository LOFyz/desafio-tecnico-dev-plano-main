import { notFound } from 'next/navigation';
import { getClient } from '@/lib/apollo/client';
import { POST_DETAIL_QUERY } from '@/lib/blog/operations/post-detail.query';
import { PostDetail } from '@/components/organisms/blog/post-detail';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BlogDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const { data } = await getClient().query({
    query: POST_DETAIL_QUERY,
    variables: { slug },
  });

  if (!data?.post) notFound();

  return (
    <main className="container mx-auto min-h-screen px-4">
      <PostDetail post={data.post} />
    </main>
  );
}
