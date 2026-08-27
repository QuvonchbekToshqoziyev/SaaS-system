import type { BaseProjectSnapshot } from './base-project.js';
import type { AdoExtension, ExtensionContext } from './extension.js';
import { isBaseVersionCompatible } from './manifest.js';

export class ExtensionRegistry {
  private readonly extensions = new Map<string, AdoExtension>();

  register(extension: AdoExtension): void {
    const { id } = extension.manifest;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid extension id: ${id}`);
    if (this.extensions.has(id)) throw new Error(`Extension already registered: ${id}`);
    this.extensions.set(id, extension);
  }

  async initializeAll(base: BaseProjectSnapshot): Promise<readonly ExtensionInitializationResult[]> {
    const context: ExtensionContext = Object.freeze({ base });
    const results: ExtensionInitializationResult[] = [];
    for (const extension of this.extensions.values()) {
      const { manifest } = extension;
      if (!isBaseVersionCompatible(base.version, manifest.compatibleBase)) {
        results.push({ id: manifest.id, ok: false, error: `Incompatible base version ${base.version}; requires ${manifest.compatibleBase}` });
        continue;
      }
      try {
        await extension.initialize(context);
        results.push({ id: manifest.id, ok: true });
      } catch (error) {
        results.push({ id: manifest.id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return Object.freeze(results);
  }

  list(): readonly Readonly<{
    id: string;
    version: string;
    description: string;
    compatibleBase: string;
    capabilities: readonly string[];
  }>[] {
    return Object.freeze([...this.extensions.values()].map(({ manifest: { id, version, description, compatibleBase, capabilities } }) => ({ id, version, description, compatibleBase, capabilities })));
  }
}

export type ExtensionInitializationResult = Readonly<{
  id: string;
  ok: boolean;
  error?: string;
}>;
