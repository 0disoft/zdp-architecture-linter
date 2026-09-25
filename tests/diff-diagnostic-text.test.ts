import { describe, expect, test } from 'bun:test';
import { formatArchitectureDiffReportText, type ArchitectureDiffReport } from '../src/architecture-diff-report.ts';
const empty = { added: [], removed: [], changed: [] };
const report: ArchitectureDiffReport = {
  changes: { repositories: empty, services: empty, datastores: empty, events: empty },
  diagnostics: {
    added: [
      { ruleId: 'ZDP-WARN', severity: 'warning', file: 'catalogs/services.yaml', path: 'services[0:example].owner', message: 'Set an owner.' },
      { ruleId: 'ZDP-FAIL', severity: 'error', file: 'rules/tier.rules.yaml', path: 'state_transition_evidence', message: 'Restore evidence.\nSecond line.' }
    ], resolved: []
  }, riskNotes: []
};

describe('actionable diff text', () => {
  test('prints complete error details before warnings and catalog summaries', () => {
    const before = JSON.stringify(report);
    const text = formatArchitectureDiffReportText(report);
    expect(text).toContain('[error] ZDP-FAIL rules/tier.rules.yaml state_transition_evidence Restore evidence.\\nSecond line.');
    expect(text.indexOf('[error]')).toBeLessThan(text.indexOf('[warning]'));
    expect(text.indexOf('[error]')).toBeLessThan(text.indexOf('## repositories'));
    expect(text).toContain('- added: 2');
    expect(JSON.stringify(report)).toBe(before);
  });
  test('states when no new diagnostics exist while retaining resolved count', () => {
    const text = formatArchitectureDiffReportText({ ...report, diagnostics: { added: [], resolved: report.diagnostics.added } });
    expect(text).toContain('No new diagnostics.');
    expect(text).toContain('- resolved: 2');
  });
});
