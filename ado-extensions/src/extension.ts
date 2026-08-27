import type { BaseProjectSnapshot } from './base-project.js';
import type { ExtensionManifest } from './manifest.js';

export type ExtensionContext = Readonly<{
  base: BaseProjectSnapshot;
}>;

export type AdoExtension = Readonly<{
  manifest: ExtensionManifest;
  initialize(context: ExtensionContext): Promise<void> | void;
}>;
