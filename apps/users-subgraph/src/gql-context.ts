import type { Request } from 'express';
import type { GqlLoaders } from './users/loaders/loader-factory';

export interface GqlContext {
  sessionId?: string;
  req: Request;
  loaders: GqlLoaders;
}
