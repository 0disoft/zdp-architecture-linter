import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryA11yContract } from '../src/xcut-a11y-rules.ts';

describe('cross-cutting accessibility rules', () => {
  test('skips static user-facing surfaces without stateful UI evidence', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
notes:
  - This is a static public surface with static content only.
`,
        'src/pages/index.astro': `
<section aria-labelledby="page-title">
  <h1 id="page-title">Hello</h1>
</section>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
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

  test('fails stateful user-facing UI surfaces without full screen state and a11y evidence', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
`,
        'src/routes/search/+page.svelte': `
<script lang="ts">
  export let results: readonly string[] = [];
</script>

<ul>
  {#each results as result}
    <li>{result}</li>
  {/each}
</ul>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-A11Y-001',
          severity: 'error',
          file: 'src/routes/search/+page.svelte',
          path: 'a11y.screen_states',
          message:
            'Stateful user-facing UI surfaces must declare loading, empty, error, and data states plus basic accessibility wiring evidence.'
        });
      }
    );
  });

  test('passes stateful user-facing UI surfaces with screen state and a11y evidence', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
notes:
  - Screen states include loading skeleton, empty state, error alert with request_id, and data-ready content.
  - Accessibility wiring includes keyboard focus, labels, aria-describedby, icon accessible names, and prefers-reduced-motion.
`,
        'src/routes/search/+page.svelte': `
<script lang="ts">
  export let records: readonly string[] = [];
</script>

<section aria-labelledby="page-title">
  <h1 id="page-title">Search</h1>
</section>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
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

  test('fails visible native inputs without label linkage', async () => {
    await withRepositoryRoot(
      {
        'src/components/EmailForm.svelte': `
<form>
  <input id="email" name="email" type="email" />
</form>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-A11Y-001',
          severity: 'error',
          file: 'src/components/EmailForm.svelte',
          path: 'a11y.input_label',
          message:
            'Visible native inputs must have a label, aria-label, or aria-labelledby connection.'
        });
      }
    );
  });

  test('passes visible native inputs with label linkage', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
notes:
  - Screen states include loading progress, empty state, error alert with request_id, and data-ready content.
  - Accessibility wiring includes keyboard focus, labels, aria-describedby, accessible names, and prefers-reduced-motion.
`,
        'src/components/EmailForm.svelte': `
<form>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" />
</form>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
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

  test('passes visible native inputs wrapped by labels', async () => {
    await withRepositoryRoot(
      {
        'src/components/Checkbox.svelte': `
<label>
  <input name="terms" type="checkbox" />
  <span>Accept terms</span>
</label>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
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

  test('does not treat uppercase component inputs as native inputs', async () => {
    await withRepositoryRoot(
      {
        'src/components/PasswordField.svelte': `
<Field>
  <Label forId={id}>Password</Label>
  <Input {id} name="password" describedBy={describedByIds} />
</Field>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
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

  test('fails icon-only native buttons without accessible names', async () => {
    await withRepositoryRoot(
      {
        'src/components/IconButton.svelte': `
<button type="button">
  <svg aria-hidden="true" viewBox="0 0 24 24"></svg>
</button>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-A11Y-001',
          severity: 'error',
          file: 'src/components/IconButton.svelte',
          path: 'a11y.icon_button_name',
          message:
            'Icon-only native buttons must provide an accessible name with aria-label, aria-labelledby, or visible text.'
        });
      }
    );
  });

  test('passes native buttons with dynamic visible labels', async () => {
    await withRepositoryRoot(
      {
        'src/components/ConfirmAction.svelte': `
<button type="button">
  <span aria-hidden="true">
    <svg viewBox="0 0 24 24"></svg>
  </span>
  <span>{label}</span>
</button>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
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

  test('fails click handlers on non-interactive elements without keyboard semantics', async () => {
    await withRepositoryRoot(
      {
        'src/components/ClickableCard.svelte': `
<div class="card" onclick={() => undefined}>
  Open
</div>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryA11yContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-A11Y-001',
          severity: 'error',
          file: 'src/components/ClickableCard.svelte',
          path: 'a11y.clickable_semantics',
          message:
            'Clickable non-interactive elements must declare keyboard semantics with role, tabindex, and key handling, or use a native button/link.'
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
    join(tmpdir(), 'zdp-architecture-linter-xcut-a11y-')
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
