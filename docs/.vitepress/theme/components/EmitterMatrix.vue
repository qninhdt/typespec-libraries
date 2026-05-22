<script setup lang="ts">
type Cell = "yes" | "no" | string;

const rows: { feature: string; cells: Record<string, Cell> }[] = [
  {
    feature: "Namespace-first output",
    cells: { orm: "yes", ent: "yes", sqlmodel: "yes", zod: "yes", dbml: "yes" },
  },
  {
    feature: "include / exclude selectors",
    cells: { orm: "yes", ent: "yes", sqlmodel: "yes", zod: "yes", dbml: "yes" },
  },
  {
    feature: "@tableMixin",
    cells: { orm: "yes", ent: "yes", sqlmodel: "yes", zod: "yes", dbml: "yes" },
  },
  {
    feature: "Referenced-column FKs",
    cells: { orm: "yes", ent: "no", sqlmodel: "yes", zod: "n/a", dbml: "yes" },
  },
  {
    feature: "Collection persistence",
    cells: {
      orm: "yes",
      ent: "jsonb / postgres",
      sqlmodel: "jsonb / postgres",
      zod: "n/a",
      dbml: "yes",
    },
  },
  {
    feature: "Named @check",
    cells: {
      orm: "yes",
      ent: "yes",
      sqlmodel: "yes",
      zod: "n/a",
      dbml: "as note",
    },
  },
  {
    feature: "@manyToMany shorthand",
    cells: { orm: "yes", ent: "yes", sqlmodel: "yes", zod: "n/a", dbml: "yes" },
  },
  {
    feature: "Form metadata",
    cells: {
      orm: "yes",
      ent: "form tags",
      sqlmodel: "Pydantic meta",
      zod: "*Meta exports",
      dbml: "n/a",
    },
  },
  {
    feature: "Atlas config",
    cells: {
      orm: "n/a",
      ent: "yes",
      sqlmodel: "emit-atlas",
      zod: "n/a",
      dbml: "n/a",
    },
  },
  {
    feature: "Standalone packages",
    cells: {
      orm: "n/a",
      ent: "go.mod",
      sqlmodel: "pyproject.toml",
      zod: "package.json",
      dbml: "n/a",
    },
  },
];

function cellClass(value: Cell) {
  if (value === "yes") return "yes";
  if (value === "no" || value === "n/a") return "no";
  return "";
}
</script>

<template>
  <table class="tl-emitter-matrix">
    <thead>
      <tr>
        <th>Feature</th>
        <th>orm</th>
        <th>ent</th>
        <th>sqlmodel</th>
        <th>zod</th>
        <th>dbml</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.feature">
        <td>{{ r.feature }}</td>
        <td :class="cellClass(r.cells.orm)">{{ r.cells.orm }}</td>
        <td :class="cellClass(r.cells.ent)">{{ r.cells.ent }}</td>
        <td :class="cellClass(r.cells.sqlmodel)">{{ r.cells.sqlmodel }}</td>
        <td :class="cellClass(r.cells.zod)">{{ r.cells.zod }}</td>
        <td :class="cellClass(r.cells.dbml)">{{ r.cells.dbml }}</td>
      </tr>
    </tbody>
  </table>
</template>
