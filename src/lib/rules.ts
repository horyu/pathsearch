import { minimatch } from 'minimatch';
import type { RuleConfig } from './types';

function matchesWorkspace(rule: RuleConfig, workspaceName?: string): boolean {
  const matchWorkspace = rule.matchWorkspace;
  if (!matchWorkspace) {
    return true;
  }
  if (!workspaceName) {
    return false;
  }
  if (typeof matchWorkspace === 'string') {
    return matchWorkspace === workspaceName;
  }
  if (Array.isArray(matchWorkspace)) {
    return matchWorkspace.includes(workspaceName);
  }
  if (matchWorkspace.type === 'glob') {
    return matchWorkspace.values.some(value => minimatch(workspaceName, value));
  }
  if (matchWorkspace.type === 'regex') {
    return matchWorkspace.values.some(value => {
      try {
        return new RegExp(value).test(workspaceName);
      } catch {
        return false;
      }
    });
  }
  return false;
}

export function getMatchingRules(rules: RuleConfig[], relativePath: string, workspaceName?: string): RuleConfig[] {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  return rules.filter(rule => {
    if (!rule.match) {
      return false;
    }
    if (!matchesWorkspace(rule, workspaceName)) {
      return false;
    }
    return minimatch(normalizedPath, rule.match);
  });
}
