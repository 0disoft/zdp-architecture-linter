#!/usr/bin/env bun
import { resolve } from 'node:path';
import { loadArchitectureCatalogs } from './catalog-loader.ts';
import { loadArchitectureGraph } from './architecture-graph-loader.ts';
import {
  createArchitectureDiffReport,
  formatArchitectureDiffReportText
} from './architecture-diff-report.ts';
import {
  createArchitecturePackReport,
  formatArchitecturePackReportText
} from './architecture-pack-report.ts';
import {
  createArchitectureGraphReport,
  formatArchitectureGraphReportText
} from './architecture-graph-report.ts';
import {
  createDiagnosticExplainReport,
  formatDiagnosticExplainReportText
} from './diagnostic-explain-report.ts';
import {
  formatDiagnostic,
  hasErrors,
  type ValidationResult
} from './diagnostics.ts';
import { loadArchitectureSnapshot } from './git-architecture-snapshot.ts';
import { validateArchitecture } from './validation.ts';

type ParsedCommand =
  | ParsedValidateCommand
  | ParsedGraphCommand
  | ParsedExplainCommand
  | ParsedPackCommand
  | ParsedCheckSplitCommand
  | ParsedDiffCommand;

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
  readonly json: boolean;
}

interface ParsedDiffCommand {
  readonly name: 'diff';
  readonly architectureRoot: string;
  readonly base: string;
  readonly head?: string;
  readonly json: boolean;
}

async function main(argv: readonly string[]): Promise<number> {
  const command = parseCommand(argv);

  if (command === null) {
    printUsage();
    return 2;
  }

  try {
    if (command.name === 'graph') {
      const graph = await loadArchitectureGraph({
        architectureRoot: command.architectureRoot,
        repositoryRoot: command.repositoryRoot
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
      const graph = await loadArchitectureGraph({
        architectureRoot: command.architectureRoot
      });
      const report = createArchitecturePackReport({
        graph,
        repo: command.repo,
        task: command.task
      });

      if (command.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatArchitecturePackReportText(report));
      }

      return 0;
    }

    if (command.name === 'diff') {
      const baseSnapshot = await loadArchitectureSnapshot({
        architectureRoot: command.architectureRoot,
        ref: command.base
      });
      const headSnapshot = await loadArchitectureSnapshot({
        architectureRoot: command.architectureRoot,
        ref: command.head
      });

      try {
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

        return 0;
      } finally {
        await Promise.all([baseSnapshot.cleanup(), headSnapshot.cleanup()]);
      }
    }

    const result = await validateArchitecture({
      architectureRoot: command.architectureRoot,
      repositoryRoot: command.repositoryRoot
    });
    printResult(result, command.json);

    return hasErrors(result) ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function parseCommand(argv: readonly string[]): ParsedCommand | null {
  const [commandName, ...rest] = argv;

  if (
    commandName !== 'validate' &&
    commandName !== 'graph' &&
    commandName !== 'explain' &&
    commandName !== 'pack' &&
    commandName !== 'check-split' &&
    commandName !== 'diff'
  ) {
    return null;
  }

  const architecture = readOption(rest, '--architecture');

  if (architecture === null) {
    return null;
  }

  if (commandName === 'pack') {
    const repo = readOption(rest, '--repo');
    const task = readOption(rest, '--task');

    if (repo === null || task === null) {
      return null;
    }

    return {
      name: 'pack',
      architectureRoot: resolve(architecture),
      repo,
      task,
      json: rest.includes('--json')
    };
  }

  if (commandName === 'diff') {
    const base = readOption(rest, '--base');

    if (base === null) {
      return null;
    }

    return {
      name: 'diff',
      architectureRoot: resolve(architecture),
      base,
      head: readOption(rest, '--head') ?? undefined,
      json: rest.includes('--json')
    };
  }

  return {
    name: commandName,
    architectureRoot: resolve(architecture),
    repositoryRoot:
      commandName === 'check-split'
        ? undefined
        : readOptionalResolvedPath(rest, '--repository'),
    json: rest.includes('--json')
  };
}

function readOption(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);

  if (index === -1) {
    return null;
  }

  const value = args[index + 1];

  return value === undefined || value.startsWith('--') ? null : value;
}

function readOptionalResolvedPath(args: readonly string[], name: string): string | undefined {
  const value = readOption(args, name);

  return value === null ? undefined : resolve(value);
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

function printUsage(): void {
  console.error(
    [
      'Usage:',
      '  zdp-arch validate --architecture <path> [--repository <path>] [--json]',
      '  zdp-arch graph --architecture <path> [--repository <path>] [--json]',
      '  zdp-arch explain --architecture <path> [--repository <path>] [--json]',
      '  zdp-arch pack --architecture <path> --repo <repo> --task <task> [--json]',
      '  zdp-arch check-split --architecture <path> [--json]',
      '  zdp-arch diff --architecture <path> --base <git-ref> [--head <git-ref|worktree>] [--json]'
    ].join('\n')
  );
}

const exitCode = await main(Bun.argv.slice(2));
process.exit(exitCode);
