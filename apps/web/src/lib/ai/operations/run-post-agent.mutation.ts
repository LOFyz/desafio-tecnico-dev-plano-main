import { graphql } from '@/gql';

export const RUN_POST_AGENT_MUTATION = graphql(/* GraphQL */ `
  mutation RunPostAgent($input: RunPostAgentInput!) {
    runPostAgent(input: $input) {
      action
      post {
        databaseId
        slug
        title
        status
      }
      deletedDatabaseId
      message
    }
  }
`);
