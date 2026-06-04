import type { Diagnostic } from './diagnostics.ts';
import type { RepositoryIndex } from './repository-rules.ts';
import type { ServiceIndex } from './service-rules.ts';

const COST_BUDGETS_FILE = 'catalogs/cost-budgets.yaml';
const SLO_TIERS_FILE = 'catalogs/slo-tiers.yaml';

const COST_BUDGET_RULE_ID = 'ZDP-COST-001';
const SLO_TIER_RULE_ID = 'ZDP-SLO-001';

export function validateCostBudgetCatalog(value: unknown): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDiagnostic(
        COST_BUDGET_RULE_ID,
        COST_BUDGETS_FILE,
        'catalogs/cost-budgets.yaml',
        '`cost-budgets.yaml` must be a YAML object.'
      )
    ];
  }

  const diagnostics: Diagnostic[] = [];
  const serviceBudgetIds = new Set<string>();

  diagnostics.push(
    ...validateBudgetArray({
      value: value.service_budgets,
      path: 'service_budgets',
      requiredUnitBudget: false,
      ids: serviceBudgetIds
    })
  );
  diagnostics.push(
    ...validateBudgetArray({
      value: value.product_unit_budgets,
      path: 'product_unit_budgets',
      requiredUnitBudget: true,
      ids: new Set()
    })
  );
  diagnostics.push(
    ...validateAutomaticActionPolicies(value.automatic_action_policies, serviceBudgetIds)
  );

  return diagnostics;
}

export function validateSloTierCatalog(
  value: unknown,
  repositoryIndex: RepositoryIndex,
  serviceIndex: ServiceIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDiagnostic(
        SLO_TIER_RULE_ID,
        SLO_TIERS_FILE,
        'catalogs/slo-tiers.yaml',
        '`slo-tiers.yaml` must be a YAML object.'
      )
    ];
  }

  const diagnostics: Diagnostic[] = [];
  const tierIds = new Set<string>();

  diagnostics.push(...validateSloTierEntries(value.tiers, tierIds));
  diagnostics.push(
    ...validateServiceTierMapping(
      value.service_tier_mapping,
      tierIds,
      repositoryIndex,
      serviceIndex
    )
  );

  return diagnostics;
}

function validateBudgetArray(input: {
  readonly value: unknown;
  readonly path: string;
  readonly requiredUnitBudget: boolean;
  readonly ids: Set<string>;
}): readonly Diagnostic[] {
  if (!Array.isArray(input.value)) {
    return [
      createDiagnostic(
        COST_BUDGET_RULE_ID,
        COST_BUDGETS_FILE,
        input.path,
        `\`${input.path}\` must be a YAML array.`
      )
    ];
  }

  return input.value.flatMap((entry, index) =>
    validateBudgetEntry(entry, index, input.path, input.requiredUnitBudget, input.ids)
  );
}

function validateBudgetEntry(
  value: unknown,
  index: number,
  basePath: string,
  requiredUnitBudget: boolean,
  ids: Set<string>
): readonly Diagnostic[] {
  const path = `${basePath}[${index}]`;

  if (!isRecord(value)) {
    return [
      createDiagnostic(
        COST_BUDGET_RULE_ID,
        COST_BUDGETS_FILE,
        path,
        'Budget entry must be a YAML object.'
      )
    ];
  }

  const diagnostics: Diagnostic[] = [];
  const id = readStringField(value, 'id');

  if (id === null) {
    diagnostics.push(
      createDiagnostic(
        COST_BUDGET_RULE_ID,
        COST_BUDGETS_FILE,
        `${path}.id`,
        'Budget entry must declare `id`.'
      )
    );
  } else if (ids.has(id)) {
    diagnostics.push(
      createDiagnostic(
        COST_BUDGET_RULE_ID,
        COST_BUDGETS_FILE,
        `${path}.id`,
        `Budget id \`${id}\` is duplicated.`
      )
    );
  } else {
    ids.add(id);
  }

  if (requiredUnitBudget) {
    if (
      readNonNegativeNumberField(value, 'unit_budget_usd') === null &&
      readStringField(value, 'unit_budget_expression') === null
    ) {
      diagnostics.push(
        createDiagnostic(
          COST_BUDGET_RULE_ID,
          COST_BUDGETS_FILE,
          `${path}.unit_budget_usd`,
          'Product unit budget must declare `unit_budget_usd` or `unit_budget_expression`.'
        )
      );
    }
  } else {
    const monthlyBudget = readNonNegativeNumberField(value, 'monthly_budget_usd');

    if (monthlyBudget === null) {
      diagnostics.push(
        createDiagnostic(
          COST_BUDGET_RULE_ID,
          COST_BUDGETS_FILE,
          `${path}.monthly_budget_usd`,
          'Service budget must declare non-negative `monthly_budget_usd`.'
        )
      );
    }
  }

  const warnAt = readNullablePercentField(value, 'warn_at_percent');
  const blockAt = readNullablePercentField(value, 'block_at_percent');

  if (warnAt.invalid) {
    diagnostics.push(
      createDiagnostic(
        COST_BUDGET_RULE_ID,
        COST_BUDGETS_FILE,
        `${path}.warn_at_percent`,
        '`warn_at_percent` must be a number between 0 and 100, or null.'
      )
    );
  }

  if (blockAt.invalid) {
    diagnostics.push(
      createDiagnostic(
        COST_BUDGET_RULE_ID,
        COST_BUDGETS_FILE,
        `${path}.block_at_percent`,
        '`block_at_percent` must be a number between 0 and 100, or null.'
      )
    );
  }

  if (
    warnAt.value !== null &&
    blockAt.value !== null &&
    warnAt.value > blockAt.value
  ) {
    diagnostics.push(
      createDiagnostic(
        COST_BUDGET_RULE_ID,
        COST_BUDGETS_FILE,
        `${path}.warn_at_percent`,
        '`warn_at_percent` must not be greater than `block_at_percent`.'
      )
    );
  }

  return diagnostics;
}

