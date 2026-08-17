import enCopy from "@/locales/en/engraving.json";
import esCopy from "@/locales/es/engraving.json";

type CopyKey = keyof typeof enCopy;
export type EngravingCopyValues = Record<string, string | number>;
export type EngravingLocale = "en" | "es";

const LOCALE_KEY = "pgs-engraving-locale";
const copyByLocale: Record<EngravingLocale, Partial<Record<CopyKey, string>>> = {
  en: enCopy,
  es: esCopy,
};

export function normalizeEngravingLocale(locale: string | null | undefined): EngravingLocale | null {
  if (locale === "en" || locale === "es") return locale;
  return null;
}

export function getEngravingLocale(): EngravingLocale {
  if (typeof window === "undefined") return "en";
  return normalizeEngravingLocale(localStorage.getItem(LOCALE_KEY)) ?? "en";
}

export function saveEngravingLocale(locale: EngravingLocale) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_KEY, locale);
}

export function engravingT(
  key: string,
  values: EngravingCopyValues = {},
  locale: EngravingLocale = getEngravingLocale()
) {
  const copy = copyByLocale[locale];
  const pluralKey =
    typeof values.count === "number"
      ? (`${key}_${values.count === 1 ? "one" : "other"}` as CopyKey)
      : null;

  const template =
    (pluralKey ? copy[pluralKey] : undefined) ??
    copy[key as CopyKey] ??
    enCopy[key as CopyKey] ??
    key;

  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
    template
  );
}
