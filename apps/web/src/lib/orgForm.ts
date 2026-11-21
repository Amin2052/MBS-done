/**
 * Form state for the business profile: what counts as a change, what is sent, and what is
 * rejected before a request is made. Kept out of the component so it can be tested
 * without a DOM.
 *
 * The PATCH body carries only the fields that actually changed, which keeps the audit
 * log's before/after diff meaningful.
 */
import type { OrgPatch, OrgSettings } from "./api.ts";

export interface OrgFormValues {
  legalName: string;
  bin: string;
  address: string;
  phone: string;
  email: string;
  numberingSystem: "bengali" | "latin";
  fiscalYearStartMonth: number;
  vatRegistered: boolean;
}

export type OrgField = keyof OrgFormValues;
export type OrgErrors = Partial<Record<OrgField, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: string | null): string {
  return value ?? "";
}

export function toFormValues(org: OrgSettings): OrgFormValues {
  return {
    legalName: text(org.legalName),
    bin: text(org.bin),
    address: text(org.address),
    phone: text(org.phone),
    email: text(org.email),
    numberingSystem: org.numberingSystem,
    fiscalYearStartMonth: org.fiscalYearStartMonth,
    vatRegistered: org.vatRegistered,
  };
}

/** Trimmed, with empty optional text becoming null (the column is nullable). */
function patchText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function diffPatch(before: OrgFormValues, after: OrgFormValues): OrgPatch {
  const patch: OrgPatch = {};
  if (after.legalName.trim() !== before.legalName.trim()) patch.legalName = patchText(after.legalName);
  if (after.bin.trim() !== before.bin.trim()) patch.bin = patchText(after.bin);
  if (after.address.trim() !== before.address.trim()) patch.address = patchText(after.address);
  if (after.phone.trim() !== before.phone.trim()) patch.phone = patchText(after.phone);
  if (after.email.trim() !== before.email.trim()) patch.email = patchText(after.email);
  if (after.numberingSystem !== before.numberingSystem) patch.numberingSystem = after.numberingSystem;
  if (after.fiscalYearStartMonth !== before.fiscalYearStartMonth) {
    patch.fiscalYearStartMonth = after.fiscalYearStartMonth;
  }
  if (after.vatRegistered !== before.vatRegistered) patch.vatRegistered = after.vatRegistered;
  return patch;
}

export function isDirty(before: OrgFormValues, after: OrgFormValues): boolean {
  return Object.keys(diffPatch(before, after)).length > 0;
}

/**
 * Only rules that need a translated message live here; length limits are `maxLength`
 * attributes on the inputs, matching the server's own limits.
 */
export function validateForm(
  values: OrgFormValues,
  messages: { emailInvalid: string }
): OrgErrors {
  const errors: OrgErrors = {};
  const email = values.email.trim();
  if (email !== "" && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
    errors.email = messages.emailInvalid;
  }
  return errors;
}
