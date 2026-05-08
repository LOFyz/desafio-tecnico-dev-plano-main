import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BETTER_AUTH_TOKEN } from '@desafio/auth';
import type { BetterAuth } from '@desafio/auth';
import type { User } from '@desafio/users-domain';
import { GetMeQuery } from './get-me.query';

@QueryHandler(GetMeQuery)
export class GetMeQueryHandler implements IQueryHandler<GetMeQuery, User | null> {
  constructor(@Inject(BETTER_AUTH_TOKEN) private readonly auth: BetterAuth) {}

  async execute(query: GetMeQuery): Promise<User | null> {
    if (!query.sessionId) return null;

    const session = await this.auth.api.getSession({
      headers: new Headers({ cookie: `better-auth.session_token=${query.sessionId}` }),
    });

    if (!session?.user) return null;

    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      image: session.user.image ?? null,
      createdAt: session.user.createdAt,
      updatedAt: session.user.updatedAt,
    };
  }
}
