/**
 * ZodScalarDeclaration - thin wrapper around ZodSchemaDeclaration for scalars.
 *
 * Previously this was a full duplicate of ZodSchemaDeclaration.  Now it
 * delegates entirely, keeping backward-compatible exports.
 */

export { ZodSchemaDeclaration as ZodScalarDeclaration } from "./ZodSchemaDeclaration.js";
