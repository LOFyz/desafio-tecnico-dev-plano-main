import 'server-only';
import 'reflect-metadata';

import {
  LangChainMcpPostAgent,
  RunPostAgentCommand,
  RunPostAgentHandler,
  type PostAgentResult,
} from '@desafio/ai';

// Module-level singletons. Next keeps the module cache alive across requests
// in `next start`, so we pay the agent + handler construction once per
// process. Per-call state (prompt, userId, sessionCookie) flows through the
// command instance.
const agent = new LangChainMcpPostAgent();
const handler = new RunPostAgentHandler(agent);

export async function runPostAgentCommand(args: {
  prompt: string;
  userId: string;
  sessionCookie: string;
}): Promise<PostAgentResult> {
  return handler.execute(
    new RunPostAgentCommand(args.prompt, args.userId, args.sessionCookie),
  );
}
