import type { ArchitectureCatalogs } from './catalog-loader.ts';

const architectureRootByCatalogs = new WeakMap<ArchitectureCatalogs, string>();

export function registerArchitectureCatalogSourceRoot(
  catalogs: ArchitectureCatalogs,
  architectureRoot: string
): void {
  architectureRootByCatalogs.set(catalogs, architectureRoot);
}

export function getArchitectureCatalogSourceRoot(
  catalogs: ArchitectureCatalogs
): string | undefined {
  return architectureRootByCatalogs.get(catalogs);
}
