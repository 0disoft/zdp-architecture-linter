import { parse } from 'yaml';

const ARCHITECTURE_LINTER_REPOSITORY = '0disoft/zdp-architecture-linter';
const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

type WorkflowStep = {
  with?: {
    repository?: unknown;
    ref?: unknown;
  };
};

type WorkflowDocument = {
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
};

export function readArchitectureLinterPin(workflowText: string): string {
  const workflow = parse(workflowText) as WorkflowDocument;

  for (const job of Object.values(workflow.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (step.with?.repository !== ARCHITECTURE_LINTER_REPOSITORY) {
        continue;
      }

      const ref = step.with.ref;
      if (typeof ref !== 'string' || !FULL_GIT_SHA.test(ref)) {
        throw new Error('Architecture linter workflow ref must be a full 40-character Git SHA.');
      }

      return ref.toLowerCase();
    }
  }

  throw new Error('Architecture linter checkout step is missing from the validation workflow.');
}

export function assertPinnedLinterHead(pinnedRef: string, linterHead: string): void {
  const normalizedPin = pinnedRef.trim().toLowerCase();
  const normalizedHead = linterHead.trim().toLowerCase();

  if (!FULL_GIT_SHA.test(normalizedPin) || !FULL_GIT_SHA.test(normalizedHead)) {
    throw new Error('Pinned ref and local linter HEAD must both be full Git SHAs.');
  }

  if (normalizedPin !== normalizedHead) {
    throw new Error(
      `Local architecture linter HEAD ${normalizedHead} does not match workflow pin ${normalizedPin}.`,
    );
  }
}
