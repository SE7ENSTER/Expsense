import { formatReportDate } from "./report-dates.js";
export const REPORT_TIME_ZONE = "Asia/Bangkok";
export const REPORT_TIME_LABEL = "Bangkok (UTC+7)";
export const REPORT_EVENTS = [
  ["submittedAt", "Latest submitted"],
  ["managerApprovedAt", "Manager approved"],
  ["financeApprovedAt", "Finance reviewed / processing"],
  ["reimbursedAt", "Reimbursed"],
  ["closedAt", "Closed"],
];
export function timestampDate(value) {
  if (value == null) return null;
  let milliseconds;
  if (typeof value.toMillis === "function") milliseconds = value.toMillis();
  else if (value instanceof Date) milliseconds = value.getTime();
  else if (typeof value === "object" && Number.isFinite(value.seconds))
    milliseconds = value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
  else if (typeof value === "number") milliseconds = value;
  else if (typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    milliseconds = Date.parse(value);
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date : null;
}
function timestampParts(value) {
  const date = timestampDate(value);
  if (!date) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: REPORT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}
export function timestampMonth(value) {
  const parts = timestampParts(value);
  return parts ? parts.year + "-" + parts.month : "";
}
export function formatReportTimestamp(value) {
  const parts = timestampParts(value);
  return parts
    ? formatReportDate(parts.year + "-" + parts.month + "-" + parts.day) +
        ", " +
        parts.hour +
        ":" +
        parts.minute
    : "Not recorded";
}
export function reportEventTime(report, event) {
  if (!REPORT_EVENTS.some(([key]) => key === event)) return null;
  if (timestampDate(report[event])) return report[event];
  // Recover a legacy action only when its recorded action identifies that stage.
  // updatedAt/createdAt cannot establish a submission or approval time.
  if (event === "managerApprovedAt" && report.managerStatus === "Approved")
    return timestampDate(report.managerActionAt)
      ? report.managerActionAt
      : null;
  if (event === "reimbursedAt" && report.financeStatus === "Reimbursed")
    return timestampDate(report.financeActionAt)
      ? report.financeActionAt
      : null;
  if (event === "closedAt" && report.financeStatus === "Closed")
    return timestampDate(report.financeActionAt)
      ? report.financeActionAt
      : null;
  return null;
}
