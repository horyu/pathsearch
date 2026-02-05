import type { TransformConfig } from './types';

export function transformPath(config: TransformConfig, relativeFilePath: string): string | null {
  const targetText = relativeFilePath.replace(/\\/g, '/');
  const regex = new RegExp(config.extractFrom);
  const match = targetText.match(regex);

  if (!match) {
    if (config.allowNoMatch) {
      return null;
    }
    throw new Error(`Pattern "${config.extractFrom}" did not match "${targetText}"`);
  }

  const result = config.searchFor.replace(/\$(\d+)/g, (_, index) => match[Number(index)] || '');
  return result;
}
