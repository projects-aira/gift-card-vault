export type CsvCardRow = {
  serialNumber: string;
  voucherCode: string;
  amount: number;
};

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

export function parseGiftCardCsv(text: string): CsvCardRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Add a header row and at least one card.");
  const headers = parseCsvLine(lines[0] ?? "").map((header) => header.toLowerCase().replace(/[ _-]/g, ""));
  const serialIndex = headers.findIndex((header) => ["serialnumber", "serial", "serialno"].includes(header));
  const voucherIndex = headers.findIndex((header) => ["vouchercode", "voucher", "code"].includes(header));
  const amountIndex = headers.findIndex((header) => ["amount", "initialamount", "value"].includes(header));
  if (serialIndex < 0 || voucherIndex < 0 || amountIndex < 0) {
    throw new Error("CSV headers must include serial number, voucher code, and amount.");
  }
  const serials = new Set<string>();
  const vouchers = new Set<string>();
  const rows = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const serialNumber = (cells[serialIndex] ?? "").trim();
    const voucherCode = (cells[voucherIndex] ?? "").trim();
    const amount = Number(cells[amountIndex]);
    if (!serialNumber || serialNumber.length > 100 || !voucherCode || voucherCode.length > 200) {
      throw new Error(`Row ${index + 2} needs a serial number and voucher code within the allowed length.`);
    }
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      throw new Error(`Row ${index + 2} needs a positive amount with no more than two decimal places.`);
    }
    const serialKey = serialNumber.toLowerCase();
    const voucherKey = voucherCode.toLowerCase();
    if (serials.has(serialKey) || vouchers.has(voucherKey)) {
      throw new Error(`Row ${index + 2} repeats a serial number or voucher code from this file.`);
    }
    serials.add(serialKey);
    vouchers.add(voucherKey);
    return { serialNumber, voucherCode, amount };
  });
  if (rows.length > 500) throw new Error("A bulk upload can contain up to 500 cards.");
  return rows;
}

export function getAuthErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (lower.includes("too many requests")) return "Too many attempts. Please wait a moment and try again.";
  if (lower.includes("email not confirmed")) return "Check your email to confirm your account first.";
  return "Could not complete that request. Please check the details and try again.";
}