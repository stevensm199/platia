import { describe, expect, it } from "vitest";
import { MAX_AMOUNT } from "../src/config/constants";
import {
  formatAmount,
  helpReply,
  parsePhrase,
  successReply,
} from "../src/modules/channels/telegram/domain/phrase";

describe("telegram phrase", () => {
  it("parses an expense and an income", () => {
    expect(parsePhrase("gaste 20000", MAX_AMOUNT)).toEqual({
      type: "expense",
      verb: "Gaste",
      amount: 20000,
    });
    expect(parsePhrase("Ingreso 50000 nomina", MAX_AMOUNT)).toEqual({
      type: "income",
      verb: "Ingreso",
      amount: 50000,
      description: "nomina",
    });
  });

  it("rejects amounts that are not a plain integer in range", () => {
    expect(parsePhrase("gaste 20.000", MAX_AMOUNT)).toBeNull();
    expect(parsePhrase("pague 20000", MAX_AMOUNT)).toBeNull();
    expect(parsePhrase("gaste 0", MAX_AMOUNT)).toBeNull();
    expect(parsePhrase(`gaste ${MAX_AMOUNT + 1}`, MAX_AMOUNT)).toBeNull();
  });

  it("formats the success reply with grouped thousands", () => {
    const phrase = parsePhrase("gaste 20000", MAX_AMOUNT);
    expect(formatAmount(999)).toBe("999");
    expect(formatAmount(1_000_000)).toBe("1.000.000");
    expect(successReply(phrase!)).toBe("Transaccion registrada con exito:\n\n  - Gaste 20.000");
    expect(helpReply()).toBe("No entendi. Usa: gaste 20000 o ingreso 20000");
  });
});
