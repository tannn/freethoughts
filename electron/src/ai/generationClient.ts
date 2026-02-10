export interface GenerationRequest {
  requestId: string;
  prompt: string;
  modelOverride?: string;
  maxOutputTokens?: number;
}

export interface GenerationResult {
  text: string;
  model: string;
}

export interface ProvocationGenerationClient {
  generateProvocation(input: GenerationRequest): Promise<GenerationResult>;
  cancel(requestId: string): boolean;
}

export class RoutedProvocationGenerationClient implements ProvocationGenerationClient {
  private readonly activeRequestClient = new Map<string, ProvocationGenerationClient>();

  private readonly knownClients: ProvocationGenerationClient[];

  constructor(
    private readonly getActiveClient: () => ProvocationGenerationClient,
    knownClients: readonly ProvocationGenerationClient[]
  ) {
    this.knownClients = [...knownClients];
  }

  async generateProvocation(input: GenerationRequest): Promise<GenerationResult> {
    const client = this.getActiveClient();
    this.activeRequestClient.set(input.requestId, client);
    try {
      return await client.generateProvocation(input);
    } finally {
      this.activeRequestClient.delete(input.requestId);
    }
  }

  cancel(requestId: string): boolean {
    const activeClient = this.activeRequestClient.get(requestId);
    if (activeClient) {
      this.activeRequestClient.delete(requestId);
      return activeClient.cancel(requestId);
    }

    for (const client of this.knownClients) {
      if (client.cancel(requestId)) {
        return true;
      }
    }

    return false;
  }
}
