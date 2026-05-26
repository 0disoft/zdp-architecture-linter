import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { buildAiSensitiveDataPolicy, buildAiUserDataPolicy } from '../src/ai-contract-rules.ts';
import { buildPublicApiContractPolicy } from '../src/api-rules.ts';
import { buildLedgerDatastoreDependencyPolicy } from '../src/data-access-rules.ts';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';
import { validateFixtureExpectations } from '../src/fixture-validation.ts';
import {
  buildCreditMonetizationPolicy,
  buildMoneyMovementPolicy,
  buildPaymentDataFrontendPolicy
} from '../src/money-rules.ts';
import {
  buildProviderContractPolicy,
  buildProviderWebhookPolicy
} from '../src/provider-rules.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';
import {
  buildTierCriticalControlsPolicy,
  buildTierOperationalContractPolicy,
  buildTier3RiskyExperimentPolicy
} from '../src/tier-rules.ts';

const emptyRules = { rules: [] };
const publicApiRules = {
  rules: [
    {
      id: 'ZDP-API-001',
      condition: {
        expression: 'domain.public_api == true or api.exposure in [partner, public]'
      },
      assertions: {
        require_values: {
          'api.openapi_required': true
        },
        require_fields: [
          'api.versioning',
          'api.rate_limit_policy',
          'api.deprecation_policy'
        ]
      }
    }
  ]
};

describe('fixture expectations', () => {
  test('passes when fixture outcomes match expected rule ids', async () => {
    await withFixtureRoot(
      {
        'fixtures/pass/internal-api.yaml': `
fixture:
  id: internal-api
  expect: pass
  expected_failures: []

service:
  id: internal-api

domain:
  public_api: false

api:
  exposure: internal
`,
        'fixtures/fail/public-api.yaml': `
fixture:
  id: public-api
  expect: fail
  expected_failures:
    - ZDP-API-001

service:
  id: public-api

domain:
  public_api: true

api:
  exposure: public
  openapi_required: false
`
      },
      async (architectureRoot) => {
        const diagnostics = await validateFixtureExpectations(
          createFixtureContext(architectureRoot)
        );

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when a pass fixture produces rule diagnostics', async () => {
    await withFixtureRoot(
      {
        'fixtures/pass/public-api.yaml': `
fixture:
  id: public-api
  expect: pass
  expected_failures: []

service:
  id: public-api

domain:
  public_api: true

api:
  exposure: public
  openapi_required: false
`
      },
      async (architectureRoot) => {
        const diagnostics = await validateFixtureExpectations(
          createFixtureContext(architectureRoot)
        );

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-FIXTURE-002',
            severity: 'error',
            file: 'fixtures/pass/public-api.yaml',
            path: 'fixture.expected_failures',
            message:
              'Pass fixture produced unexpected rule failures: `ZDP-API-001`.'
          }
        ]);
      }
    );
  });

  test('fails when a fail fixture does not produce the expected rule', async () => {
    await withFixtureRoot(
      {
        'fixtures/fail/internal-api.yaml': `
fixture:
  id: internal-api
  expect: fail
  expected_failures:
    - ZDP-API-001

service:
  id: internal-api

domain:
  public_api: false

api:
  exposure: internal
`
      },
      async (architectureRoot) => {
        const diagnostics = await validateFixtureExpectations(
          createFixtureContext(architectureRoot)
        );

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-FIXTURE-003',
            severity: 'error',
            file: 'fixtures/fail/internal-api.yaml',
            path: 'fixture.expected_failures',
            message: 'missing expected failures: `ZDP-API-001`'
          }
        ]);
      }
    );
  });
});

function createFixtureContext(architectureRoot: string) {
  return {
    architectureRoot,
    repositoryIndex: buildRepositoryIndex({ repositories: [] }),
    datastoreIndex: buildDatastoreIndex({ datastores: [] }),
    ledgerDatastoreDependencyPolicy: buildLedgerDatastoreDependencyPolicy(emptyRules),
    aiUserDataPolicy: buildAiUserDataPolicy(emptyRules),
    aiSensitiveDataPolicy: buildAiSensitiveDataPolicy(emptyRules),
    moneyMovementPolicy: buildMoneyMovementPolicy(emptyRules),
    paymentDataFrontendPolicy: buildPaymentDataFrontendPolicy(emptyRules),
    creditMonetizationPolicy: buildCreditMonetizationPolicy(emptyRules),
    providerContractPolicy: buildProviderContractPolicy(emptyRules),
    providerWebhookPolicy: buildProviderWebhookPolicy(emptyRules),
    tierOperationalContractPolicy: buildTierOperationalContractPolicy(emptyRules),
    tierCriticalControlsPolicy: buildTierCriticalControlsPolicy(emptyRules),
    tier3RiskyExperimentPolicy: buildTier3RiskyExperimentPolicy(emptyRules),
    publicApiContractPolicy: buildPublicApiContractPolicy(publicApiRules)
  };
}

async function withFixtureRoot(
  files: Record<string, string>,
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-fixtures-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(architectureRoot, relativePath);
      const directory = absolutePath.slice(0, absolutePath.lastIndexOf('\\'));

      await mkdir(directory, { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
