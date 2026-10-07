type Row = Record<string, any>;
export interface PolicyDiagnostic { ruleId: string; severity: "error"; file: string; path: string; message: string }
const row = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
const percent = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

export function validateOperatingPolicies(cost: unknown, slo: unknown, repositories: unknown): PolicyDiagnostic[] {
  const diagnostics: PolicyDiagnostic[] = [];
  const fail = (file: string, path: string, message: string) => diagnostics.push({
    ruleId: file.includes("cost") ? "ZDP-OPERATING-COST-001" : "ZDP-OPERATING-SLO-001", severity: "error", file, path, message,
  });
  const costFile = "catalogs/cost-budgets.yaml";
  if (!row(cost) || !Array.isArray(cost.service_budgets) || !Array.isArray(cost.product_unit_budgets)
    || !Array.isArray(cost.automatic_action_policies) || !row(cost.action_definitions) || !row(cost.unit_definitions)) {
    fail(costFile, "policy", "Cost policy must declare budgets, units, actions and automatic action policies.");
  } else {
    if (cost.automation_status !== "policy-only") fail(costFile, "automation_status", "Policy declarations cannot claim an active executor.");
    const budgets = new Map<string, Row>(cost.service_budgets.filter(row).map((item: Row) => [item.id, item] as [string, Row]));
    for (const [id, label] of Object.entries(cost.unit_definitions)) {
      if (typeof label !== "string" || !label.trim()) fail(costFile, `unit_definitions.${id}`, "Unit definition needs a nonempty label.");
    }
    for (const [id, definition] of Object.entries(cost.action_definitions)) {
      if (!row(definition) || !["notify", "degrade", "block"].includes(definition.effect) || typeof definition.description !== "string" || !definition.description.trim())
        fail(costFile, `action_definitions.${id}`, "Action needs a description and notify/degrade/block effect.");
    }
    for (const [index, unit] of cost.product_unit_budgets.entries()) {
      if (!row(unit) || !Object.hasOwn(cost.unit_definitions, unit.unit)) fail(costFile, `product_unit_budgets[${index}].unit`, "Budget unit must reference a declared unit.");
    }
    const targets = new Set();
    for (const [index, policy] of cost.automatic_action_policies.entries()) {
      const path = `automatic_action_policies[${index}]`;
      if (!row(policy)) { fail(costFile, path, "Automatic policy must be an object."); continue; }
      const budget = budgets.get(policy.target_budget);
      if (!budget || targets.has(policy.target_budget)) { fail(costFile, `${path}.target_budget`, "Policy target must be a known budget with a single automatic policy."); continue; }
      targets.add(policy.target_budget);
      if (!Array.isArray(policy.steps) || policy.steps.length === 0) { fail(costFile, `${path}.steps`, "Automatic policy needs nonempty steps."); continue; }
      let previous = -1;
      let warnFound = false;
      let blockFound = false;
      for (const [stepIndex, step] of policy.steps.entries()) {
        const stepPath = `${path}.steps[${stepIndex}]`;
        if (!row(step)) { fail(costFile, stepPath, "Policy step must be an object."); continue; }
        if (!percent(step.threshold_percent) || step.threshold_percent <= previous) fail(costFile, `${stepPath}.threshold_percent`, "Thresholds must strictly increase within 0..100.");
        previous = step.threshold_percent;
        if (!Array.isArray(step.actions) || step.actions.length === 0) { fail(costFile, `${stepPath}.actions`, "Step needs registered action IDs."); continue; }
        if (new Set(step.actions).size !== step.actions.length) fail(costFile, `${stepPath}.actions`, "Step action IDs must be unique.");
        for (const action of step.actions) {
          const definition = typeof action === "string" && Object.hasOwn(cost.action_definitions, action) ? cost.action_definitions[action] : undefined;
          if (!row(definition)) { fail(costFile, `${stepPath}.actions`, "Unknown action ID."); continue; }
          if (definition.effect === "notify" && step.threshold_percent === budget.warn_at_percent) warnFound = true;
          if (definition.effect === "block") {
            if (step.threshold_percent !== budget.block_at_percent) fail(costFile, `${stepPath}.threshold_percent`, "Blocking action must match the budget block threshold.");
            else blockFound = true;
          }
          if (definition.effect === "degrade" && (!percent(budget.warn_at_percent) || !percent(budget.block_at_percent)
            || step.threshold_percent < budget.warn_at_percent || step.threshold_percent >= budget.block_at_percent))
            fail(costFile, `${stepPath}.threshold_percent`, "Degradation must happen between warning and blocking thresholds.");
        }
      }
      if (!warnFound) fail(costFile, `${path}.steps`, "Warning threshold needs a notification action.");
      if (!blockFound) fail(costFile, `${path}.steps`, "Block threshold needs a blocking action.");
    }
  }
  const sloFile = "catalogs/slo-tiers.yaml";
  if (!row(slo) || !Array.isArray(slo.tiers) || !row(slo.service_tier_mapping) || !row(repositories) || !Array.isArray(repositories.repositories)) {
    fail(sloFile, "policy", "SLO policy needs tiers, mappings and repository catalog.");
  } else {
    const requiredIncidents = ["payment-approval-mismatch", "ledger-imbalance", "privileged-access-misuse"];
    if (!Array.isArray(slo.immediate_incident_classes) || requiredIncidents.some((id) => !slo.immediate_incident_classes.includes(id))
      || slo.immediate_incident_classes.some((id: unknown) => typeof id !== "string" || !id.trim())
      || new Set(slo.immediate_incident_classes).size !== slo.immediate_incident_classes.length)
      fail(sloFile, "immediate_incident_classes", "Immediate incident classes must preserve payment, ledger and privileged-access alerts without empty or duplicate entries.");
    const delivery: Record<string, string> = { critical: "always", high: "always", medium: "business-hours", low: "next-business-day", lab: "none" };
    const tiers = new Set(slo.tiers.filter(row).map((tier) => tier.id));
    for (const id of Object.keys(delivery)) if (!tiers.has(id)) fail(sloFile, "tiers", "All defined operating tiers must remain present.");
    for (const [index, tier] of slo.tiers.entries()) {
      const alerting = row(tier) ? tier.alerting : undefined;
      if (!row(alerting) || !["always", "business-hours", "next-business-day", "none"].includes(alerting.notification_policy)) {
        fail(sloFile, `tiers[${index}].alerting`, "Notification policy must declare its delivery window."); continue;
      }
      if (delivery[tier.id] && alerting.notification_policy !== delivery[tier.id])
        fail(sloFile, `tiers[${index}].alerting.notification_policy`, "Tier notification window must match its operating policy.");
      if (alerting.notification_policy === "always") {
        for (const field of ["night_delay_minutes", "weekend_delay_minutes"]) if (alerting[field] === null)
          fail(sloFile, `tiers[${index}].alerting.${field}`, "Always-on alert delivery needs explicit night and weekend delays.");
        if (![alerting.sustained_failure_minutes, alerting.consecutive_failures].some((value) => typeof value === "number" && Number.isFinite(value) && value > 0))
          fail(sloFile, `tiers[${index}].alerting`, "Always-on alerts need a positive sustained or consecutive failure confirmation.");
      }
      for (const field of ["night_delay_minutes", "weekend_delay_minutes", "sustained_failure_minutes", "consecutive_failures"]) {
        const value = alerting[field];
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (field === "consecutive_failures" && !Number.isInteger(value))))
          fail(sloFile, `tiers[${index}].alerting.${field}`, "Alert timing must be nonnegative numeric or explicitly null.");
      }
    }
    if (slo.required_deploy_unit_coverage !== true) fail(sloFile, "required_deploy_unit_coverage", "Deploy-unit SLO coverage must stay enabled.");
    for (const repository of repositories.repositories.filter(row)) {
      if (repository.repo_stage === "deploy_unit" && !tiers.has(slo.service_tier_mapping[repository.name]))
        fail(sloFile, `service_tier_mapping.${repository.name}`, "Every deploy unit must map explicitly to a known SLO tier.");
    }
  }
  return diagnostics;
}

export function validateOperatingPolicyExtensions(cost: unknown, slo: unknown, repositories: unknown): PolicyDiagnostic[] {
  if ((row(cost) && (cost.schema_version === "2" || "automation_status" in cost || "action_definitions" in cost))
    || (row(slo) && (slo.schema_version === "2" || "required_deploy_unit_coverage" in slo)))
    return validateOperatingPolicies(cost, slo, repositories);
  return [];
}

export function validateOperatingPolicyVersionTransition(
  base: { costBudgets?: unknown; sloTiers?: unknown }, head: { costBudgets?: unknown; sloTiers?: unknown }
): PolicyDiagnostic[] {
  return ([['costBudgets', 'cost-budgets'], ['sloTiers', 'slo-tiers']] as const).flatMap(([key, file]) => {
    const before = base[key], after = head[key];
    if (!row(before) || before.schema_version !== '2' || (row(after) && after.schema_version === '2')) return [];
    return [{ ruleId: 'ZDP-OPERATING-VERSION-001', severity: 'error' as const,
      file: `catalogs/${file}.yaml`, path: 'schema_version',
      message: 'Operating policy version 2 must remain declared; downgrade, removal and unsupported replacements are blocked.' }];
  });
}
