// Small formatting helpers used across the frontend.

export function toTitleCase(s) {
  if (!s) return "";
  return s.toString().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function paperLabel(subject, topic) {
  const sub = subject ? toTitleCase(subject) : "";
  const top = topic ? ` · ${toTitleCase(topic)}` : "";
  return `${sub}${top}`.trim();
}

export function formatShort(utcDateString) {
  if (!utcDateString) return "";
  try {
    const d = new Date(utcDateString);
    const opts = { timeZone: "Asia/Kolkata" };
    const day = d.toLocaleString("en-IN", { day: "numeric", ...opts });
    const month = d.toLocaleString("en-IN", { month: "numeric", ...opts });
    const time = d.toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, ...opts });
    // remove am/pm text for shorter header but keep hour:minute
    return `${day}-${month}: ${time.replace(/\s?AM|\s?PM|\s?am|\s?pm/g, "")}`;
  } catch (e) {
    return "";
  }
}

export function formatTo12HourIST(utcDateString) {
  if (!utcDateString) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(utcDateString));
}
