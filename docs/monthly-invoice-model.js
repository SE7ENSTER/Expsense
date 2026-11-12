export const CURRENCIES = {
  HKD: "Hong Kong Dollars",
  USD: "US Dollars",
  CAD: "Canadian Dollars",
  CNY: "Chinese Yuan",
  EUR: "Euros",
  GBP: "British Pounds",
  SGD: "Singapore Dollars",
  THB: "Thai Baht",
  VND: "Vietnamese Dong",
  IDR: "Indonesian Rupiah",
  MYR: "Malaysian Ringgit",
  JPY: "Japanese Yen",
  KRW: "Korean Won",
  AUD: "Australian Dollars",
  PKR: "Pakistani Rupees",
  BRL: "Brazilian Reais",
  MXN: "Mexican Pesos",
  PHP: "Philippine Pesos",
  AED: "UAE Dirhams",
  TRY: "Turkish Lira",
};
export const TERMS = {
  "Upon receipt": 0,
  "7 days": 7,
  "14 days": 14,
  "30 days": 30,
};
export const DECLARATION =
  "I confirm that the amounts invoiced above are accurate, relate to services or expenses for Suisseland Group, and have not been invoiced before. Supporting receipts for any reimbursement are attached.";
export const BILL_TO = [
  "Suisseland Group Hong Kong Limited",
  "29/F – 31/F The Gateway Tower 5, 15 Canton Road, Tsim Sha Tsui, Hong Kong",
  "Attn: Finance Department",
];
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const money = (minor) =>
  (minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function minorUnits(value) {
  const text = String(value).trim();
  if (!text) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw Error(
      "Amounts must be positive numbers with no more than two decimals.",
    );
  const [whole, fraction = ""] = text.split("."),
    number = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(number) || number > 99999999999)
    throw Error("Amount is too large.");
  return number;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    Number(value.slice(0, 4)) >= 2000 &&
    Number(value.slice(0, 4)) <= 2099
  );
}
export function dueDate(invoiceDate, terms) {
  if (!validDate(invoiceDate) || !(terms in TERMS)) return "";
  const date = new Date(invoiceDate + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + TERMS[terms]);
  return date.toISOString().slice(0, 10);
}
export function invoiceNumber(data) {
  return data.from.fullName.trim() && validDate(data.invoiceDate)
    ? data.from.fullName.replace(/ /g, "").slice(0, 4).toUpperCase() +
        "-" +
        data.invoiceDate.slice(0, 7).replace("-", "")
    : "Auto";
}
const small = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ],
  tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
function words(number) {
  if (number < 20) return small[number];
  if (number < 100)
    return (
      tens[Math.floor(number / 10)] +
      (number % 10 ? " " + small[number % 10] : "")
    );
  if (number < 1000)
    return (
      small[Math.floor(number / 100)] +
      " Hundred" +
      (number % 100 ? " " + words(number % 100) : "")
    );
  for (const [size, name] of [
    [1000000000, "Billion"],
    [1000000, "Million"],
    [1000, "Thousand"],
  ])
    if (number >= size)
      return (
        words(Math.floor(number / size)) +
        " " +
        name +
        (number % size ? " " + words(number % size) : "")
      );
}
export function amountWords(total, currency) {
  return total > 0
    ? (CURRENCIES[currency] || currency) +
        " " +
        words(Math.floor(total / 100)) +
        (total % 100 ? " and " + words(total % 100) + " Cents" : "") +
        " Only"
    : "";
}
export function blankInvoice(user, profile, month, today) {
  return {
    schemaVersion: 1,
    declaration: DECLARATION,
    userId: user.uid,
    userEmail: user.email,
    serviceMonth: month,
    invoiceDate: today,
    currency: "HKD",
    paymentTerms: "14 days",
    from: {
      fullName:
        [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
        profile.displayName ||
        "",
      address1: "",
      address2: "",
      country: "",
      phone: "",
      email: user.email || "",
    },
    payment: {
      accountName: "",
      bankName: "",
      accountNumber: "",
      swift: "",
      bankCode: "",
      bankAddress: "",
    },
    items: Array.from({ length: 10 }, (_, i) => ({
      description:
        i === 0
          ? "Consultancy fee"
          : i === 1
            ? "Reimbursement (see attached form)"
            : "",
      reference: "",
      amountMinor: 0,
    })),
    totalMinor: 0,
    status: "Draft",
    signature: "",
    signatureName: "",
    consent: false,
    supportingDocument: null,
  };
}
export function validateInvoice(data, submitted = false) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(data.serviceMonth))
    throw Error("Choose a service month.");
  if (!validDate(data.invoiceDate)) throw Error("Enter a valid invoice date.");
  if (!(data.currency in CURRENCIES) || !(data.paymentTerms in TERMS))
    throw Error("Choose currency and payment terms.");
  if (!Array.isArray(data.items) || data.items.length !== 10)
    throw Error("The invoice supports ten lines.");
  let total = 0;
  for (const item of data.items) {
    if (!Number.isSafeInteger(item.amountMinor) || item.amountMinor < 0)
      throw Error("Enter a valid amount.");
    total += item.amountMinor;
    if (submitted && item.amountMinor > 0 && !item.description.trim())
      throw Error("Every amount needs a description.");
  }
  if (total !== data.totalMinor || total > 99999999999)
    throw Error("Please check the total.");
  if (submitted) {
    for (const [key, label] of [
      ["fullName", "Full name"],
      ["address1", "Address line 1"],
      ["country", "Country"],
      ["email", "Email"],
    ])
      if (!data.from[key]?.trim()) throw Error(label + " is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.from.email))
      throw Error("Enter a valid email address.");
    for (const [key, label] of [
      ["accountName", "Account name"],
      ["bankName", "Bank name"],
      ["accountNumber", "Account no. / IBAN"],
      ["swift", "SWIFT / BIC"],
    ])
      if (!data.payment[key]?.trim()) throw Error(label + " is required.");
    if (total <= 0) throw Error("Enter at least one amount.");
    if (
      !data.consent ||
      !data.signatureName.trim() ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.signature) ||
      data.signature.length > 100000
    )
      throw Error(
        "Confirm the declaration, enter your name and sign before submitting.",
      );
    if (
      data.items.some(
        (i) =>
          i.description.toLowerCase().includes("reimbursement") &&
          i.amountMinor > 0,
      ) &&
      !data.supportingDocument
    )
      throw Error(
        "Attach the supporting expense form or receipts for reimbursement.",
      );
  }
  return data;
}
