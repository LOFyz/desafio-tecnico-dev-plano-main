import { graphql, useFragment, type FragmentType } from '@/gql';

export const UserBadge_UserFragment = graphql(`
  fragment UserBadge_UserFragment on AppUser {
    id
    name
  }
`);

export function UserBadge({
  user,
}: {
  user: FragmentType<typeof UserBadge_UserFragment>;
}) {
  const u = useFragment(UserBadge_UserFragment, user);
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">
        {u.name?.[0]?.toUpperCase() ?? '?'}
      </span>
      <span>{u.name ?? 'Anonymous'}</span>
    </span>
  );
}
