export interface TransformConfig {
  extractFrom: string;
  searchFor: string;
  searchAsRegex?: boolean;
  searchScope?: string | string[];
  filePattern?: string | string[];
}

export type RelativeMatchTarget = 'parentDir' | 'fileName' | 'fileStem';

export interface RelativeSearchConfig {
  matchTarget: RelativeMatchTarget;
  maxDepth?: number;
  searchScope?: string | string[];
  filePattern?: string | string[];
}

export interface RuleConfig {
  name: string;
  match: string;
  maxResults?: number;
  matchWorkspace?: string | string[] | { type: 'glob' | 'regex'; values: string[] };
  transforms?: TransformConfig[];
  relative?: RelativeSearchConfig;
}
