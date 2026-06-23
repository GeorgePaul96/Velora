// Display formatters. Money is stored as integer pence; time is UTC ISO and only
// converted to Europe/London here, at the display boundary. See CLAUDE.md conventions.

export const formatGBP = (pence: number | null) => {
  if (pence === null) return "£0.00";
  return "£" + (pence / 100).toFixed(2);
};

export const formatLondonTime = (isoString: string | null) => {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};
