#!/usr/bin/env bun
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadArchitectureCatalogs } from './catalog-loader.ts';
import {
  catalogSchemaPreflightFailed,
  loadArchitectureCatalogSchemaPreflight
} from './catalog-schema-validation.ts';
import { loadArchitectureGraph } from './architecture-graph-loader.ts';
import {
  createArchitectureDoctorReport,
  formatArchitectureDoctorReportText
} from './architecture-doctor-report.ts';
import {
  createArchitectureDiffReport,
  formatArchitectureDiffReportText
} from './architecture-diff-report.ts';
import {
  createArchitecturePackReport,
  formatArchitecturePackReportText
} from './architecture-pack-report.ts';
import {
  createArchitectureNormalizeReport,
  formatArchitectureNormalizeReportText
} from './architecture-normalize-report.ts';
import {
  createArchitectureListReport,
  formatArchitectureListReportText,
  type ArchitectureListKind
} from './architecture-list-report.ts';
import {
  createArchitectureGraphReport,
  formatArchitectureGraphReportText
} from './architecture-graph-report.ts';
import {
  createDiagnosticExplainReport,
  formatDiagnosticExplainReportText
} from './diagnostic-explain-report.ts';
import {
  createContractComplianceReport,
  createContractComplianceFailureReport,
  formatContractComplianceReportText,
  type ContractComplianceReport
} from './contract-compliance-report.ts';
import {
  formatDiagnostic,
  hasErrors,
  type ValidationResult
} from './diagnostics.ts';
import {
  CliFailure,
  createCliErrorReport,
  formatCliFailureText
} from './cli-error-report.ts';
import {
  checkGeneratedArchitectureFile,
  writeGeneratedArchitectureFile
} from './generated-output.ts';
import { loadArchitectureSnapshot } from './git-architecture-snapshot.ts';
import { loadRepositoryServiceContract } from './service-schema-validation.ts';
import { validateArchitecture } from './validation.ts';

type ParsedCommand =
  | ParsedValidateCommand
  | ParsedGraphCommand
  | ParsedExplainCommand
  | ParsedComplianceCommand
  | ParsedPackCommand
  | ParsedCheckSplitCommand
  | ParsedDiffCommand
  | ParsedDoctorCommand
  | ParsedNormalizeCommand
  | ParsedListCommand;

const CLI_USAGE_LINES = [
  'Usage:',
  '  zdp-arch validate --architecture <path> [--repository <path>] [--json]',
  '  zdp-arch graph --architecture <path> [--repository <path>] [--json]',
  '  zdp-arch explain --architecture <path> [--repository <path>] [--json]',
  '  zdp-arch compliance --architecture <path> --repository <path> [--json]',
  '  zdp-arch pack --architecture <path> --repo <repo> --task <task> [--out generated/llm/task-pack.md [--check]] [--json]',
  '  zdp-arch check-split --architecture <path> [--json]',
  '  zdp-arch diff --architecture <path> --base <git-ref> [--head <git-ref|worktree>] [--fail-on-new-error] [--json]',
  '  zdp-arch doctor --architecture <path> [--repository <path>] [--json]',
  '  zdp-arch normalize --architecture <path> [--repository <path>] [--out generated/registry.json [--check]] [--json]',
  '  zdp-arch list repos --architecture <path> [--stage <repo_stage>] [--area <area>] [--agent-review-status <status>] [--json]',
  '  zdp-arch list services --architecture <path> [--repo <repo>] [--json]'
] as const;

const CLI_OPTION_CONFIG = {
  architecture: {
    type: 'string'
  },
  repository: {
    type: 'string'
  },
  json: {
    type: 'boolean'
  },
  repo: {
    type: 'string'
  },
  task: {
    type: 'string'
  },
  out: {
    type: 'string'
  },
  check: {
    type: 'boolean'
  },
  base: {
    type: 'string'
  },
  head: {
    type: 'string'
  },
  'fail-on-new-error': {
    type: 'boolean'
  },
  stage: {
    type: 'string'
  },
  area: {
    type: 'string'
  },
  'agent-review-status': {
    type: 'string'
  }
} as const;

interface ParsedValidateCommand {
  readonly name: 'validate';
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
  readonly json: boolean;
}

interface ParsedGraphCommand {
  readonly name: 'graph';
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
  readonly json: boolean;
}

