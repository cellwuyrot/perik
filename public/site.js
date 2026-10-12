export function rotationIndex(site, date = new Date()) {
  if (!site?.cards?.length) return -1;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: site.timeZone || "Europe/Moscow", year:"numeric", month:"2-digit", day:"2-digit" }).format(date);
  const elapsed = Math.floor((Date.parse(day + "T00:00:00Z") - Date.parse(site.startDate + "T00:00:00Z")) / 86400000);
  return ((Math.max(0, elapsed) % site.cards.length) + site.cards.length) % site.cards.length;
}
