import {
  doc,
  getDoc,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function runNumberedTransaction(db, operation) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let allocation = null;
    try {
      return await runTransaction(db, (transaction) =>
        operation(transaction, (value) => {
          allocation = value;
        }),
      );
    } catch (error) {
      // Rules can reject an optimistic counter write before the SDK reports a
      // transaction conflict. Retry only if that exact counter actually advanced.
      if (
        !allocation ||
        attempt === 4 ||
        !["permission-denied", "aborted"].includes(error.code)
      )
        throw error;
      let latest;
      try {
        latest = await getDoc(allocation.counterRef);
      } catch {
        throw error;
      }
      if (
        !latest.exists() ||
        latest.data().lastNumber === allocation.previousNumber
      )
        throw error;
    }
  }
}

export function numberingYear(report) {
  if (/^FY\d{4}$/.test(report.numberingYear || "")) return report.numberingYear;
  if (/^FY\d{4}$/.test(report.fiscalYear || "")) return report.fiscalYear;
  const date = report.meta?.fromDate
    ? new Date(report.meta.fromDate + "T00:00:00Z")
    : new Date(
        report.createdAt?.seconds
          ? report.createdAt.seconds * 1000
          : Date.now(),
      );
  if (!Number.isFinite(date.getTime()))
    throw Error("Cannot determine the report fiscal year.");
  return (
    "FY" +
    (date.getUTCMonth() >= 10
      ? date.getUTCFullYear() + 1
      : date.getUTCFullYear())
  );
}

// Allocate in the same transaction as the report write. EXP is a new namespace;
// existing ER report numbers are retained and are never reset or renumbered.
export async function reserveReportNumber(
  transaction,
  db,
  id,
  year,
  timestamp,
) {
  const counterRef = doc(db, "reportCounters", year);
  const snapshot = await transaction.get(counterRef);
  const last = snapshot.exists() ? snapshot.data().lastNumber : 0;
  if (!Number.isSafeInteger(last) || last < 0 || last >= 999999999)
    throw Error("Report numbering counter needs administrator review.");
  const next = last + 1;
  const number = "EXP-" + year + "-" + String(next).padStart(6, "0");
  return {
    previousNumber: last,
    counterRef,
    counter: { lastNumber: next, lastReportId: id, updatedAt: timestamp },
    fields: { reportNo: number, runNumber: number, numberingYear: year },
  };
}