interface ParsedExplainCommand {
  readonly name: 'explain';
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
  readonly json: boolean;
}

interface ParsedComplianceCommand {
  readonly name: 'compliance';
  readonly architectureRoot: string;
  readonly repositoryRoot: string;
  readonly json: boolean;
}

interface ParsedCheckSplitCommand {
  readonly name: 'check-split';
  readonly architectureRoot: string;
  readonly json: boolean;
}

interface ParsedPackCommand {
  readonly name: 'pack';
  readonly architectureRoot: string;
  readonly repo: string;
  readonly task: string;
  readonly out?: string;
  readonly check: boolean;
  readonly json: boolean;
}

interface ParsedDiffCommand {
  readonly name: 'diff';
  readonly architectureRoot: string;
  readonly base: string;
  readonly head?: string;
  readonly failOnNewError: boolean;
  readonly json: boolean;
}

interface ParsedDoctorCommand {
  readonly name: 'doctor';
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
  readonly json: boolean;
}

interface ParsedNormalizeCommand {
  readonly name: 'normalize';
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
  readonly out?: string;
  readonly check: boolean;
  readonly json: boolean;
}

interface ParsedListCommand {
  readonly name: 'list';
  readonly architectureRoot: string;
  readonly listKind: ArchitectureListKind;
  readonly filters: {
    readonly stage?: string;
    readonly area?: string;
    readonly agentReviewStatus?: string;
    readonly repo?: string;
  };
  readonly json: boolean;
}

/**
 * mf:anchor zdp.architecture-linter.cli-dispatch
 * purpose: Locate the CLI command dispatcher that routes validate, graph, explain, compliance, pack, diff, doctor, normalize, and list flows.
 * search: CLI dispatch, zdp-arch command, validate graph normalize, generated output, command parsing
 * invariant: CLI commands preserve explicit architecture and repository roots before invoking validation or generated-output writes.
 * risk: config, data_consistency
 */
