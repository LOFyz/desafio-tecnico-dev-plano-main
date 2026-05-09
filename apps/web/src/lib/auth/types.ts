export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface SessionData {
  id: string;
  expiresAt: string;
  userId: string;
}

export interface Session {
  user: SessionUser;
  session: SessionData;
}
