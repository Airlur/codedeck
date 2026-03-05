export interface PublishCoreResult {
  status: number;
  body: Record<string, unknown>;
}

export function processPublishRequest(params: {
  method?: string;
  headers?: Record<string, unknown>;
  rawBody?: string | Record<string, unknown> | null;
}): Promise<PublishCoreResult>;
