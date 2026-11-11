import { describe, expect, it } from "vitest";
import { formatNaira, maskVoucherCode, parseGiftCardCsv } from "@/lib/gift-card.utils";

describe("gift card helpers", () => {
  it("formats Naira values with two decimal places", () => {
    expect(formatNaira(1234.5)).toBe("₦1,234.50");
  });

  it("masks voucher codes while preserving their last four characters", () => {
    expect(maskVoucherCode("ABC1234567")).toBe("•••••••4567");
  });

  it("parses valid card CSV rows", () => {
    expect(parseGiftCardCsv("serial number,voucher code,amount\nA1,VOUCHER01,2500.50")).toEqual([
      { serialNumber: "A1", voucherCode: "VOUCHER01", amount: 2500.5 },
    ]);
  });

  it("rejects repeated card identifiers in one upload", () => {
    expect(() => parseGiftCardCsv("serial number,voucher code,amount\nA1,VOUCHER01,25\nA1,VOUCHER02,30")).toThrow("repeats a serial number");
  });

  it("rejects deductions with invalid precision or non-positive values in the file", () => {
    expect(() => parseGiftCardCsv("serial number,voucher code,amount\nA1,VOUCHER01,-1")).toThrow("positive amount");
  });
});