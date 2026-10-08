export function buildHardenedGitArgs(
  repositoryRoot: string,
  args: readonly string[]
): readonly string[] {
  return [
    '--no-replace-objects',
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
