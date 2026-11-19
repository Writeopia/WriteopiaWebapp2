import { en, type StringKey } from "./strings.en";

export { relativeTime } from "./relativeTime";
export type { StringKey };

type Dictionary = Record<StringKey, string>;

// One language for now. Another one is a new dictionary here and a way to pick it.
const dictionaries: Record<string, Dictionary> = { en };
const currentLocale = "en";

/** The string for [key], with each {name} replaced by the matching entry of [params]. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const template = (dictionaries[currentLocale] ?? en)[key];
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}
