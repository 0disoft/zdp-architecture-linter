import type { ArchitectureCatalogs } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';

export function validateCoreCatalogShapes(catalogs: ArchitectureCatalogs): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    ...validateCatalogArrayShape(catalogs.services, 'catalogs/services.yaml', 'services', 'id'),
    ...validateCatalogArrayShape(catalogs.datastores, 'catalogs/datastores.yaml', 'datastores', 'id'),
    ...validateCatalogArrayShape(catalogs.splitTriggers, 'catalogs/split-triggers.yaml', 'split_triggers')
  ];
  if (catalogs.costBudgets !== undefined) {
    diagnostics.push(...validateCatalogArrayShape(catalogs.costBudgets, 'catalogs/cost-budgets.yaml', 'service_budgets'));
    for (const key of ['product_unit_budgets', 'automatic_action_policies']) {
      if (isRecord(catalogs.costBudgets) && catalogs.costBudgets[key] !== undefined) {
        diagnostics.push(...validateCatalogArrayShape(catalogs.costBudgets, 'catalogs/cost-budgets.yaml', key));
      }
    }
  }
  if (catalogs.sloTiers !== undefined) {
    diagnostics.push(...validateCatalogArrayShape(catalogs.sloTiers, 'catalogs/slo-tiers.yaml', 'tiers'));
    if (isRecord(catalogs.sloTiers) && catalogs.sloTiers.service_tier_mapping !== undefined && !isRecord(catalogs.sloTiers.service_tier_mapping)) {
      diagnostics.push(createDiagnostic('catalogs/slo-tiers.yaml', 'service_tier_mapping', 'Service tier mapping must be an object.'));
    }
  }
  return diagnostics;
}

/** This is the reader's minimum shape contract, not the service.yaml schema. */
export function validateCatalogArrayShape(value: unknown, file: string, collection: string, idField?: string): readonly Diagnostic[] {
  if (!isRecord(value) || !Array.isArray(value[collection])) {
    return [createDiagnostic(file, collection, `Catalog must be an object with a ${collection} array.`)];
  }
  const items = value[collection] as unknown[];
  return items.flatMap((item, index) => {
    const path = `${collection}[${index}]`;
    if (!isRecord(item)) return [createDiagnostic(file, path, 'Catalog entries must be objects.')];
    if (idField !== undefined) {
      const id = item[idField];
      if (typeof id !== 'string' || id.trim().length === 0) {
        return [createDiagnostic(file, `${path}.${idField}`, 'Catalog identity must be a non-empty string.')];
      }
    }
    return [];
  });
}

function createDiagnostic(file: string, path: string, message: string): Diagnostic {
  return { ruleId: 'ZDP-CATALOG-SHAPE-001', severity: 'error', file, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
