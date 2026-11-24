export type ParsedPhrase = {
  type: "expense" | "income";
  verb: "Gaste" | "Ingreso";
  amount: number;
  description?: string;
};

const phrasePattern = /^(gaste|ingreso)\s+(\d+)(?:\s+([\s\S]+))?$/i;

export function parsePhrase(text: string, maxAmount: number): ParsedPhrase | null {
  const match = text.trim().match(phrasePattern);
  if (!match) return null;

  const amount = Number(match[2]);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maxAmount) return null;

  const description = match[3]?.trim();
  const verb = match[1].toLowerCase();
  const parsed: ParsedPhrase = {
    type: verb === "gaste" ? "expense" : "income",
    verb: verb === "gaste" ? "Gaste" : "Ingreso",
    amount,
  };
  if (description) parsed.description = description;
  return parsed;
}

export function formatAmount(amount: number): string {
  const digits = String(amount);
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    const start = Math.max(0, end - 3);
    groups.unshift(digits.slice(start, end));
  }
  return groups.join(".");
}

export function successReply(phrase: ParsedPhrase): string {
  const amount = formatAmount(phrase.amount);
  const detail = phrase.description
    ? `${phrase.verb} ${amount} ${phrase.description}`
    : `${phrase.verb} ${amount}`;
  return `Transaccion registrada con exito:\n\n  - ${detail}`;
}

export function helpReply(): string {
  return "No entendi. Usa: gaste 20000 o ingreso 20000";
}

export function unknownUserReply(): string {
  return "No encuentro un usuario de Telegram con este id.";
}

export function failureReply(message: string): string {
  return `No pude registrar la transaccion: ${message}`;
}
