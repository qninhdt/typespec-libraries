---
layout: home

hero:
  name: TypeSpec ORM
  text: One schema. Many backends.
  tagline: Author your data model in TypeSpec, emit production-ready Ent, SQLModel, Zod, and DBML.
  image:
    src: /logo.svg
    alt: TypeSpec ORM
  actions:
    - theme: brand
      text: Get started
      link: /guide/quickstart
    - theme: alt
      text: Why namespace-first
      link: /guide/why-namespace-first
    - theme: alt
      text: View on GitHub
      link: https://github.com/qninhdt/typespec-libraries
---

<HomeFeatures />

## A real schema for real services

```typespec
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.Platform.Shared;

@tableMixin
model Timestamped {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
  @autoUpdateTime updatedAt?: utcDateTime;
}

namespace Demo.Platform.Accounts;

@table
model User {
  ...Demo.Platform.Shared.Timestamped;
  @unique @maxLength(320) @format("email") email: string;
  @check("users_credits_non_negative", "credits >= 0") credits: int32 = 0;
  @manyToMany("user_badges") badges?: Badge[];
}

@table
model Badge {
  ...Demo.Platform.Shared.Timestamped;
  @unique @maxLength(80) code: string;
  @manyToMany("user_badges") users?: User[];
}
```

The same model drives Go (Ent) services, Python (SQLModel) services,
TypeScript (Zod) form validation, and DBML documentation. No emitter
invents its own interpretation.

## Five packages, one normalized graph

<EmitterMatrix />

## Who uses this?

This monorepo is built for teams that want **one namespace-first source
of truth** for PostgreSQL-backed services and upstream Protobuf
contracts. If you've been hand-maintaining the same schema in Go,
Python, and TypeScript — stop.

[Quickstart →](/guide/quickstart) · [Browse decorators →](/reference/decorators/) · [Study the examples →](/examples/)
