#!/usr/bin/env bun
import { resolve } from 'node:path';
import {
  formatDiagnostic,
  hasErrors,
  type ValidationResult
} from './diagnostics.ts';
import { validateArchitecture } from './validation.ts';

interface ParsedCommand {
  readonly name: 'validate';
  readonly architectureRoot: string;
  readonly json: boolean;
}

async function main(argv: readonly string[]): Promise<number> {
  const command = parseCommand(argv);

  if (command === null) {
    printUsage();
    return 2;
  }

  try {
    const result = await validateArchitecture({
      architectureRoot: command.architectureRoot
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

  if (commandName !== 'validate') {
    return null;
  }

  const architecture = readOption(rest, '--architecture');

  if (architecture === null) {
    return null;
  }

  return {
    name: 'validate',
    architectureRoot: resolve(architecture),
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
  console.error('Usage: zdp-arch validate --architecture <path> [--json]');
}

const exitCode = await main(Bun.argv.slice(2));
process.exit(exitCode);

