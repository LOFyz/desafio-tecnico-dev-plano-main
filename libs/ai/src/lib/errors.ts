export class AiGenerationFailedError extends Error {
  readonly code = 'AI_GENERATION_FAILED' as const;
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'AiGenerationFailedError';
  }
}

export class WpPublishFailedError extends Error {
  readonly code = 'WP_PUBLISH_FAILED' as const;
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'WpPublishFailedError';
  }
}
