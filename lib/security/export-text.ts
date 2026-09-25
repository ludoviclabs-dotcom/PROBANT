/** Quote dangerous text, preserve typed numeric values. CSV quoting alone is insufficient. */
export function neutralizeSpreadsheetText(value: string): string {
  const first = Array.from(value).find((character) => character.charCodeAt(0) > 31 && !/\s/u.test(character));
  return first && "=+-@".includes(first) ? `'${value}` : value;
}
