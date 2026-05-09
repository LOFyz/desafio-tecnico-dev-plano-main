export class RunPostAgentCommand {
  constructor(
    public readonly prompt: string,
    public readonly userId: string,
    public readonly sessionCookie: string,
  ) {}
}