function validateAutomaticActionPolicies(
  value: unknown,
  serviceBudgetIds: ReadonlySet<string>
): readonly Diagnostic[] {
  if (!Array.isArray(value)) {
    return [
      createDiagnostic(
        COST_BUDGET_RULE_ID,
        COST_BUDGETS_FILE,
        'automatic_action_policies',
        '`automatic_action_policies` must be a YAML array.'
      )
    ];
  }

  return value.flatMap((entry, index) => {
    const path = `automatic_action_policies[${index}]`;

    if (!isRecord(entry)) {
      return [
        createDiagnostic(
          COST_BUDGET_RULE_ID,
          COST_BUDGETS_FILE,
          path,
          'Automatic action policy must be a YAML object.'
        )
      ];
    }

    const targetBudget = readStringField(entry, 'target_budget');

    if (targetBudget === null) {
      return [
        createDiagnostic(
          COST_BUDGET_RULE_ID,
          COST_BUDGETS_FILE,
          `${path}.target_budget`,
          'Automatic action policy must declare `target_budget`.'
        )
      ];
    }

    return serviceBudgetIds.has(targetBudget)
      ? []
      : [
          createDiagnostic(
            COST_BUDGET_RULE_ID,
            COST_BUDGETS_FILE,
            `${path}.target_budget`,
            `Automatic action policy references unknown service budget \`${targetBudget}\`.`
          )
        ];
  });
}

function validateSloTierEntries(
  value: unknown,
  tierIds: Set<string>
): readonly Diagnostic[] {
  if (!Array.isArray(value)) {
    return [
      createDiagnostic(
        SLO_TIER_RULE_ID,
        SLO_TIERS_FILE,
        'tiers',
        '`tiers` must be a YAML array.'
      )
    ];
  }

  return value.flatMap((entry, index) => {
    const path = `tiers[${index}]`;

    if (!isRecord(entry)) {
      return [
        createDiagnostic(
          SLO_TIER_RULE_ID,
          SLO_TIERS_FILE,
          path,
          'SLO tier entry must be a YAML object.'
        )
      ];
    }

    const diagnostics: Diagnostic[] = [];
    const id = readStringField(entry, 'id');

    if (id === null) {
      diagnostics.push(
        createDiagnostic(
          SLO_TIER_RULE_ID,
          SLO_TIERS_FILE,
          `${path}.id`,
          'SLO tier entry must declare `id`.'
        )
      );
    } else if (tierIds.has(id)) {
      diagnostics.push(
        createDiagnostic(
          SLO_TIER_RULE_ID,
          SLO_TIERS_FILE,
          `${path}.id`,
          `SLO tier id \`${id}\` is duplicated.`
        )
      );
    } else {
      tierIds.add(id);
    }

    for (const field of [
      'availability_target_percent',
      'latency_p95_ms',
      'error_rate_threshold_percent'
    ]) {
      if (!isNullableNonNegativeNumber(entry[field])) {
        diagnostics.push(
          createDiagnostic(
            SLO_TIER_RULE_ID,
            SLO_TIERS_FILE,
            `${path}.${field}`,
            `SLO tier field \`${field}\` must be a non-negative number or null.`
          )
        );
      }
    }

    return diagnostics;
  });
}

function validateServiceTierMapping(
  value: unknown,
  tierIds: ReadonlySet<string>,
  repositoryIndex: RepositoryIndex,
  serviceIndex: ServiceIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDiagnostic(
        SLO_TIER_RULE_ID,
        SLO_TIERS_FILE,
        'service_tier_mapping',
        '`service_tier_mapping` must be a YAML object.'
      )
    ];
  }

  return Object.entries(value).flatMap(([target, tierId]) => {
    const path = `service_tier_mapping.${target}`;
    const diagnostics: Diagnostic[] = [];

    if (typeof tierId !== 'string' || tierId.trim().length === 0) {
      diagnostics.push(
        createDiagnostic(
          SLO_TIER_RULE_ID,
          SLO_TIERS_FILE,
          path,
          'Service tier mapping value must be a tier id string.'
        )
      );
    } else if (!tierIds.has(tierId.trim())) {
      diagnostics.push(
        createDiagnostic(
          SLO_TIER_RULE_ID,
          SLO_TIERS_FILE,
          path,
          `Service tier mapping references unknown SLO tier \`${tierId.trim()}\`.`
        )
      );
    }

    if (
      !repositoryIndex.byName.has(target) &&
      !serviceIndex.byId.has(target)
    ) {
      diagnostics.push(
        createDiagnostic(
          SLO_TIER_RULE_ID,
          SLO_TIERS_FILE,
          path,
          `Service tier mapping target \`${target}\` is not a known repository or service id.`
        )
      );
    }

    return diagnostics;
  });
}

function readNullablePercentField(
  value: Record<string, unknown>,
  field: string
): { readonly value: number | null; readonly invalid: boolean } {
  const candidate = value[field];

  if (candidate === null || candidate === undefined) {
    return { value: null, invalid: false };
  }

  return typeof candidate === 'number' && candidate >= 0 && candidate <= 100
    ? { value: candidate, invalid: false }
    : { value: null, invalid: true };
}

function readNonNegativeNumberField(
  value: Record<string, unknown>,
  field: string
): number | null {
  const candidate = value[field];

  return typeof candidate === 'number' && candidate >= 0 ? candidate : null;
}

function isNullableNonNegativeNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && value >= 0);
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createDiagnostic(
  ruleId: string,
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId,
    severity: 'error',
    file,
    path,
    message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
