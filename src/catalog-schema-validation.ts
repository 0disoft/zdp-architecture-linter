import {
  loadArchitectureCatalogs,
  type ArchitectureCatalogs
} from './catalog-loader.ts';
import { validateDataClassCatalogSchema } from './data-class-schema-validation.ts';
import { validateEventCatalogSchema } from './event-schema-validation.ts';
import { validateExternalProviderCatalogSchema } from './external-provider-schema-validation.ts';
import {
  hasErrors,
  type ValidationResult
} from './diagnostics.ts';
import { validateRepositoryCatalogSchema } from './repository-schema-validation.ts';

export interface ArchitectureCatalogSchemaPreflight {
  readonly catalogs: ArchitectureCatalogs;
  readonly validation: ValidationResult;
}

export async function loadArchitectureCatalogSchemaPreflight(
  architectureRoot: string
): Promise<ArchitectureCatalogSchemaPreflight> {
  const catalogs = await loadArchitectureCatalogs(architectureRoot);
  const validation = await validateArchitectureCatalogSchemas({
    architectureRoot,
    catalogs
  });

  return { catalogs, validation };
}

export async function validateArchitectureCatalogSchemas(input: {
  readonly architectureRoot: string;
  readonly catalogs: ArchitectureCatalogs;
}): Promise<ValidationResult> {
  const diagnostics = (
    await Promise.all([
      validateRepositoryCatalogSchema({
        architectureRoot: input.architectureRoot,
        value: input.catalogs.repositories
      }),
      validateDataClassCatalogSchema({
        architectureRoot: input.architectureRoot,
        value: input.catalogs.dataClasses
      }),
      validateEventCatalogSchema({
        architectureRoot: input.architectureRoot,
        value: input.catalogs.events
      }),
      validateExternalProviderCatalogSchema({
        architectureRoot: input.architectureRoot,
        value: input.catalogs.externalProviders
      })
    ])
  ).flat();

  return { diagnostics };
}

export function catalogSchemaPreflightFailed(
  preflight: ArchitectureCatalogSchemaPreflight
): boolean {
  return hasErrors(preflight.validation);
}
