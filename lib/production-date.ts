const wibDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});

export function dateInWib(date: Date = new Date()): string {
  return wibDate.format(date);
}

/** ISO timestamps without an offset come from the plant's local WIB calendar. */
export function productionInstant(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T00:00:00+07:00`);
  const iso = value.replace(" ", "T");
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}+07:00`);
}

export function overlapsProductionDate(start: string, end: string, date: string): boolean {
  const midnight = productionInstant(date);
  const dayEnd = midnight + 24 * 60 * 60 * 1000;
  const from = productionInstant(start), to = productionInstant(end);
  return from < dayEnd && to > midnight && to > from;
}

export function completedOnProductionDate(value: string, date: string): boolean {
  const instant = productionInstant(value);
  const midnight = productionInstant(date);
  return instant >= midnight && instant < midnight + 24 * 60 * 60 * 1000;
}
