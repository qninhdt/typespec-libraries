# Decorators

Every decorator in `@qninhdt/typespec-orm` plus its targets, arguments,
and behavior. Use the sidebar to navigate by category.

## By category

- [Schema and tables](/reference/decorators/schema-and-tables) —
  `@table`, `@tableMixin`, `@data`, `@schema`, `@@tableIndex`,
  `@@tableUnique`.
- [Columns and scalars](/reference/decorators/columns-and-scalars) —
  `@map`, `@autoIncrement`, `@defaultExpression`, `@precision`,
  `@ignore`.
- [Relations](/reference/decorators/relations) — `@foreignKey`,
  `@mappedBy`, `@manyToMany`, `@onDelete`, `@onUpdate`.
- [Indexes and constraints](/reference/decorators/indexes-and-constraints) —
  `@unique`, `@index`, `@check`.
- [Timestamps and soft delete](/reference/decorators/timestamps-and-soft-delete) —
  `@autoCreateTime`, `@autoUpdateTime`, `@softDelete`.
- [Form metadata](/reference/decorators/form-metadata) — `@title`,
  `@placeholder`, `@inputType`.
- [Governance](/reference/decorators/governance) — `@scope`, `@owner`,
  `@classification`, `@audit`, `@tenantId`, `@version`.

## Quick lookup

| Decorator            | Target            | Page                                                                           |
| -------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `@table`             | model             | [Schema and tables](/reference/decorators/schema-and-tables)                   |
| `@tableMixin`        | model             | [Schema and tables](/reference/decorators/schema-and-tables)                   |
| `@data`              | model             | [Schema and tables](/reference/decorators/schema-and-tables)                   |
| `@schema`            | model / namespace | [Schema and tables](/reference/decorators/schema-and-tables)                   |
| `@@tableIndex`       | model             | [Schema and tables](/reference/decorators/schema-and-tables)                   |
| `@@tableUnique`      | model             | [Schema and tables](/reference/decorators/schema-and-tables)                   |
| `@map`               | property          | [Columns and scalars](/reference/decorators/columns-and-scalars)               |
| `@autoIncrement`     | property          | [Columns and scalars](/reference/decorators/columns-and-scalars)               |
| `@defaultExpression` | property          | [Columns and scalars](/reference/decorators/columns-and-scalars)               |
| `@precision`         | property          | [Columns and scalars](/reference/decorators/columns-and-scalars)               |
| `@ignore`            | property          | [Columns and scalars](/reference/decorators/columns-and-scalars)               |
| `@foreignKey`        | property          | [Relations](/reference/decorators/relations)                                   |
| `@mappedBy`          | property          | [Relations](/reference/decorators/relations)                                   |
| `@manyToMany`        | property          | [Relations](/reference/decorators/relations)                                   |
| `@onDelete`          | property          | [Relations](/reference/decorators/relations)                                   |
| `@onUpdate`          | property          | [Relations](/reference/decorators/relations)                                   |
| `@unique`            | property          | [Indexes and constraints](/reference/decorators/indexes-and-constraints)       |
| `@index`             | property          | [Indexes and constraints](/reference/decorators/indexes-and-constraints)       |
| `@check`             | property          | [Indexes and constraints](/reference/decorators/indexes-and-constraints)       |
| `@autoCreateTime`    | property          | [Timestamps and soft delete](/reference/decorators/timestamps-and-soft-delete) |
| `@autoUpdateTime`    | property          | [Timestamps and soft delete](/reference/decorators/timestamps-and-soft-delete) |
| `@softDelete`        | property          | [Timestamps and soft delete](/reference/decorators/timestamps-and-soft-delete) |
| `@title`             | property          | [Form metadata](/reference/decorators/form-metadata)                           |
| `@placeholder`       | property          | [Form metadata](/reference/decorators/form-metadata)                           |
| `@inputType`         | scalar            | [Form metadata](/reference/decorators/form-metadata)                           |
| `@scope`             | model / property  | [Governance](/reference/decorators/governance)                                 |
| `@owner`             | model / namespace | [Governance](/reference/decorators/governance)                                 |
| `@classification`    | model / property  | [Governance](/reference/decorators/governance)                                 |
| `@audit`             | property          | [Governance](/reference/decorators/governance)                                 |
| `@tenantId`          | property          | [Governance](/reference/decorators/governance)                                 |
| `@version`           | property          | [Governance](/reference/decorators/governance)                                 |
