import { execFile } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { loadArchitectureCatalogs } from './catalog-loader.ts';
import type { ValidationResult } from './diagnostics.ts';
import { loadRepositoryServiceContract } from './service-schema-validation.ts';
import { validateArchitecture } from './validation.ts';

const execFileAsync = promisify(execFile);
const GIT_EXEC_MAX_BUFFER_BYTES = 50 * 1024 * 1024;
const GIT_EXEC_TIMEOUT_MS = 30_000;

const REQUIRED_ARCHITECTURE_FILES = [
  'ROADMAP.md',
  'docs/26-eighteen-month-roadmap.md',
  'catalogs/repositories.yaml',
  'catalogs/services.yaml',
  'catalogs/datastores.yaml',
  'catalogs/data-classes.yaml',
  'catalogs/events.yaml',
  'catalogs/external-providers.yaml',
  'schemas/service.schema.json',
  'schemas/event.schema.json',
  'rules/repository.rules.yaml',
  'rules/money.rules.yaml',
  'rules/provider.rules.yaml',
  'rules/ai-data-access.rules.yaml',
  'rules/data-access.rules.yaml',
  'rules/tier.rules.yaml',
  'rules/api.rules.yaml'
] as const;

export type DoctorStatus = 'ok' | 'warning' | 'error';

export interface ArchitectureDoctorReport {
  readonly status: DoctorStatus;
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
  readonly validation: {
    readonly diagnostics: number;
    readonly errors: number;
    readonly warnings: number;
  };
  readonly checks: readonly DoctorCheck[];
}

export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorStatus;
  readonly message: string;
  readonly details?: readonly string[];
}

export async function createArchitectureDoctorReport(input: {
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
}): Promise<ArchitectureDoctorReport> {
  const checks: DoctorCheck[] = [];

  checks.push(await checkRequiredFiles(input.architectureRoot));
  checks.push(await checkCatalogLoad(input.architectureRoot));

  const validation = await runValidation(input);
  checks.push(validation.check);
  checks.push(await checkGitState(input.architectureRoot));
  checks.push(await checkGeneratedBoundary(input.architectureRoot));

  if (input.repositoryRoot !== undefined) {
    checks.push(await checkRepositoryServiceContract(input.repositoryRoot));
  }

  return {
    status: summarizeStatus(checks),
    architectureRoot: input.architectureRoot,
    repositoryRoot: input.repositoryRoot,
    validation: summarizeValidation(validation.result),
    checks
  };
}

export function formatArchitectureDoctorReportText(
  report: ArchitectureDoctorReport
): string {
  return [
    '# zdp-arch doctor',
    '',
    `- status: ${report.status}`,
    `- architecture: ${report.architectureRoot}`,
    ...(report.repositoryRoot === undefined
      ? []
      : [`- repository: ${report.repositoryRoot}`]),
    `- diagnostics: ${report.validation.diagnostics} (${report.validation.errors} errors, ${report.validation.warnings} warnings)`,
    '',
    '## checks',
    ...report.checks.flatMap(formatCheck)
  ].join('\n');
}

function formatCheck(check: DoctorCheck): readonly string[] {
  return [
    `- [${check.status}] ${check.id}: ${check.message}`,
    ...(check.details ?? []).map((detail) => `  - ${detail}`)
  ];
}

async function checkRequiredFiles(architectureRoot: string): Promise<DoctorCheck> {
  const missing: string[] = [];

  for (const file of REQUIRED_ARCHITECTURE_FILES) {
    if (!(await pathExists(join(architectureRoot, file)))) {
      missing.push(file);
    }
  }

  return missing.length === 0
    ? {
        id: 'architecture.required_files',
        status: 'ok',
        message: 'required architecture files are present'
      }
    : {
        id: 'architecture.required_files',
        status: 'error',
        message: `${missing.length} required architecture file(s) are missing`,
        details: missing
      };
}

async function checkCatalogLoad(architectureRoot: string): Promise<DoctorCheck> {
  try {
    await loadArchitectureCatalogs(architectureRoot);

    return {
      id: 'architecture.catalog_load',
      status: 'ok',
      message: 'catalogs, schemas, rules, and roadmap text load successfully'
    };
  } catch (error) {
    return {
      id: 'architecture.catalog_load',
      status: 'error',
      message: 'architecture inputs could not be loaded',
      details: [formatError(error)]
    };
  }
}

