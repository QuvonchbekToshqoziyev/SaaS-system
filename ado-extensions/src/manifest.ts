export type ExtensionManifest = Readonly<{
  id: string;
  version: string;
  description: string;
  compatibleBase: string;
  capabilities: readonly string[];
}>;

function parseVersion(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isBaseVersionCompatible(baseVersion: string, range: string): boolean {
  const base = parseVersion(baseVersion);
  const match = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/.exec(range);
  if (!base || !match) return false;
  const minimum = parseVersion(match[1]);
  const maximum = parseVersion(match[2]);
  if (!minimum || !maximum) return false;
  const compare = (left: [number, number, number], right: [number, number, number]) =>
    left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  return compare(base, minimum) >= 0 && compare(base, maximum) < 0;
}
