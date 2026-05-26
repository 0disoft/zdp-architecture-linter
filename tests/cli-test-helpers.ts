import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const repoRoot = join(import.meta.dir, '..');

export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function runCli(args: readonly string[]): Promise<CliResult> {
  const childProcess = Bun.spawn({
    cmd: [process.execPath, 'src/cli.ts', ...args],
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe'
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    childProcess.exited,
    new Response(childProcess.stdout).text(),
    new Response(childProcess.stderr).text()
  ]);

  return { exitCode, stdout, stderr };
}

export async function withArchitectureFiles(
  files: Record<string, string>,
  callback: (paths: {
    readonly architectureRoot: string;
    readonly repositoryRoot: string;
  }) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-cli-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(architectureRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback({
      architectureRoot,
      repositoryRoot: join(architectureRoot, 'repo')
    });
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}

export function createMinimalArchitectureFiles(
  files: Record<string, string>
): Record<string, string> {
  return {
    'schemas/service.schema.json': JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: true
    }),
    'ROADMAP.md': '# Roadmap\n',
    'docs/26-eighteen-month-roadmap.md': '# Eighteen month roadmap\n',
    'catalogs/repositories.yaml': 'repositories: []\n',
    'catalogs/services.yaml': 'services: []\n',
    'catalogs/datastores.yaml': 'datastores: []\n',
    'catalogs/data-classes.yaml': 'data_classes: []\n',
    'catalogs/events.yaml': 'events: []\n',
    'catalogs/external-providers.yaml': 'providers: []\n',
    'rules/repository.rules.yaml': 'repository_area_rules: {}\n',
    'rules/money.rules.yaml': 'rules: []\n',
    'rules/provider.rules.yaml': 'rules: []\n',
    'rules/ai-data-access.rules.yaml': 'rules: []\n',
    'rules/data-access.rules.yaml': 'rules: []\n',
    'rules/tier.rules.yaml': 'rules: []\n',
    ...files
  };
}
