import { createTypeSpecLibrary } from "@typespec/compiler";
import { diagnostics } from "./diagnostics.js";

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-orm",
  diagnostics,
  state: {
    table: { description: "Maps Model → table name" },
    tableMixin: { description: "Marks Model as reusable table mixin" },
    id: { description: "Marks ModelProperty as primary key" },
    map: { description: "Maps ModelProperty → column name" },
    index: { description: "Maps ModelProperty → index name" },
    unique: { description: "Marks ModelProperty as unique" },
    check: { description: "Maps ModelProperty → named check constraint info" },
    autoIncrement: { description: "Marks ModelProperty as auto-increment" },
    softDelete: { description: "Marks ModelProperty as soft-delete timestamp" },
    foreignKey: {
      description:
        "Maps ModelProperty → { field, target? } describing the local FK field and optional referenced target field",
    },
    mappedBy: {
      description: "Maps ModelProperty → inverse property name for collection-side relations",
    },
    manyToMany: {
      description: "Maps ModelProperty → generated join table name for many-to-many shorthand",
    },
    autoCreateTime: {
      description: "Marks ModelProperty as auto-set on creation",
    },
    autoUpdateTime: {
      description: "Marks ModelProperty as auto-set on every update",
    },
    precision: {
      description: "Maps ModelProperty → { precision, scale } for NUMERIC/DECIMAL",
    },
    onDelete: {
      description: "Maps ModelProperty → ON DELETE action string",
    },
    onUpdate: {
      description: "Maps ModelProperty → ON UPDATE action string",
    },
    ignore: { description: "Marks ModelProperty as ignored (not a DB column)" },
    schema: { description: "Maps Model or Namespace → PostgreSQL schema name" },
    defaultExpression: {
      description: "Maps ModelProperty → SQL expression evaluated at insert time",
    },
    version: { description: "Marks ModelProperty as the optimistic-locking version column" },
    audit: { description: 'Maps ModelProperty → audit role ("createdBy" or "updatedBy")' },
    tenantId: { description: "Marks ModelProperty as the tenant-scope foreign key" },
    modelIndexes: {
      description: "Maps Model → array of @@index([...]) augment specs",
    },
    modelUniques: {
      description: "Maps Model → array of @@unique([...]) augment specs",
    },
    scopes: {
      description: "Maps Model | ModelProperty → string[] of scope selectors",
    },
    owner: {
      description: "Maps Model | Namespace → owning team identifier",
    },
    classification: {
      description: "Maps Model | ModelProperty → data classification level",
    },
    title: { description: "Maps ModelProperty → human-readable field title" },
    placeholder: { description: "Maps ModelProperty → input placeholder text" },
    inputType: { description: "Maps Scalar → HTML input type hint" },
    polymorphic: {
      description:
        "Maps ModelProperty → { typeColumn, idColumn, allowedTypes[] } for polymorphic relations",
    },
    indexUsing: {
      description:
        "Maps ModelProperty → PostgreSQL index method (gin / gist / brin / btree / hash)",
    },
    goType: { description: "Maps ModelProperty → Go custom type spec for Ent (import/path.Type)" },
    refine: {
      description: "Maps Model → array of { name, expression } for Zod .refine() emission",
    },
  },
} as const);

export const { reportDiagnostic } = $lib;

/** Fully-qualified TypeSpec namespace where ORM decorators are declared. */
export const ORM_NAMESPACE = "Qninhdt.Orm";

export const TableKey = $lib.stateKeys.table;
export const TableMixinKey = $lib.stateKeys.tableMixin;
export const MapKey = $lib.stateKeys.map;
export const IndexKey = $lib.stateKeys.index;
export const UniqueKey = $lib.stateKeys.unique;
export const CheckKey = $lib.stateKeys.check;
export const AutoIncrementKey = $lib.stateKeys.autoIncrement;
export const SoftDeleteKey = $lib.stateKeys.softDelete;
export const ForeignKeyKey = $lib.stateKeys.foreignKey;
export const MappedByKey = $lib.stateKeys.mappedBy;
export const ManyToManyKey = $lib.stateKeys.manyToMany;
export const AutoCreateTimeKey = $lib.stateKeys.autoCreateTime;
export const AutoUpdateTimeKey = $lib.stateKeys.autoUpdateTime;
export const PrecisionKey = $lib.stateKeys.precision;
export const OnDeleteKey = $lib.stateKeys.onDelete;
export const OnUpdateKey = $lib.stateKeys.onUpdate;
export const IgnoreKey = $lib.stateKeys.ignore;
export const SchemaKey = $lib.stateKeys.schema;
export const DefaultExpressionKey = $lib.stateKeys.defaultExpression;
export const VersionKey = $lib.stateKeys.version;
export const AuditKey = $lib.stateKeys.audit;
export const TenantIdKey = $lib.stateKeys.tenantId;
export const ModelIndexesKey = $lib.stateKeys.modelIndexes;
export const ModelUniquesKey = $lib.stateKeys.modelUniques;
export const ScopesKey = $lib.stateKeys.scopes;
export const OwnerKey = $lib.stateKeys.owner;
export const ClassificationKey = $lib.stateKeys.classification;
export const TitleKey = $lib.stateKeys.title;
export const PlaceholderKey = $lib.stateKeys.placeholder;
export const InputTypeKey = $lib.stateKeys.inputType;
export const PolymorphicKey = $lib.stateKeys.polymorphic;
export const IndexUsingKey = $lib.stateKeys.indexUsing;
export const GoTypeKey = $lib.stateKeys.goType;
export const RefineKey = $lib.stateKeys.refine;
