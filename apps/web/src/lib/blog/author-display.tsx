type AuthorLike = { name?: string | null } | null | undefined;

export function AuthorDisplay({ author }: { author: AuthorLike }) {
  const name = author?.name?.trim();
  if (!name) {
    return <span className="text-sm italic text-muted-foreground">Author unknown</span>;
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {name[0]?.toUpperCase() ?? '?'}
      </span>
      <span className="font-medium">{name}</span>
    </span>
  );
}
