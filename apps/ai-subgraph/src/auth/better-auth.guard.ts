import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { BETTER_AUTH_TOKEN } from '@desafio/auth';
import type { BetterAuth } from '@desafio/auth';
import type { GqlContext } from '../gql-context';

@Injectable()
export class BetterAuthGuard implements CanActivate {
  constructor(@Inject(BETTER_AUTH_TOKEN) private readonly auth: BetterAuth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlCtx = GqlExecutionContext.create(context).getContext<GqlContext>();
    const cookie = gqlCtx.req.headers['cookie'] ?? '';

    if (!cookie) {
      throw new UnauthorizedException('UNAUTHENTICATED');
    }

    const session = await this.auth.api.getSession({
      headers: new Headers({ cookie }),
    });

    if (!session?.user) {
      throw new UnauthorizedException('UNAUTHENTICATED');
    }

    gqlCtx.userId = session.user.id;
    gqlCtx.sessionCookie = cookie;
    return true;
  }
}