async function runValidation(input: {
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
}): Promise<{
  readonly result: ValidationResult;
  readonly check: DoctorCheck;
}> {
  try {
    const result = await validateArchitecture(input);
    const summary = summarizeValidation(result);

    return {
      result,
      check: {
        id: 'architecture.validate',
        status: summary.errors > 0 ? 'error' : summary.warnings > 0 ? 'warning' : 'ok',
        message:
          summary.diagnostics === 0
            ? 'validate completed without diagnostics'
            : `validate completed with ${summary.errors} error(s) and ${summary.warnings} warning(s)`
      }
    };
  } catch (error) {
    return {
      result: {
        diagnostics: []
      },
      check: {
        id: 'architecture.validate',
        status: 'error',
        message: 'validate could not run',
        details: [formatError(error)]
      }
    };
  }
}

async function checkGitState(repositoryRoot: string): Promise<DoctorCheck> {
  const insideWorkTree = await runGit(repositoryRoot, [
    'rev-parse',
    '--is-inside-work-tree'
  ]);

  if (insideWorkTree.exitCode !== 0 || insideWorkTree.stdout.trim() !== 'true') {
    return {
      id: 'architecture.git',
      status: 'warning',
      message: 'architecture root is not inside a Git work tree'
    };
  }

  const [branch, status] = await Promise.all([
    runGit(repositoryRoot, ['branch', '--show-current']),
    runGit(repositoryRoot, ['status', '--porcelain'])
  ]);
  const branchName = branch.stdout.trim();
  const changedLines = status.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  return changedLines.length === 0
    ? {
        id: 'architecture.git',
        status: 'ok',
        message: `Git work tree is clean${branchName.length === 0 ? '' : ` on ${branchName}`}`
      }
    : {
        id: 'architecture.git',
        status: 'warning',
        message: `Git work tree has ${changedLines.length} pending change(s)${
          branchName.length === 0 ? '' : ` on ${branchName}`
        }`,
        details: changedLines.slice(0, 20)
      };
}

async function checkGeneratedBoundary(
  architectureRoot: string
): Promise<DoctorCheck> {
  const generatedPath = join(architectureRoot, 'generated');

  if (!(await pathExists(generatedPath))) {
    return {
      id: 'architecture.generated_boundary',
      status: 'ok',
      message: 'generated directory is absent'
    };
  }

  const generatedStat = await stat(generatedPath);

  if (!generatedStat.isDirectory()) {
    return {
      id: 'architecture.generated_boundary',
      status: 'error',
      message: 'generated exists but is not a directory'
    };
  }

  return (await pathExists(join(generatedPath, 'README.md')))
    ? {
        id: 'architecture.generated_boundary',
        status: 'ok',
        message: 'generated directory has a boundary README'
      }
    : {
        id: 'architecture.generated_boundary',
        status: 'warning',
        message: 'generated directory exists without generated/README.md'
      };
}

async function checkRepositoryServiceContract(
  repositoryRoot: string
): Promise<DoctorCheck> {
  const serviceContract = await loadRepositoryServiceContract(repositoryRoot);

  return serviceContract === null
    ? {
        id: 'repository.service_yaml',
        status: 'error',
        message: 'repository root is missing service.yaml'
      }
    : {
        id: 'repository.service_yaml',
        status: 'ok',
        message: 'repository root has service.yaml'
      };
}

function summarizeValidation(result: ValidationResult): {
  readonly diagnostics: number;
  readonly errors: number;
  readonly warnings: number;
} {
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  ).length;
  const warnings = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'warning'
  ).length;

  return {
    diagnostics: result.diagnostics.length,
    errors,
    warnings
  };
}

function summarizeStatus(checks: readonly DoctorCheck[]): DoctorStatus {
  if (checks.some((check) => check.status === 'error')) {
    return 'error';
  }

  return checks.some((check) => check.status === 'warning') ? 'warning' : 'ok';
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

async function runGit(
  repositoryRoot: string,
  args: readonly string[]
): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  try {
    const result = await execFileAsync('git', buildHardenedGitArgs(
      repositoryRoot,
      args
    ), {
      encoding: 'utf8',
      maxBuffer: GIT_EXEC_MAX_BUFFER_BYTES,
      timeout: GIT_EXEC_TIMEOUT_MS
    });

    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    if (isExecFileError(error)) {
      return {
        exitCode: typeof error.code === 'number' ? error.code : 1,
        stdout: typeof error.stdout === 'string' ? error.stdout : '',
        stderr: typeof error.stderr === 'string' ? error.stderr : formatError(error)
      };
    }

    throw error;
  }
}

export function buildHardenedGitArgs(
  repositoryRoot: string,
  args: readonly string[]
): readonly string[] {
  return [
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=',
      '-c',
      'credential.helper=',
      '-C',
      repositoryRoot,
      ...args
  ];
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isExecFileError(error: unknown): error is Error & {
  readonly code?: number | string;
  readonly stdout?: unknown;
  readonly stderr?: unknown;
} {
  return error instanceof Error && 'code' in error;
}
