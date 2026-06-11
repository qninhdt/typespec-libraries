import { defineConfig } from "vitepress";

export default defineConfig({
  title: "TypeSpec ORM",
  description:
    "One schema. Many backends. Author your data model in TypeSpec, emit production-ready Ent, SQLModel, Zod, and DBML.",
  base: "/typespec-libraries/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", href: "/typespec-libraries/favicon.ico" }],
    ["meta", { name: "theme-color", content: "#7C3AED" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "TypeSpec ORM" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "One schema. Many backends. Author your data model in TypeSpec, emit production-ready Ent, SQLModel, Zod, and DBML.",
      },
    ],
    ["meta", { property: "og:image", content: "/typespec-libraries/og-image.png" }],
  ],
  themeConfig: {
    logo: { light: "/logo.svg", dark: "/logo-dark.svg" },
    siteTitle: "TypeSpec ORM",

    nav: [
      { text: "Guide", link: "/guide/introduction", activeMatch: "/guide/" },
      {
        text: "Reference",
        link: "/reference/decorators/",
        activeMatch: "/reference/",
      },
      { text: "Emitters", link: "/emitters/", activeMatch: "/emitters/" },
      { text: "Examples", link: "/examples/", activeMatch: "/examples/" },
      {
        text: "v0.5",
        items: [
          {
            text: "Changelog",
            link: "https://github.com/qninhdt/typespec-libraries/releases",
          },
          {
            text: "Contributing",
            link: "https://github.com/qninhdt/typespec-libraries/blob/main/CONTRIBUTING.md",
          },
        ],
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          collapsed: false,
          items: [
            { text: "What is TypeSpec ORM?", link: "/guide/introduction" },
            {
              text: "Why namespace-first",
              link: "/guide/why-namespace-first",
            },
            { text: "Quickstart", link: "/guide/quickstart" },
          ],
        },
        {
          text: "Core Concepts",
          collapsed: false,
          items: [
            { text: "Namespaces", link: "/guide/concepts/namespaces" },
            {
              text: "Tables and mixins",
              link: "/guide/concepts/tables-and-mixins",
            },
            { text: "Relations", link: "/guide/concepts/relations" },
            { text: "Scopes", link: "/guide/concepts/scopes" },
            { text: "Selectors", link: "/guide/concepts/selectors" },
            {
              text: "Standalone packages",
              link: "/guide/concepts/standalone-packages",
            },
          ],
        },
        {
          text: "Authoring",
          collapsed: false,
          items: [
            { text: "Form metadata", link: "/guide/form-metadata" },
            { text: "Custom scalars", link: "/guide/custom-scalars" },
            { text: "Migration guide", link: "/guide/migration" },
            { text: "FAQ", link: "/guide/faq" },
          ],
        },
      ],

      "/reference/": [
        {
          text: "Decorators",
          collapsed: false,
          items: [
            { text: "Overview", link: "/reference/decorators/" },
            {
              text: "Schema and tables",
              link: "/reference/decorators/schema-and-tables",
            },
            {
              text: "Columns and scalars",
              link: "/reference/decorators/columns-and-scalars",
            },
            { text: "Relations", link: "/reference/decorators/relations" },
            {
              text: "Indexes and constraints",
              link: "/reference/decorators/indexes-and-constraints",
            },
            {
              text: "Timestamps and soft delete",
              link: "/reference/decorators/timestamps-and-soft-delete",
            },
            {
              text: "Form metadata",
              link: "/reference/decorators/form-metadata",
            },
            { text: "Governance", link: "/reference/decorators/governance" },
          ],
        },
        {
          text: "Reference",
          collapsed: false,
          items: [
            { text: "Scalars", link: "/reference/scalars" },
            { text: "Diagnostics", link: "/reference/diagnostics" },
          ],
        },
      ],

      "/emitters/": [
        {
          text: "Emitters",
          collapsed: false,
          items: [
            { text: "Overview", link: "/emitters/" },
            { text: "@qninhdt/typespec-orm", link: "/emitters/orm" },
            { text: "@qninhdt/typespec-ent", link: "/emitters/ent" },
            {
              text: "@qninhdt/typespec-sqlmodel",
              link: "/emitters/sqlmodel",
            },
            { text: "@qninhdt/typespec-zod", link: "/emitters/zod" },
            { text: "@qninhdt/typespec-dbml", link: "/emitters/dbml" },
          ],
        },
      ],

      "/examples/": [
        {
          text: "Examples",
          collapsed: false,
          items: [
            { text: "Overview", link: "/examples/" },
            { text: "Game Platform", link: "/examples/game-platform" },
            { text: "File Vault", link: "/examples/file-vault" },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/qninhdt/typespec-libraries",
      },
    ],

    search: {
      provider: "local",
      options: {
        detailedView: true,
      },
    },

    editLink: {
      pattern: "https://github.com/qninhdt/typespec-libraries/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License. Made with care by @qninhdt.",
      copyright: "Copyright © 2025-present Nguyen Quang Ninh",
    },

    outline: {
      level: [2, 3],
      label: "On this page",
    },
  },

  markdown: {
    theme: { light: "github-light", dark: "github-dark" },
    lineNumbers: false,
  },

  ignoreDeadLinks: [
    /^https:\/\/qninhdt\.github\.io\/typespec-libraries\//,
    /^https:\/\/github\.com\/qninhdt\/typespec-libraries\//,
  ],
});