async function main(argv: readonly string[]): Promise<number> {
  const jsonRequested = isJsonRequested(argv);
  const command = parseCommand(argv);

  if (command === null) {
    const failure = new CliFailure({
      code: 'invalid_arguments',
      message: ['Invalid command or arguments.', '', ...CLI_USAGE_LINES].join('\n'),
      publicMessage: 'Invalid command or arguments.',
      details: {
        usage: CLI_USAGE_LINES.slice(1).map((line) => line.trim())
      }
    });
    printCliFailure(failure, jsonRequested);
    return 1;
  }

  try {
    if (command.name === 'graph') {
      const preflight = await loadArchitectureCatalogSchemaPreflight(
        command.architectureRoot
      );

      if (catalogSchemaPreflightFailed(preflight)) {
        printResult(preflight.validation, command.json);
        return 1;
      }

      const graph = await loadArchitectureGraph({
        architectureRoot: command.architectureRoot,
        repositoryRoot: command.repositoryRoot,
        catalogs: preflight.catalogs
      });
      const report = createArchitectureGraphReport(graph);

      if (command.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatArchitectureGraphReportText(report));
      }

      return 0;
    }

    if (command.name === 'explain') {
      const [result, graph] = await Promise.all([
        validateArchitecture({
          architectureRoot: command.architectureRoot,
          repositoryRoot: command.repositoryRoot
        }),
        loadArchitectureGraph({
          architectureRoot: command.architectureRoot,
          repositoryRoot: command.repositoryRoot
        })
      ]);
      const report = createDiagnosticExplainReport({
        validation: result,
        graph
      });

      if (command.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDiagnosticExplainReportText(report));
      }

      return hasErrors(result) ? 1 : 0;
    }

    if (command.name === 'compliance') {
      let report: ContractComplianceReport;
      try {
        const [serviceContract, validation] = await Promise.all([
          loadRepositoryServiceContract(command.repositoryRoot),
          validateArchitecture({
            architectureRoot: command.architectureRoot,
            repositoryRoot: command.repositoryRoot
          })
        ]);
        report = createContractComplianceReport({
          repositoryRoot: command.repositoryRoot,
          serviceContractDeclared: serviceContract !== null,
          validation
        });
      } catch {
        const failure = createContractComplianceFailureReport({
          repositoryRoot: command.repositoryRoot
        });

        if (command.json) {
          console.log(JSON.stringify(failure, null, 2));
        } else {
          console.error(
            'zdp-arch compliance: repository or architecture input is unreadable or invalid'
          );
        }

        return 1;
      }

      if (command.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatContractComplianceReportText(report));
      }

      return report.status === 'failed' ? 1 : 0;
    }

    if (command.name === 'check-split') {
      const result = await validateArchitecture({
        architectureRoot: command.architectureRoot
      });
      const splitResult: ValidationResult = {
        diagnostics: result.diagnostics.filter(
          (diagnostic) => diagnostic.ruleId === 'ZDP-SPLIT-001'
        )
      };

      printResult(splitResult, command.json);

      return hasErrors(splitResult) ? 1 : 0;
    }

    if (command.name === 'pack') {
      const preflight = await loadArchitectureCatalogSchemaPreflight(
        command.architectureRoot
      );

      if (catalogSchemaPreflightFailed(preflight)) {
        printResult(preflight.validation, command.json);
        return 1;
      }

      const graph = await loadArchitectureGraph({
        architectureRoot: command.architectureRoot,
        catalogs: preflight.catalogs
      });
      const report = createArchitecturePackReport({
        graph,
        repo: command.repo,
        task: command.task
      });

      if (command.out !== undefined) {
        const contents = `${formatArchitecturePackReportText(report)}\n`;

        if (command.check) {
          const checkResult = await checkGeneratedArchitectureFile({
            architectureRoot: command.architectureRoot,
            outputPath: command.out,
            contents
          });

          if (!checkResult.matches) {
            const remediation =
              `zdp-arch pack --architecture <path> --repo ${command.repo} ` +
              `--task "${command.task}" --out ${command.out}`;

            throw new CliFailure({
              code: 'generated_output_stale',
              message: `Generated pack is stale: ${checkResult.path}\nRun \`${remediation}\` to regenerate it.`,
              publicMessage: 'Generated pack is stale.',
              details: {
                path: command.out,
                remediation
              }
            });
          }

          if (command.json) {
            console.log(
              JSON.stringify(
                {
                  status: 'up-to-date',
                  path: checkResult.path,
                  bytes: checkResult.bytes
                },
                null,
                2
              )
            );
          } else {
            console.log(`zdp-arch: generated pack is up to date (${checkResult.path})`);
          }

          return 0;
        }

        const writeResult = await writeGeneratedArchitectureFile({
          architectureRoot: command.architectureRoot,
          outputPath: command.out,
          contents
        });

        if (command.json) {
          console.log(
            JSON.stringify(
              {
                status: 'written',
                path: writeResult.path,
                bytes: writeResult.bytes
              },
              null,
              2
            )
          );
        } else {
          console.log(`zdp-arch: wrote ${writeResult.path}`);
        }

        return 0;
      }

      if (command.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatArchitecturePackReportText(report));
      }

      return 0;
    }

    if (command.name === 'diff') {
      const snapshots: Awaited<ReturnType<typeof loadArchitectureSnapshot>>[] = [];

      try {
        const baseSnapshot = await loadArchitectureSnapshot({
          architectureRoot: command.architectureRoot,
          ref: command.base
        });
        snapshots.push(baseSnapshot);

        const headSnapshot = await loadArchitectureSnapshot({
          architectureRoot: command.architectureRoot,
          ref: command.head
        });
        snapshots.push(headSnapshot);

        const [
          baseCatalogs,
          headCatalogs,
          baseValidation,
          headValidation
        ] = await Promise.all([
          loadArchitectureCatalogs(baseSnapshot.root),
          loadArchitectureCatalogs(headSnapshot.root),
          validateArchitecture({
            architectureRoot: baseSnapshot.root
          }),
          validateArchitecture({
            architectureRoot: headSnapshot.root
          })
        ]);
        const report = createArchitectureDiffReport({
          baseCatalogs,
          headCatalogs,
          baseDiagnostics: baseValidation.diagnostics,
          headDiagnostics: headValidation.diagnostics
        });

        if (command.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatArchitectureDiffReportText(report));
        }

        return command.failOnNewError &&
          report.diagnostics.added.some(
            (diagnostic) => diagnostic.severity === 'error'
          )
          ? 1
          : 0;
      } finally {
        await Promise.all(snapshots.map((snapshot) => snapshot.cleanup()));
      }
    }

    if (command.name === 'doctor') {
      const report = await createArchitectureDoctorReport({
        architectureRoot: command.architectureRoot,
        repositoryRoot: command.repositoryRoot
      });

      if (command.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatArchitectureDoctorReportText(report));
      }

      return report.status === 'error' ? 1 : 0;
    }

    if (command.name === 'normalize') {
      const preflight = await loadArchitectureCatalogSchemaPreflight(
        command.architectureRoot
      );

      if (catalogSchemaPreflightFailed(preflight)) {
        printResult(preflight.validation, command.json);
        return 1;
      }

      const [graph, result] = await Promise.all([
        loadArchitectureGraph({
          architectureRoot: command.architectureRoot,
          repositoryRoot: command.repositoryRoot,
          catalogs: preflight.catalogs
        }),
        validateArchitecture({
          architectureRoot: command.architectureRoot,
          repositoryRoot: command.repositoryRoot,
          catalogSchemaPreflight: preflight
        })
      ]);
      const report = createArchitectureNormalizeReport({
        graph,
        validation: result
      });

      if (command.out !== undefined) {
        if (hasErrors(result)) {
          const operation = command.check ? 'check' : 'write';
          const message = command.check
            ? 'Refusing to check generated registry because validation has errors.'
            : 'Refusing to write generated registry because validation has errors.';

          throw new CliFailure({
            code: 'validation_failed',
            message,
            details: {
              operation,
              errorCount: result.diagnostics.filter(
                (diagnostic) => diagnostic.severity === 'error'
              ).length
            }
          });
        }

        const contents = `${JSON.stringify(report, null, 2)}\n`;

        if (command.check) {
          const checkResult = await checkGeneratedArchitectureFile({
            architectureRoot: command.architectureRoot,
            outputPath: command.out,
            contents
          });

          if (!checkResult.matches) {
            const remediation =
              `zdp-arch normalize --architecture <path> --out ${command.out}`;

            throw new CliFailure({
              code: 'generated_output_stale',
              message: `Generated registry is stale: ${checkResult.path}\nRun \`${remediation}\` to regenerate it.`,
              publicMessage: 'Generated registry is stale.',
              details: {
                path: command.out,
                remediation
              }
            });
          }

          if (command.json) {
            console.log(
              JSON.stringify(
                {
                  status: 'up-to-date',
                  path: checkResult.path,
                  bytes: checkResult.bytes
                },
                null,
                2
              )
            );
          } else {
            console.log(`zdp-arch: generated registry is up to date (${checkResult.path})`);
          }

          return 0;
        }

        const writeResult = await writeGeneratedArchitectureFile({
          architectureRoot: command.architectureRoot,
          outputPath: command.out,
          contents
        });

        if (command.json) {
          console.log(
            JSON.stringify(
              {
                status: 'written',
                path: writeResult.path,
                bytes: writeResult.bytes
              },
              null,
              2
            )
          );
        } else {
          console.log(`zdp-arch: wrote ${writeResult.path}`);
        }

        return 0;
      }

      if (command.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatArchitectureNormalizeReportText(report));
      }

      return hasErrors(result) ? 1 : 0;
    }

    if (command.name === 'list') {
      const preflight = await loadArchitectureCatalogSchemaPreflight(
        command.architectureRoot
      );

      if (catalogSchemaPreflightFailed(preflight)) {
        printResult(preflight.validation, command.json);
        return 1;
      }

      const graph = await loadArchitectureGraph({
        architectureRoot: command.architectureRoot,
        catalogs: preflight.catalogs
      });
      const report =
        command.listKind === 'repos'
          ? createArchitectureListReport({
              graph,
              kind: 'repos',
              filters: {
                stage: command.filters.stage,
                area: command.filters.area,
                agentReviewStatus: command.filters.agentReviewStatus
              }
            })
          : createArchitectureListReport({
              graph,
              kind: 'services',
              filters: {
                repo: command.filters.repo
              }
            });

      if (command.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatArchitectureListReportText(report));
      }

      return 0;
    }

    const result = await validateArchitecture({
      architectureRoot: command.architectureRoot,
      repositoryRoot: command.repositoryRoot
    });
    printResult(result, command.json);

    return hasErrors(result) ? 1 : 0;
  } catch (error) {
    printCliFailure(error, command.json);
    return 1;
  }
}

