// Small display-only formatting helpers. Never mutate stored data - these
// only affect how something is shown.

// "priya sharma" -> "Priya Sharma" - applied wherever a teacher/student
// name is displayed, regardless of how they typed it at registration.
export function toTitleCase(str) {
  if (!str) return str;
  return str
    .toString()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep, letter) => sep + letter.toUpperCase());
}

// "1-8/12:45" style - day-month (no leading zero on the day) / 24h time.
export function formatShort(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}/${hh}:${mm}`;
}

// "Python" + "List" -> "Python - List", used everywhere a paper is listed.
export function paperLabel(subject, topic) {
  return topic ? `${subject} - ${topic}` : subject;
}
