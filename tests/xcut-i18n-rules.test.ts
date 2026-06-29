import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryI18nContract } from '../src/xcut-i18n-rules.ts';

describe('cross-cutting i18n rules', () => {
  test('skips non-user-facing repositories without i18n contracts', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryI18nContract({
        repositoryRoot,
        repositoryServiceContract: {
          domain: {
            user_facing: false
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('passes user-facing contracts with message keys and zero fallback proof', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
dependencies:
  services:
    - platform-localization
localization:
  active_locales:
    - en
    - ko
  production_fallback_messages: 0
`,
        'contracts/ui-copy.yaml': `
messages:
  signup.cta:
    message_key: auth.signup.cta
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryI18nContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails user-facing repositories without a message key contract', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryI18nContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-I18N-001',
          severity: 'error',
          file: 'service.yaml',
          path: 'i18n.message_keys_required',
          message:
            'User-facing repositories must declare a message key or localization contract before hardcoded UI copy can ship.'
        });
      }
    );
  });

  test('fails literal UI labels in contract files without nearby message keys', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
dependencies:
  services:
    - platform-localization
`,
        'contracts/auth-ui.yaml': `
screen:
  button_label: "Sign up"
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryI18nContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-I18N-001',
          severity: 'error',
          file: 'contracts/auth-ui.yaml',
          path: 'line.2',
          message:
            'User-facing UI copy in contracts must reference a message key instead of a literal label, title, placeholder, or state message.'
        });
      }
    );
  });

  test('fails active locale declarations without zero fallback proof', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
localization:
  message_keys_required: true
  active_locales:
    - en
    - ko
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryI18nContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-I18N-002',
          severity: 'error',
          file: 'service.yaml',
          path: 'i18n.production_fallback_messages',
          message:
            'Active locale declarations must prove production fallback message count is 0 or declare an equivalent zero-fallback proof.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), 'zdp-architecture-linter-xcut-i18n-')
  );

  try {
    for (const [file, source] of Object.entries(files)) {
      const fullPath = join(repositoryRoot, file);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}
