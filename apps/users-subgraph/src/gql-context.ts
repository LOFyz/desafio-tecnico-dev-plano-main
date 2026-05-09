import type { Request } from 'express';

export interface GqlContext {
  sessionId?: string;
  req: Request;
}
