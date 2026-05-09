export interface PostRef {
  databaseId: number;
  slug: string;
  title: string;
  status: string;
}

export type PostAgentResult =
  | { action: 'CREATED'; post: PostRef; message: string }
  | { action: 'UPDATED'; post: PostRef; message: string }
  | { action: 'DELETED'; deletedDatabaseId: number; message: string }
  | { action: 'NOOP'; message: string };
