import XLSX from "xlsx";

export type CsvCardRow = {
  serialNumber: string;
  voucherCode: string;
  amount: number;
};

export type GiftCardDraftRow = {
  serialNumber: string;
  voucherCode: string;
  amount: number | null;
};

const MAX_BULK_ROWS = 500;
const MAX_UPLOAD_BYTES = 5_000_000;
const SERIAL_HEADERS = ["serialnumber", "serial", "serialno"];
const VOUCHER_HEADERS = ["vouchercode", "voucher", "code"];
const AMOUNT_HEADERS = ["amount", "initialamount", "value", "cardvalue"];

export function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function maskVoucherCode(value: string) {
  if (value.length <= 4) return "•".repeat(value.length);
  return `${"•".repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
}

export function isValidCardAmount(amount: number) {
  return Number.isFinite(amount) && amount > 0 && Math.round(amount * 100) === amount * 100;
}

export function getGiftCardUploadExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv" as const;
  if (lower.endsWith(".xlsx")) return "xlsx" as const;
  return null;
}

export function assertGiftCardUploadFile(file: File) {
  const kind = getGiftCardUploadExtension(file.name);
  if (!kind) throw new Error("Choose a .csv or .xlsx file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Choose a file no larger than 5 MB.");
  return kind;
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[ _-]/g, "");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  cells.push(cell.trim());
  return cells;
}

function cellToString(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

function parseAmountCell(raw: string, rowLabel: string) {
  if (!raw) return null;
  const amount = Number(raw.replace(/,/g, ""));
  if (!isValidCardAmount(amount)) {
    throw new Error(`${rowLabel} needs a positive amount with no more than two decimal places.`);
  }
  return amount;
}

export function parseGiftCardTable(headers: string[], bodyRows: unknown[][]): GiftCardDraftRow[] {
  if (bodyRows.length < 1) throw new Error("Add a header row and at least one card.");
  const normalized = headers.map((header) => normalizeHeader(cellToString(header)));
  const serialIndex = normalized.findIndex((header) => SERIAL_HEADERS.includes(header));
  const voucherIndex = normalized.findIndex((header) => VOUCHER_HEADERS.includes(header));
  const amountIndex = normalized.findIndex((header) => AMOUNT_HEADERS.includes(header));
  if (serialIndex < 0 || voucherIndex < 0) {
    throw new Error("File headers must include serial number and voucher code.");
  }

  const serials = new Set<string>();
  const vouchers = new Set<string>();
  const rows = bodyRows.map((row, index) => {
    const cells = row.map((cell) => cellToString(cell));
    const serialNumber = cells[serialIndex] ?? "";
    const voucherCode = cells[voucherIndex] ?? "";
    const rowLabel = `Row ${index + 2}`;
    if (!serialNumber || serialNumber.length > 100 || !voucherCode || voucherCode.length > 200) {
      throw new Error(`${rowLabel} needs a serial number and voucher code within the allowed length.`);
    }
    const amount = amountIndex >= 0 ? parseAmountCell(cells[amountIndex] ?? "", rowLabel) : null;
    const serialKey = serialNumber.toLowerCase();
    const voucherKey = voucherCode.toLowerCase();
    if (serials.has(serialKey) || vouchers.has(voucherKey)) {
      throw new Error(`${rowLabel} repeats a serial number or voucher code from this file.`);
    }
    serials.add(serialKey);
    vouchers.add(voucherKey);
    return { serialNumber, voucherCode, amount };
  });

  if (rows.length > MAX_BULK_ROWS) throw new Error("A bulk upload can contain up to 500 cards.");
  return rows;
}

export function parseGiftCardCsv(text: string): GiftCardDraftRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Add a header row and at least one card.");
  const headers = parseCsvLine(lines[0] ?? "");
  const bodyRows = lines.slice(1).map((line) => parseCsvLine(line));
  return parseGiftCardTable(headers, bodyRows);
}

export function parseGiftCardXlsx(data: ArrayBuffer | Uint8Array): GiftCardDraftRow[] {
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The Excel file does not contain a worksheet.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("The Excel file does not contain a worksheet.");
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  const nonEmpty = matrix.filter((row) => row.some((cell) => cellToString(cell) !== ""));
  if (nonEmpty.length < 2) throw new Error("Add a header row and at least one card.");
  const [headerRow, ...bodyRows] = nonEmpty;
  return parseGiftCardTable((headerRow ?? []).map((cell) => cellToString(cell)), bodyRows);
}

export function finalizeGiftCardRows(drafts: GiftCardDraftRow[], amountOverride?: number | null): CsvCardRow[] {
  if (!drafts.length) throw new Error("Add at least one card before importing.");
  const hasOverride = typeof amountOverride === "number";
  if (hasOverride && !isValidCardAmount(amountOverride)) {
    throw new Error("Enter a positive card value with up to two decimal places.");
  }
  if (!hasOverride && drafts.some((row) => row.amount == null)) {
    throw new Error("Set a card value, or include an amount column in the file.");
  }
  return drafts.map((row) => ({
    serialNumber: row.serialNumber,
    voucherCode: row.voucherCode,
    amount: hasOverride ? amountOverride : (row.amount as number),
  }));
}

export async function parseGiftCardUploadFile(file: File): Promise<GiftCardDraftRow[]> {
  const kind = assertGiftCardUploadFile(file);
  if (kind === "csv") return parseGiftCardCsv(await file.text());
  return parseGiftCardXlsx(await file.arrayBuffer());
}

export function getAuthErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (lower.includes("too many requests")) return "Too many attempts. Please wait a moment and try again.";
  if (lower.includes("email not confirmed")) return "Check your email to confirm your account first.";
  return "Could not complete that request. Please check the details and try again.";
}
