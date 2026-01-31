import { minimatch } from 'minimatch';
import type { RuleConfig } from './types';

export function getMatchingRules(rules: RuleConfig[], relativePath: string): RuleConfig[] {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  return rules.filter(rule => {
    if (!rule.match) {
      return false;
    }
    return minimatch(normalizedPath, rule.match);
  });
}
