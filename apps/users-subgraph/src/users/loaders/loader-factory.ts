import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryBus } from '@nestjs/cqrs';
import type DataLoader from 'dataloader';
import type { User } from '@desafio/users-domain';
import { createPostAuthorWpIdLoader } from './post-author.loader';
import { createAppUserByWpIdLoader } from './app-user.loader';

export interface GqlLoaders {
  postAuthorWpId: DataLoader<number, number | null>;
  appUserByWpId: DataLoader<number, User | null>;
}

@Injectable()
export class LoaderFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly queryBus: QueryBus,
  ) {}

  create(): GqlLoaders {
    const url =
      this.config.get<string>('WP_GRAPHQL_URL') ??
      this.config.get<string>('POSTS_SUBGRAPH_URL') ??
      'http://localhost:8080/graphql';
    const token = this.config.get<string>('WP_GRAPHQL_SERVICE_TOKEN');

    return {
      postAuthorWpId: createPostAuthorWpIdLoader({ url, token }),
      appUserByWpId: createAppUserByWpIdLoader({ queryBus: this.queryBus }),
    };
  }
}
