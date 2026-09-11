/** Stored text limits count Unicode code points, as JSON Schema does. */
export const unicodeLength = (text: string): number => [...text].length;
export const clipCodePoints = (text: string, limit: number): string => [...text].slice(0, limit).join("");

/** Display shortening keeps combining marks and joined emoji with their base. */
export function graphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(part => part.segment);
}

export const hasUnpairedSurrogate = (text: string): boolean => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
