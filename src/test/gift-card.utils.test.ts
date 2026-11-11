/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { utils as xlsxUtils, write as writeXlsx } from "xlsx";
import {
  finalizeGiftCardRows,
  formatNaira,
  maskVoucherCode,
  parseGiftCardCsv,
  parseGiftCardXlsx,
} from "@/lib/gift-card.utils";

describe("gift card helpers", () => {
  it("formats Naira values with two decimal places", () => {
    expect(formatNaira(1234.5)).toBe("₦1,234.50");
  });

  it("masks voucher codes while preserving their last four characters", () => {
    expect(maskVoucherCode("ABC1234567")).toBe("•••••••4567");
  });

  it("parses valid card CSV rows with amounts", () => {
    expect(parseGiftCardCsv("serial number,voucher code,amount\nA1,VOUCHER01,2500.50")).toEqual([
      { serialNumber: "A1", voucherCode: "VOUCHER01", amount: 2500.5 },
    ]);
  });

  it("parses CSV rows without amount when the admin will set the value", () => {
    expect(parseGiftCardCsv("serial number,voucher code\nA1,VOUCHER01")).toEqual([
      { serialNumber: "A1", voucherCode: "VOUCHER01", amount: null },
    ]);
  });

  it("applies an admin-set card value to every imported row", () => {
    const drafts = parseGiftCardCsv("serial number,voucher code\nA1,VOUCHER01\nA2,VOUCHER02");
    expect(finalizeGiftCardRows(drafts, 10000)).toEqual([
      { serialNumber: "A1", voucherCode: "VOUCHER01", amount: 10000 },
      { serialNumber: "A2", voucherCode: "VOUCHER02", amount: 10000 },
    ]);
  });

  it("overrides file amounts when an admin-set value is provided", () => {
    const drafts = parseGiftCardCsv("serial number,voucher code,amount\nA1,VOUCHER01,25\nA2,VOUCHER02,30");
    expect(finalizeGiftCardRows(drafts, 5000)).toEqual([
      { serialNumber: "A1", voucherCode: "VOUCHER01", amount: 5000 },
      { serialNumber: "A2", voucherCode: "VOUCHER02", amount: 5000 },
    ]);
  });

  it("rejects repeated card identifiers in one upload", () => {
    expect(() => parseGiftCardCsv("serial number,voucher code,amount\nA1,VOUCHER01,25\nA1,VOUCHER02,30")).toThrow("repeats a serial number");
  });

  it("rejects deductions with invalid precision or non-positive values in the file", () => {
    expect(() => parseGiftCardCsv("serial number,voucher code,amount\nA1,VOUCHER01,-1")).toThrow("positive amount");
  });

  it("requires a card value when the file has no amount column", () => {
    const drafts = parseGiftCardCsv("serial number,voucher code\nA1,VOUCHER01");
    expect(() => finalizeGiftCardRows(drafts)).toThrow("Set a card value");
  });

  it("parses Excel worksheets with serial, voucher, and amount columns", () => {
    const sheet = xlsxUtils.aoa_to_sheet([
      ["Serial Number", "Voucher Code", "Amount"],
      ["X1", "EXCEL-01", 7500],
    ]);
    const workbook = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(workbook, sheet, "Cards");
    const base64 = writeXlsx(workbook, { type: "base64", bookType: "xlsx" }) as string;
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    expect(parseGiftCardXlsx(bytes)).toEqual([
      { serialNumber: "X1", voucherCode: "EXCEL-01", amount: 7500 },
    ]);
  });
});
