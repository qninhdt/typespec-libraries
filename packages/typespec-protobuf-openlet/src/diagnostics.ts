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
  "field-number-required": {
    severity: "error",
    messages: {
      default: paramMessage`Property "${"propertyName"}" on "${"messageName"}" needs an explicit @field(N) annotation. Field numbers must be pinned because they are part of the wire protocol.`,
    },
  },
  "field-number-reserved-range": {
    severity: "error",
    messages: {
      default: paramMessage`Proto field number ${"fieldNumber"} on "${"propertyName"}" falls in the implementation-reserved range 19000-19999.`,
    },
  },
  "unknown-type-fallback": {
    severity: "warning",
    messages: {
      default: paramMessage`Property "${"propertyName"}" on "${"messageName"}" has type "${"typeName"}" with no proto mapping. Falling back to google.protobuf.Any. Add @map / @goType to declare intent.`,
    },
  },
  "storage-only-scalar-on-wire": {
    severity: "warning",
    messages: {
      default: paramMessage`Property "${"propertyName"}" on "${"messageName"}" uses storage-only scalar "${"scalarName"}" without an explicit @map / @goType override. Falling back to google.protobuf.Any.`,
    },
  },
  "anonymous-model-on-wire": {
    severity: "error",
    messages: {
      default: paramMessage`Property "${"propertyName"}" on "${"messageName"}" references an anonymous model. Anonymous models cannot be emitted as proto messages — declare a named model.`,
    },
  },
  "invalid-map-key": {
    severity: "error",
    messages: {
      default: paramMessage`Property "${"propertyName"}" on "${"messageName"}" uses invalid proto map key "${"keyTypeName"}". Map keys must be an integral type or "string".`,
    },
  },
  "nested-map-rejected": {
    severity: "error",
    messages: {
      default: paramMessage`Property "${"propertyName"}" on "${"messageName"}" uses a nested map / repeated map value, which proto3 forbids. Wrap the inner value in a named message.`,
    },
  },
  "oneof-empty-group": {
    severity: "error",
    messages: {
      default: paramMessage`oneof "${"oneofName"}" on "${"messageName"}" has fewer than 2 members. A oneof block must contain at least 2 fields.`,
    },
  },
  "enum-zero-value-required": {
    severity: "error",
    messages: {
      default: paramMessage`Enum "${"enumName"}" must declare a member with value 0 (proto3 requires a default zero-value). Add an "unspecified" or equivalent member.`,
    },
  },
  "request-shape-rewrite-warning": {
    severity: "warning",
    messages: {
      default: paramMessage`Operation "${"operationName"}" request transitioned between empty and non-empty since the previous emit. The Go binding type changed (e.g. *MyRequest ↔ *emptypb.Empty). Add @keepEmptyRequest or rename the operation if this is intentional.`,
    },
  },
  "package-required-for-emit": {
    severity: "error",
    messages: {
      default: paramMessage`Namespace "${"namespaceName"}" contains @message / @service declarations but is missing @package(...). Annotate the namespace with @package("openlet.<svc>.v1").`,
    },
  },
  "cyclic-import": {
    severity: "error",
    messages: {
      default: paramMessage`Cyclic proto package import detected: ${"cycle"}. Proto files cannot import each other in a cycle — break the dependency by moving the shared type to a third package.`,
    },
  },
} as const;
