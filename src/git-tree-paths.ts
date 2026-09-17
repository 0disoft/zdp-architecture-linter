export function parseGitTreePaths(output: Buffer): readonly string[] {
  if (output.length === 0) return [];
  if (output[output.length - 1] !== 0) throw new Error('Git tree path output must be NUL terminated.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const paths: string[] = [];
  let start = 0;
  while (start < output.length) {
    const end = output.indexOf(0, start);
    if (end === start || end < 0) throw new Error('Git tree output contains an empty or unterminated path.');
    paths.push(decoder.decode(output.subarray(start, end)));
    start = end + 1;
  }
  return paths;
}
