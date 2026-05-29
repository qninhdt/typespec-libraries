import { paramMessage } from "@typespec/compiler";

export const diagnostics = {
  // ─── Errors ────────────────────────────────────────────────────────────────

  "duplicate-message-name": {
    severity: "error",
    messages: {
      default: paramMessage`Proto message name "${"messageName"}" is already used by model "${"existingModel"}". Each @message model must have a unique proto name within its package.`,
    },
  },
  "duplicate-field-number": {
    severity: "error",
    messages: {
      default: paramMessage`Proto field number ${"fieldNumber"} on "${"messageName"}" is already used by property "${"existingProperty"}". Field numbers must be unique within a message.`,
    },
  },
  "field-number-out-of-range": {
    severity: "error",
    messages: {
      default: paramMessage`Proto field number ${"fieldNumber"} on "${"propertyName"}" is out of range. Valid range is 1 to 536870911 inclusive, excluding 19000-19999.`,
    },
  },
  "reservation-out-of-range": {
    severity: "error",
    messages: {
      default: paramMessage`Reservation ${"reservation"} on "${"targetName"}" is out of range. Valid range is 1 to 536870911 inclusive.`,
    },
  },
  "reservation-invalid-range": {
    severity: "error",
    messages: {
      default: paramMessage`Reservation range [${"start"}, ${"end"}] on "${"targetName"}" is invalid. The first value must be less than or equal to the second.`,
    },
  },
  "package-name-invalid": {
    severity: "error",
    messages: {
      default: paramMessage`Proto package name "${"name"}" is invalid. Package names must be lowercase dot-separated identifiers (e.g. "openlet.user.v1").`,
    },
  },
  "package-name-required": {
    severity: "error",
    messages: {
      default: `@package requires a non-empty name argument (e.g. @package("openlet.user.v1")).`,
    },
  },
  "rename-empty": {
    severity: "error",
    messages: {
      default: paramMessage`@rename on "${"propertyName"}" requires a non-empty string.`,
    },
  },
  "go-type-invalid": {
    severity: "error",
    messages: {
      default: paramMessage`@goType("${"raw"}") on "${"propertyName"}" is invalid. Expected the form "import/path.TypeName" with at least one dot separating the import path from the symbol.`,
    },
  },
  "map-key-invalid": {
    severity: "error",
    messages: {
      default: paramMessage`@map on "${"propertyName"}" has an invalid key type "${"key"}". Proto map keys must be an integral type or "string".`,
    },
  },
  "map-key-empty": {
    severity: "error",
    messages: {
      default: paramMessage`@map on "${"propertyName"}" requires a non-empty key type.`,
    },
  },
  "map-value-empty": {
    severity: "error",
    messages: {
      default: paramMessage`@map on "${"propertyName"}" requires a non-empty value type.`,
    },
  },
  "rpc-name-empty": {
    severity: "error",
    messages: {
      default: paramMessage`@rpc on "${"operationName"}" requires a non-empty name when an override is given.`,
    },
  },

  // ─── Warnings ──────────────────────────────────────────────────────────────

  "field-number-low-priority": {
    severity: "warning",
    messages: {
      default: paramMessage`Proto field number ${"fieldNumber"} on "${"propertyName"}" falls within the low single-byte range (1-15). Reserve these for fields that are frequently or always set on the wire.`,
    },
  },
} as const;
