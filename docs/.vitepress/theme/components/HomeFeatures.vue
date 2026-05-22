<script setup lang="ts">
const features = [
  {
    icon: "🧩",
    title: "Namespace-first",
    description:
      "One namespace = one package. Output paths, package roots, and selectors all derive from your TypeSpec namespaces.",
  },
  {
    icon: "🌐",
    title: "Polyglot emitters",
    description:
      "Emit Go (Ent), Python (SQLModel), TypeScript (Zod), and DBML from a single source of truth, plus upstream Protobuf.",
  },
  {
    icon: "📝",
    title: "Form-aware",
    description:
      "@scope(\"frontend\") + @title / @placeholder / @inputType produce real Zod schemas with form metadata.",
  },
  {
    icon: "📦",
    title: "Standalone output",
    description:
      "Generate ready-to-publish packages with go.mod, pyproject.toml, or package.json. Drop them into your service repos.",
  },
];
</script>

<template>
  <div class="tl-home-features">
    <div v-for="f in features" :key="f.title" class="card">
      <div class="icon">{{ f.icon }}</div>
      <h3>{{ f.title }}</h3>
      <p>{{ f.description }}</p>
    </div>
  </div>
</template>
