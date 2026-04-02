let _statePath: string | null = null;
let _connectedProviders: string[] = [];

export function setStatePath(path: string): void {
  _statePath = path;
}

export function getStatePath(): string {
  if (!_statePath) {
    throw new Error("opencode state path not initialized. Plugin may not be fully started.");
  }
  return _statePath;
}

export function setConnectedProviders(providers: unknown[]): void {
  _connectedProviders = providers
    .map((provider) => {
      if (typeof provider === "string") return provider;
      if (provider && typeof provider === "object") {
        const record = provider as Record<string, unknown>;
        const candidate = record.id ?? record.name ?? record.provider ?? record.key;
        return typeof candidate === "string" ? candidate : null;
      }
      return null;
    })
    .filter((provider): provider is string => !!provider);
}

export function isProviderConnected(providerName: string): boolean {
  return _connectedProviders.includes(providerName);
}
