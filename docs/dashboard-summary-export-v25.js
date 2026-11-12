import { on } from "./app-events.js";
let me = null,
  exportReports = [];
const $ = (id) => document.getElementById(id);
const money = (n) =>
  "HKD " +
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
function fiscal(d) {
  const x = d ? new Date(d) : new Date();
  return "FY" + (x.getMonth() >= 10 ? x.getFullYear() + 1 : x.getFullYear());
}
function reportFy(r) {
  return r.fiscalYear || fiscal(r.meta?.fromDate);
}
function total(r) {
  return +(
    r.totalHkd ||
    (r.items || []).reduce((s, i) => s + (+i.amount || 0) * (+i.fx || 0), 0)
  );
}
function receiptCount(r) {
  return (r.items || []).filter(
    (i) => i.receiptData || i.receiptFileData || i.receiptName,
  ).length;
}
function nextStep(status) {
  return (
    {
      Draft: "Please complete and submit",
      Submitted: "Waiting for Manager review",
      "Manager Approved": "Waiting for Finance processing",
      "Finance Processing": "Finance is processing reimbursement",
      "Reimbursement Processing": "Finance is processing reimbursement",
      Reimbursed: "Completed / reimbursed",
      Closed: "Completed / closed",
      Rejected: "Rejected - review manager comment",
      "Revision Requested": "Revision required",
    }[status || "Draft"] || "Waiting for next action"
  );
}
function selectedFy() {
  return $("phase1FyFilter")?.value || fiscal();
}
function rowsForExport() {
  const fy = selectedFy();
  return exportReports
    .filter((r) => reportFy(r) === fy)
    .sort((a, b) => (a.reportNo || "").localeCompare(b.reportNo || ""))
    .map((r) => {
      const m = r.meta || {};
      return {
        "Report No.": r.reportNo || r.runNumber || r.id,
        "Fiscal Year": reportFy(r),
        Status: r.status || "Draft",
        Employee: m.employee || "",
        "User Email": r.userEmail || "",
        Purpose: m.purpose || "",
        Destination: m.destination || "",
        From: m.fromDate || "",
        To: m.toDate || "",
        "Total HKD": Number(total(r).toFixed(2)),
        Receipts: receiptCount(r),
        "Next Step": nextStep(r.status),
      };
    });
}
function summary(rows) {
  return {
    count: rows.length,
    pending: rows.filter((r) => r.Status === "Submitted").length,
    approved: rows.filter((r) => r.Status === "Manager Approved").length,
    processing: rows.filter((r) =>
      ["Finance Processing", "Reimbursement Processing"].includes(r.Status),
    ).length,
    reimbursed: rows.filter((r) => ["Reimbursed", "Closed"].includes(r.Status))
      .length,
    total: rows.reduce((s, r) => s + (+r["Total HKD"] || 0), 0),
    receipts: rows.reduce((s, r) => s + (+r.Receipts || 0), 0),
  };
}
function injectButtons() {
  const row = document.querySelector("#phase1ReportSummary .summary-title-row");
  if (!row || row.querySelector(".summary-export-actions")) return;
  const wrap = document.createElement("div");
  wrap.className = "summary-export-actions";
  wrap.innerHTML =
    '<button class="export-pdf" type="button" id="exportSummaryPdfBtn">Export PDF</button><button class="export-excel" type="button" id="exportSummaryExcelBtn">Export Excel</button>';
  row.appendChild(wrap);
  $("exportSummaryPdfBtn").onclick = exportSummaryPdf;
  $("exportSummaryExcelBtn").onclick = exportSummaryExcel;
}
async function ensureData() {
  const rows = rowsForExport();
  if (!rows.length) {
    alert("No report data available for selected Fiscal Year.");
    return null;
  }
  return rows;
}
async function exportSummaryPdf() {
  const rows = await ensureData();
  if (!rows) return;
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert("PDF library is not loaded.");
    return;
  }
  const fy = selectedFy(),
    s = summary(rows),
    pdf = new jsPDF("l", "mm", "a4");
  let y = 14;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("EXPENSiO | Expense Report Summary", 14, y);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Fiscal Year: ${fy}`, 14, y + 8);
  pdf.text(`Generated for: ${me?.email || ""}`, 14, y + 14);
  y = 36;
  const cards = [
    ["Total Reports", s.count],
    ["Pending Manager", s.pending],
    ["Manager Approved", s.approved],
    ["Processing", s.processing],
    ["Reimbursed", s.reimbursed],
    ["Total Claimed", money(s.total)],
  ];
  cards.forEach((c, i) => {
    const x = 14 + i * 45;
    pdf.setFillColor(244, 247, 251);
    pdf.roundedRect(x, y, 40, 20, 3, 3, "F");
    pdf.setFontSize(8);
    pdf.setTextColor(90, 105, 130);
    pdf.text(String(c[0]), x + 3, y + 7);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text(String(c[1]), x + 3, y + 15);
    pdf.setFont("helvetica", "normal");
  });
  y = 66;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  const headers = [
    "Report No.",
    "Status",
    "Employee",
    "Purpose",
    "Total HKD",
    "Receipts",
    "Next Step",
  ];
  const xs = [14, 50, 82, 124, 190, 220, 242];
  headers.forEach((h, i) => pdf.text(h, xs[i], y));
  pdf.setFont("helvetica", "normal");
  y += 7;
  rows.forEach((r) => {
    if (y > 190) {
      pdf.addPage();
      y = 16;
      pdf.setFont("helvetica", "bold");
      headers.forEach((h, i) => pdf.text(h, xs[i], y));
      pdf.setFont("helvetica", "normal");
      y += 7;
    }
    pdf.text(String(r["Report No."]).slice(0, 18), xs[0], y);
    pdf.text(String(r.Status).slice(0, 18), xs[1], y);
    pdf.text(String(r.Employee || r["User Email"]).slice(0, 18), xs[2], y);
    pdf.text(String(r.Purpose || "-").slice(0, 34), xs[3], y);
    pdf.text(Number(r["Total HKD"] || 0).toFixed(2), xs[4], y);
    pdf.text(String(r.Receipts), xs[5], y);
    pdf.text(String(r["Next Step"]).slice(0, 34), xs[6], y);
    y += 7;
  });
  pdf.save(`EXPENSiO-Summary-${fy}.pdf`);
}
async function exportSummaryExcel() {
  const rows = await ensureData();
  if (!rows) return;
  const fy = selectedFy(),
    s = summary(rows);
  if (window.XLSX) {
    const wb = window.XLSX.utils.book_new();
    const summaryRows = [
      ["EXPENSiO | Expense Report Summary"],
      ["Fiscal Year", fy],
      ["Generated For", me?.email || ""],
      [],
      ["Metric", "Value"],
      ["Total Reports", s.count],
      ["Pending Manager", s.pending],
      ["Manager Approved", s.approved],
      ["Processing", s.processing],
      ["Reimbursed", s.reimbursed],
      ["Total Claimed HKD", s.total],
      ["Receipts", s.receipts],
    ];
    const ws1 = window.XLSX.utils.aoa_to_sheet(summaryRows);
    const ws2 = window.XLSX.utils.json_to_sheet(rows);
    window.XLSX.utils.book_append_sheet(wb, ws1, "Summary");
    window.XLSX.utils.book_append_sheet(wb, ws2, "Reports");
    window.XLSX.writeFile(wb, `EXPENSiO-Summary-${fy}.xlsx`);
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(",")]
    .concat(
      rows.map((r) =>
        headers
          .map((h) => '"' + String(r[h] ?? "").replaceAll('"', '""') + '"')
          .join(","),
      ),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `EXPENSiO-Summary-${fy}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

on("session", (data) => {
  me = data.user;
  exportReports = [];
});
on("reports-loaded", (data) => {
  exportReports = data.reports;
});
on("summary-rendered", injectButtons);
