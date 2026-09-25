import {
  loadArchitectureCatalogs,
  type ArchitectureCatalogs
} from './catalog-loader.ts';
import { validateDataClassCatalogSchema } from './data-class-schema-validation.ts';
import { validateEventCatalogSchema } from './event-schema-validation.ts';
import { validateExternalProviderCatalogSchema } from './external-provider-schema-validation.ts';
import { validateOperationalAssetCatalogSchema } from './operational-asset-schema-validation.ts';
import { hasErrors, type ValidationResult } from './diagnostics.ts';
import { validateRepositoryCatalogSchema } from './repository-schema-validation.ts';
import { validateSupportSourceAdapterCatalogSchema } from './support-source-registry-validation.ts';
import { validateRuleCatalogShapes } from './rule-catalog-shape.ts';
import { validateCoreCatalogShapes } from './core-catalog-shape.ts';
import { validateCatalogIdentities } from './catalog-identities.ts';

export interface ArchitectureCatalogSchemaPreflight {
  readonly catalogs: ArchitectureCatalogs;
  readonly validation: ValidationResult;
}

export async function loadArchitectureCatalogSchemaPreflight(
  architectureRoot: string,
  options: { readonly checkOperationalAssetTimeliness?: boolean } = {}
): Promise<ArchitectureCatalogSchemaPreflight> {
  const catalogs = await loadArchitectureCatalogs(architectureRoot);
  const validation = await validateArchitectureCatalogSchemas({
    architectureRoot,
    catalogs,
    checkOperationalAssetTimeliness: options.checkOperationalAssetTimeliness
  });
  return { catalogs, validation };
}

export async function validateArchitectureCatalogSchemas(input: {
  readonly architectureRoot: string;
  readonly catalogs: ArchitectureCatalogs;
  readonly checkOperationalAssetTimeliness?: boolean;
  readonly observedAt?: Date;
}): Promise<ValidationResult> {
  const inputDiagnostics = [
    ...validateRuleCatalogShapes(input.catalogs),
    ...validateCoreCatalogShapes(input.catalogs),
    ...validateCatalogIdentities(input.catalogs)
  ];
  if (inputDiagnostics.length > 0) return { diagnostics: inputDiagnostics };
  const diagnostics = (await Promise.all([
    validateRepositoryCatalogSchema({ architectureRoot: input.architectureRoot, value: input.catalogs.repositories }),
    validateDataClassCatalogSchema({ architectureRoot: input.architectureRoot, value: input.catalogs.dataClasses }),
    validateEventCatalogSchema({ architectureRoot: input.architectureRoot, value: input.catalogs.events }),
    validateExternalProviderCatalogSchema({ architectureRoot: input.architectureRoot, value: input.catalogs.externalProviders }),
    validateOperationalAssetCatalogSchema({ architectureRoot: input.architectureRoot, value: input.catalogs.operationalAssets, observedAt: input.observedAt, checkTimeliness: input.checkOperationalAssetTimeliness }),
    validateSupportSourceAdapterCatalogSchema({ architectureRoot: input.architectureRoot, value: input.catalogs.supportSourceAdapters })
  ])).flat();
  return { diagnostics };
}

export function catalogSchemaPreflightFailed(preflight: ArchitectureCatalogSchemaPreflight): boolean {
  return hasErrors(preflight.validation);
}
