import type { Model } from "@typespec/compiler";
import type { EnumMemberInfo } from "./helpers.js";

export type OrmSelector =
  | { raw: string; kind: "name" }
  | { raw: string; kind: "tag"; value: string };

export interface NormalizedDependency {
  kind: "model" | "mixin" | "enum" | "scalar";
  fullName: string;
  namespace?: string;
  /** Pre-resolved enum members; only populated when `kind === "enum"`. */
  enumMembers?: EnumMemberInfo[];
}

export interface NormalizedOrmModel {
  kind: "table" | "data" | "mixin";
  model: Model;
  name: string;
  fullName: string;
  namespace: string;
  namespaceSegments: string[];
  namespacePath: string[];
  namespaceDir: string;
  packageName: string;
  tableName?: string;
  label?: string;
  mixins: Model[];
  dependencies: NormalizedDependency[];
  /** PostgreSQL schema for the table (resolved up the namespace chain), or undefined for default. */
  schema?: string;
  /** Scopes applied to the model itself via `@scope`. Empty when none. */
  scopes: string[];
  /** Column name (after @map) of the @version property, or undefined when none. */
  versionColumn?: string;
}

export interface NormalizedOrmGraph {
  models: NormalizedOrmModel[];
  byModel: Map<Model, NormalizedOrmModel>;
}

export interface OrmEmitterSelection {
  models: NormalizedOrmModel[];
  byNamespace: Map<string, NormalizedOrmModel[]>;
  topLevelNamespaces: string[];
}

export interface SelectionOptions {
  include?: string[];
  exclude?: string[];
  kinds: Array<NormalizedOrmModel["kind"]>;
  autoIncludeDependencies?: boolean;
}

export const BUILTIN_NAMESPACE = "TypeSpec";

export const MODEL_KIND_PRIORITY: Record<NormalizedOrmModel["kind"], number> = {
  data: 0,
  mixin: 1,
  table: 2,
};
