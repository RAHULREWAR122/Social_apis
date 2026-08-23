type MergeableContact = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  city?: string | null;
  country?: string | null;
  customFields?: unknown;
};

function buildMergeFields(contact: MergeableContact): Record<string, string> {
  const customFields =
    contact.customFields && typeof contact.customFields === "object"
      ? (contact.customFields as Record<string, unknown>)
      : {};

  return {
    first_name: contact.firstName ?? "",
    last_name: contact.lastName ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    company: contact.company ?? "",
    city: contact.city ?? "",
    country: contact.country ?? "",
    ...Object.fromEntries(Object.entries(customFields).map(([key, value]) => [key, String(value ?? "")])),
  };
}

/** Replaces {{first_name}}-style merge fields with the contact's data. Unknown fields resolve to "". */
export function personalize(text: string, contact: MergeableContact): string {
  const fields = buildMergeFields(contact);
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => fields[key] ?? "");
}

/** Resolves WhatsApp's {{1}}, {{2}}... positional variables using a name -> contact-field mapping. */
export function resolveWhatsAppVariables(
  variableMap: Record<string, string>,
  contact: MergeableContact,
): string[] {
  const fields = buildMergeFields(contact);
  const positions = Object.keys(variableMap)
    .map(Number)
    .sort((a, b) => a - b);

  return positions.map((position) => fields[variableMap[String(position)]] ?? "");
}
