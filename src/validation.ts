import { loadArchitectureCatalogs } from './catalog-loader.ts';
import type { ValidationResult } from './diagnostics.ts';
import { validateRepositoriesCatalog } from './repository-rules.ts';

export interface ValidateArchitectureInput {
  readonly architectureRoot: string;
}

export async function validateArchitecture(
  input: ValidateArchitectureInput
): Promise<ValidationResult> {
  const catalogs = await loadArchitectureCatalogs(input.architectureRoot);

  return {
    diagnostics: validateRepositoriesCatalog(catalogs.repositories)
  };
}

