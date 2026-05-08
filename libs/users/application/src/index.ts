export { GetMeQuery } from './lib/queries/get-me.query';
export { GetMeQueryHandler } from './lib/queries/get-me.handler';

import { GetMeQueryHandler } from './lib/queries/get-me.handler';
export const USER_QUERY_HANDLERS = [GetMeQueryHandler] as const;