function parseCommand(argv: readonly string[]): ParsedCommand | null {
  const parsed = parseCliArgs(argv);

  if (parsed === null) {
    return null;
  }

  const [commandName, ...positionals] = parsed.positionals;

  if (
    commandName !== 'validate' &&
    commandName !== 'graph' &&
    commandName !== 'explain' &&
    commandName !== 'compliance' &&
    commandName !== 'pack' &&
    commandName !== 'check-split' &&
    commandName !== 'diff' &&
    commandName !== 'doctor' &&
    commandName !== 'normalize' &&
    commandName !== 'list'
  ) {
    return null;
  }

  const architecture = readStringOption(parsed.values.architecture);

  if (architecture === null) {
    return null;
  }

  if (commandName === 'pack') {
    if (positionals.length > 0) {
      return null;
    }

    const repo = readStringOption(parsed.values.repo);
    const task = readStringOption(parsed.values.task);

    if (repo === null || task === null) {
      return null;
    }

    const out = readStringOption(parsed.values.out);
    const check = parsed.values.check === true;

    if (check && out === null) {
      return null;
    }

    return {
      name: 'pack',
      architectureRoot: resolve(architecture),
      repo,
      task,
      out: out ?? undefined,
      check,
      json: parsed.values.json === true
    };
  }

  if (commandName === 'diff') {
    if (positionals.length > 0) {
      return null;
    }

    const base = readStringOption(parsed.values.base);

    if (base === null) {
      return null;
    }

    return {
      name: 'diff',
      architectureRoot: resolve(architecture),
      base,
      head: readStringOption(parsed.values.head) ?? undefined,
      failOnNewError: parsed.values['fail-on-new-error'] === true,
      json: parsed.values.json === true
    };
  }

  if (commandName === 'list') {
    const [listKind, ...extraPositionals] = positionals;

    if (
      extraPositionals.length > 0 ||
      (listKind !== 'repos' && listKind !== 'services')
    ) {
      return null;
    }

    return {
      name: 'list',
      architectureRoot: resolve(architecture),
      listKind,
      filters: {
        stage: readStringOption(parsed.values.stage) ?? undefined,
        area: readStringOption(parsed.values.area) ?? undefined,
        agentReviewStatus:
          readStringOption(parsed.values['agent-review-status']) ?? undefined,
        repo: readStringOption(parsed.values.repo) ?? undefined
      },
      json: parsed.values.json === true
    };
  }

  if (commandName === 'compliance') {
    if (positionals.length > 0) {
      return null;
    }

    const repositoryRoot = readOptionalResolvedPath(parsed.values.repository);
    if (repositoryRoot === undefined) {
      return null;
    }

    return {
      name: 'compliance',
      architectureRoot: resolve(architecture),
      repositoryRoot,
      json: parsed.values.json === true
    };
  }

  if (positionals.length > 0) {
    return null;
  }

  const out = readStringOption(parsed.values.out);
  const check = parsed.values.check === true;

  if (commandName === 'normalize' && check && out === null) {
    return null;
  }

  return {
    name: commandName,
    architectureRoot: resolve(architecture),
    repositoryRoot:
      commandName === 'check-split'
        ? undefined
        : readOptionalResolvedPath(parsed.values.repository),
    out:
      commandName === 'normalize'
        ? out ?? undefined
        : undefined,
    check: commandName === 'normalize' && check,
    json: parsed.values.json === true
  };
}

function parseCliArgs(argv: readonly string[]): {
  readonly values: Record<string, string | boolean | undefined>;
  readonly positionals: readonly string[];
} | null {
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: CLI_OPTION_CONFIG,
      allowPositionals: true,
      strict: true
    });

    return parsed;
  } catch {
    return null;
  }
}

function readStringOption(value: string | boolean | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readOptionalResolvedPath(value: string | boolean | undefined): string | undefined {
  const path = readStringOption(value);
  return path === null ? undefined : resolve(path);
}

function printResult(result: ValidationResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.diagnostics.length === 0) {
    console.log('zdp-arch: validation passed');
    return;
  }

  for (const diagnostic of result.diagnostics) {
    console.log(formatDiagnostic(diagnostic));
  }
}

function isJsonRequested(argv: readonly string[]): boolean {
  return argv.some(
    (argument) => argument === '--json' || argument.startsWith('--json=')
  );
}

function printCliFailure(error: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(createCliErrorReport(error), null, 2));
    return;
  }

  console.error(formatCliFailureText(error));
}

const exitCode = await main(Bun.argv.slice(2));
process.exit(exitCode);
