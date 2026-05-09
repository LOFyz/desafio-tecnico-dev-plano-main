import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';

import { getSession } from '@/lib/auth/session';
import { runPostAgentCommand } from '@/lib/ai/agent.server';
import {
  AiGenerationFailedError,
  WpPublishFailedError,
  type PostAgentResult,
} from '@desafio/ai';
import type {
  CopilotErrorResponse,
  CopilotSuccess,
} from '@/lib/ai/route-handler-client';

const promptSchema = z.object({
  prompt: z
    .string()
    .min(5, 'Prompt must be at least 5 characters.')
    .max(500, 'Prompt must be 500 characters or fewer.'),
});

function errorResponse(
  status: number,
  code: CopilotErrorResponse['error']['code'],
  message?: string,
): NextResponse<CopilotErrorResponse> {
  return NextResponse.json<CopilotErrorResponse>(
    { error: { code, ...(message ? { message } : {}) } },
    { status },
  );
}

function toJson(result: PostAgentResult): CopilotSuccess {
  switch (result.action) {
    case 'CREATED':
    case 'UPDATED':
      return {
        action: result.action,
        post: result.post,
        deletedDatabaseId: null,
        message: result.message,
      };
    case 'DELETED':
      return {
        action: 'DELETED',
        post: null,
        deletedDatabaseId: result.deletedDatabaseId,
        message: result.message,
      };
    case 'NOOP':
      return {
        action: 'NOOP',
        post: null,
        deletedDatabaseId: null,
        message: result.message,
      };
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return errorResponse(401, 'UNAUTHENTICATED');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_PROMPT', 'Body must be JSON.');
  }

  const parsed = promptSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse(400, 'INVALID_PROMPT', issue?.message);
  }

  const incoming = await headers();
  const sessionCookie = incoming.get('cookie') ?? '';

  try {
    const result = await runPostAgentCommand({
      prompt: parsed.data.prompt,
      userId: session.user.id,
      sessionCookie,
    });
    return NextResponse.json<CopilotSuccess>(toJson(result));
  } catch (err) {
    if (err instanceof WpPublishFailedError) {
      return NextResponse.json<CopilotSuccess>({
        action: 'NOOP',
        post: null,
        deletedDatabaseId: null,
        message: err.message,
      });
    }
    if (err instanceof AiGenerationFailedError) {
      return errorResponse(502, 'AI_GENERATION_FAILED', err.message);
    }
    return errorResponse(500, 'INTERNAL_ERROR');
  }
}
