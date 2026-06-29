import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryColorContract } from '../src/xcut-color-rules.ts';

describe('cross-cutting color rules', () => {
  test('skips repositories without color contract surfaces', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: false
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryColorContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('passes token sources with hex fallback, OKLCH source, and semantic tokens', async () => {
    await withRepositoryRoot(
      {
        'src/styles/tokens.css': `
:root {
  --zdp-color-surface-panel: #fff8ea;
  --zdp-color-text-normal: #2f2418;
}

@supports (color: oklch(50% 0.1 240)) {
  :root {
    --zdp-color-surface-panel: oklch(98% 0.025 86);
    --zdp-color-text-normal: oklch(27% 0.04 70);
  }
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryColorContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails token sources with raw colors but no OKLCH or semantic layer', async () => {
    await withRepositoryRoot(
      {
        'tokens.css': `
:root {
  --brand-blue: #0066ff;
  --brand-red: rgb(255 0 0);
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryColorContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-COLOR-001',
          severity: 'error',
          file: 'tokens.css',
          path: 'color.token_source',
          message:
            'Design token sources that contain raw hex/rgb/hsl colors must also expose OKLCH source values and semantic or component token layers.'
        });
      }
    );
  });

  test('fails product style sources with raw color property values', async () => {
    await withRepositoryRoot(
      {
        'src/styles/components.css': `
.button {
  background: #0066ff;
  color: var(--zdp-color-text-inverse);
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryColorContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-COLOR-001',
          severity: 'error',
          file: 'src/styles/components.css',
          path: 'color.raw_property',
          message:
            'Product style sources must use semantic or component design tokens instead of raw hex/rgb/hsl color property values.'
        });
      }
    );
  });

  test('passes product style sources that use token variables', async () => {
    await withRepositoryRoot(
      {
        'styles/components.css': `
.button {
  background: var(--zdp-button-background-default);
  border-color: var(--zdp-button-border-default);
  color: var(--zdp-button-text-default);
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryColorContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails dark mode invert filters', async () => {
    await withRepositoryRoot(
      {
        'src/styles/theme.css': `
[data-zdp-theme="dark"] {
  filter: invert(1);
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryColorContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-COLOR-001',
          severity: 'error',
          file: 'src/styles/theme.css',
          path: 'color.dark_mode_invert_filter',
          message:
            'Dark mode must be expressed with semantic token values, not filter: invert().'
        });
      }
    );
  });

  test('fails P3 color usage outside a color-gamut media gate', async () => {
    await withRepositoryRoot(
      {
        'styles/theme.css': `
.hero {
  color: color(display-p3 1 0.2 0.1);
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryColorContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-COLOR-001',
          severity: 'error',
          file: 'styles/theme.css',
          path: 'color.p3_without_gate',
          message:
            'P3 color usage must be scoped under @media (color-gamut: p3) with an sRGB fallback.'
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
    join(tmpdir(), 'zdp-architecture-linter-xcut-color-')
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
