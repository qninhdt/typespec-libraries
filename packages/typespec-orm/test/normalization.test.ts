import { describe, expect, it } from "vitest";
import type { Model, Namespace, Program } from "@typespec/compiler";
import {
  getLibraryLeafName,
  getRelativeImportPath,
  normalizeOrmGraph,
  selectModelsForEmitter,
  selectorMatchesName,
} from "../src/normalization.js";
import { TableKey, TableMixinKey } from "../src/lib.js";
import { createTestRunner } from "./utils.js";

function createNamespace(name: string, parent?: Namespace): Namespace {
  return {
    kind: "Namespace",
    name,
    namespace: parent,
    models: new Map(),
    namespaces: new Map(),
  } as Namespace;
}

function createModel(name: string, namespace: Namespace): Model {
  const model = {
    kind: "Model",
    name,
    namespace,
    properties: new Map(),
    sourceModels: [],
  } as unknown as Model;
  namespace.models.set(name, model);
  return model;
}

function createProgramForModels(configure: (program: Program) => void): Program {
  const state = new Map<symbol, Map<unknown, unknown>>();
  const globalNamespace = createNamespace("");
  const diagnostics: { code?: string }[] = [];
  const program = {
    stateMap(key: symbol) {
      const map = state.get(key) ?? new Map();
      state.set(key, map);
      return map;
    },
    getGlobalNamespaceType() {
      return globalNamespace;
    },
    diagnostics,
    reportDiagnostic(diagnostic: { code?: string }) {
      diagnostics.push(diagnostic);
    },
  } as unknown as Program;

  configure(program);
  return program;
}

describe("normalization helpers", () => {
  it("normalizes library leaves and relative import paths", () => {
    expect(getLibraryLeafName("@scope/my-library")).toBe("my_library");
    expect(getLibraryLeafName(" generated/sql-model ")).toBe("sql_model");
    expect(getRelativeImportPath(["demo", "accounts"], ["demo", "audit"], "user")).toBe(
      "../audit/user",
    );
    expect(getRelativeImportPath(["demo"], ["demo", "accounts"], "user")).toBe("./accounts/user");
  });

  it("matches selectors against names and namespaces", () => {
    expect(selectorMatchesName("Demo", "Demo.Accounts.User", "Demo.Accounts")).toBe(true);
    expect(selectorMatchesName("Demo.Accounts", "Demo.Accounts.User", "Demo.Accounts")).toBe(true);
    expect(selectorMatchesName("Demo.Billing", "Demo.Accounts.User", "Demo.Accounts")).toBe(false);
  });
});

describe("normalizeOrmGraph", () => {
  it("captures namespaces, mixins, and cross-namespace dependencies", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Shared {
        @tableMixin
        model AuditFields {
          createdAt: utcDateTime;
        }

        enum Status {
          active,
          disabled,
        }
      }

      namespace Demo.Users {
        @table
        model User {
          ...Demo.Shared.AuditFields;
          @key id: uuid;
          status: Demo.Shared.Status;
        }
      }

      namespace Demo.Projects {
        @table
        model Project {
          @key id: uuid;
          ownerId: uuid;
          @foreignKey("ownerId")
          owner: Demo.Users.User;
        }
      }

      namespace Demo.Forms {
        model ProjectForm {
          ownerId: uuid;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const user = graph.models.find((item) => item.name === "User");
    const project = graph.models.find((item) => item.name === "Project");
    const projectForm = graph.models.find((item) => item.name === "ProjectForm");
    expect(user).toBeDefined();
    expect(project).toBeDefined();
    expect(projectForm).toBeDefined();
    if (!user || !project || !projectForm) {
      throw new Error("Expected normalized ORM models to be present");
    }

    expect(user.namespacePath).toEqual(["test", "demo", "users"]);
    expect(user.mixins.map((model) => model.name)).toEqual(["AuditFields"]);
    expect(user.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mixin",
          fullName: "Test.Demo.Shared.AuditFields",
        }),
        expect.objectContaining({
          kind: "enum",
          fullName: "Test.Demo.Shared.Status",
        }),
      ]),
    );
    expect(project.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: expect.any(String),
          fullName: "Test.Demo.Users.User",
        }),
      ]),
    );
    expect(projectForm.kind).toBe("data");
    expect(projectForm.label).toBe("ProjectForm");
  });

  it("reports selector conflicts, redundant selectors, and filtered dependencies", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        @table
        model User {
          @key id: uuid;
        }
      }

      namespace Demo.Projects {
        @table
        model Project {
          @key id: uuid;
          ownerId: uuid;
          @foreignKey("ownerId")
          owner: Demo.Users.User;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const conflictSelection = selectModelsForEmitter(runner.program, graph, {
      include: ["Test.Demo", "Test.Demo.Projects"],
      exclude: ["Test.Demo.Projects", "Test.Demo.Users", "Test.Demo.Users"],
      kinds: ["table"],
    });

    expect(conflictSelection.models.map((model) => model.name)).toEqual([]);

    const dependencySelection = selectModelsForEmitter(runner.program, graph, {
      include: ["Test.Demo.Projects"],
      exclude: ["Test.Demo.Users", "Test.Demo.Users"],
      kinds: ["table"],
    });

    expect(dependencySelection.models.map((model) => model.name)).toEqual(["Project"]);
    const codes = runner.program.diagnostics.map((diag) => diag.code);
    expect(codes).toContain("@qninhdt/typespec-orm/filter-selector-conflict");
    expect(codes).toContain("@qninhdt/typespec-orm/filter-selector-redundant");
    expect(codes).toContain("@qninhdt/typespec-orm/filtered-dependency");
  });

  it("reports unsupported relation shapes for undeclared model references", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        @table
        model User {
          @key id: uuid;
          accountProfile: Profile;
        }

        @table
        model Profile {
          @key id: uuid;
        }
      }
    `);

    normalizeOrmGraph(runner.program);

    const codes = runner.program.diagnostics.map((diag) => diag.code);
    expect(codes).toContain("@qninhdt/typespec-orm/unsupported-relation-shape");
  });

  it("reports mixin field conflicts from repeated mixin fields", () => {
    const program = createProgramForModels((program) => {
      const globalNamespace = program.getGlobalNamespaceType();
      const testNamespace = createNamespace("Test", globalNamespace);
      globalNamespace.namespaces.set("Test", testNamespace);
      const demoNamespace = createNamespace("Demo", testNamespace);
      testNamespace.namespaces.set("Demo", demoNamespace);

      const named = createModel("Named", demoNamespace);
      named.properties.set("name", {
        kind: "ModelProperty",
        name: "name",
        type: { kind: "Scalar", name: "string" },
      } as never);
      const namedAlias = createModel("NamedAlias", demoNamespace);
      namedAlias.properties.set("name", {
        kind: "ModelProperty",
        name: "name",
        type: { kind: "Scalar", name: "string" },
      } as never);
      const user = createModel("User", demoNamespace);
      user.properties.set("id", {
        kind: "ModelProperty",
        name: "id",
        type: { kind: "Scalar", name: "uuid" },
      } as never);
      user.sourceModels = [{ model: named }, { model: namedAlias }] as never;

      program.stateMap(TableMixinKey).set(named, true);
      program.stateMap(TableMixinKey).set(namedAlias, true);
      program.stateMap(TableKey).set(user, "users");
    });

    normalizeOrmGraph(program);

    const codes = program.diagnostics.map((diag) => diag.code);
    expect(codes).toContain("@qninhdt/typespec-orm/mixin-field-conflict");
  });

  it("returns sorted namespace groups for selected tables and data models", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Zeta {
        model ZetaForm {
          value: string;
        }
      }

      namespace Demo.Alpha {
        @table
        model Alpha {
          @key id: uuid;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const selection = selectModelsForEmitter(runner.program, graph, {
      kinds: ["table", "data"],
    });

    expect(selection.topLevelNamespaces).toEqual(["test"]);
    expect([...selection.byNamespace.keys()]).toEqual(["Test.Demo.Alpha", "Test.Demo.Zeta"]);
    expect(selection.models.map((model) => model.name)).toEqual(["Alpha", "ZetaForm"]);
  });

  it("selects only data models when kinds is ['data']", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        @table
        model User {
          @key id: uuid;
        }

        model UserForm {
          name: string;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const selection = selectModelsForEmitter(runner.program, graph, {
      kinds: ["data"],
    });

    expect(selection.models.map((model) => model.name)).toEqual(["UserForm"]);
    expect(selection.models.every((m) => m.kind === "data")).toBe(true);
  });

  it("selects only table models when kinds is ['table']", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        @table
        model User {
          @key id: uuid;
        }

        model UserForm {
          name: string;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const selection = selectModelsForEmitter(runner.program, graph, {
      kinds: ["table"],
    });

    expect(selection.models.map((model) => model.name)).toEqual(["User"]);
    expect(selection.models.every((m) => m.kind === "table")).toBe(true);
  });

  it("matches scope selectors of the form #X against @scope values", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        @table
        @Qninhdt.Orm.scope("auth")
        model User {
          @key id: uuid;
        }

        @table
        model AuditLog {
          @key id: uuid;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const selection = selectModelsForEmitter(runner.program, graph, {
      include: ["#auth"],
      kinds: ["table"],
    });

    expect(selection.models.map((model) => model.name)).toEqual(["User"]);
  });

  it("unions namespace and tag selectors when both appear in include", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Forms {
        model SignUpForm {
          email: string;
        }
      }

      namespace Demo.Users {
        @table
        @Qninhdt.Orm.scope("auth")
        model User {
          @key id: uuid;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const selection = selectModelsForEmitter(runner.program, graph, {
      include: ["Test.Demo.Forms", "#auth"],
      kinds: ["table", "data"],
    });

    expect(selection.models.map((model) => model.name).sort()).toEqual(["SignUpForm", "User"]);
  });

  it("excludes models matched by a tag exclude even when their namespace is included", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        @table
        model User {
          @key id: uuid;
        }

        @table
        @Qninhdt.Orm.scope("audit")
        model AuditLog {
          @key id: uuid;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const selection = selectModelsForEmitter(runner.program, graph, {
      include: ["Test.Demo.Users"],
      exclude: ["#audit"],
      kinds: ["table"],
    });

    expect(selection.models.map((model) => model.name)).toEqual(["User"]);
  });

  it("strict default still raises filtered-dependency when a required dep is omitted", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        @table
        model User {
          @key id: uuid;
        }
      }

      namespace Demo.Projects {
        @table
        model Project {
          @key id: uuid;
          ownerId: uuid;
          @foreignKey("ownerId")
          owner: Demo.Users.User;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const selection = selectModelsForEmitter(runner.program, graph, {
      include: ["Test.Demo.Projects"],
      kinds: ["table"],
    });

    expect(selection.models.map((model) => model.name)).toEqual(["Project"]);
    const codes = runner.program.diagnostics.map((diag) => diag.code);
    expect(codes).toContain("@qninhdt/typespec-orm/filtered-dependency");
  });

  it("autoIncludeDependencies pulls required deps in and silences filtered-dependency", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Shared {
        @tableMixin
        model AuditFields {
          createdAt: utcDateTime;
        }
      }

      namespace Demo.Users {
        @table
        model User {
          ...Demo.Shared.AuditFields;
          @key id: uuid;
        }
      }

      namespace Demo.Projects {
        @table
        model Project {
          ...Demo.Shared.AuditFields;
          @key id: uuid;
          ownerId: uuid;
          @foreignKey("ownerId")
          owner: Demo.Users.User;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const selection = selectModelsForEmitter(runner.program, graph, {
      include: ["Test.Demo.Projects"],
      autoIncludeDependencies: true,
      kinds: ["table", "mixin"],
    });

    expect(selection.models.map((model) => model.name).sort()).toEqual([
      "AuditFields",
      "Project",
      "User",
    ]);
    const codes = runner.program.diagnostics.map((diag) => diag.code);
    expect(codes).not.toContain("@qninhdt/typespec-orm/filtered-dependency");
  });

  it("populates schema, scopes, and version metadata", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @Qninhdt.Orm.schema("audit")
      namespace Demo.Audit {
        @table
        @Qninhdt.Orm.scope("frontend")
        @Qninhdt.Orm.scope("audit")
        model EventLog {
          @key id: uuid;
          @version revision: int32 = 0;
          message: string;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const log = graph.models.find((entry) => entry.name === "EventLog");
    expect(log).toBeDefined();
    expect(log!.schema).toBe("audit");
    expect(log!.scopes.sort()).toEqual(["audit", "frontend"]);
    expect(log!.versionColumn).toBe("revision");
  });

  it("warns when an include list repeats a tag selector", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        @table
        @Qninhdt.Orm.scope("frontend")
        model User {
          @key id: uuid;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    selectModelsForEmitter(runner.program, graph, {
      include: ["#frontend", "#frontend"],
      kinds: ["table"],
    });

    const codes = runner.program.diagnostics.map((diag) => diag.code);
    expect(codes).toContain("@qninhdt/typespec-orm/redundant-include-selector");
  });

  it("pre-resolves enum members onto enum dependencies", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        enum Plan {
          Free,
          Pro,
        }

        @table
        model User {
          @key id: uuid;
          plan: Plan;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    const user = graph.models.find((entry) => entry.name === "User");
    expect(user).toBeDefined();
    const enumDep = user!.dependencies.find((dep) => dep.kind === "enum");
    expect(enumDep).toBeDefined();
    expect(enumDep!.enumMembers).toBeDefined();
    expect(enumDep!.enumMembers!.map((member) => member.name).sort()).toEqual(["Free", "Pro"]);
  });

  it("warns about scopes declared via @scope but never referenced by a selector", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Users {
        @table
        @Qninhdt.Orm.scope("ghost")
        model User {
          @key id: uuid;
        }
      }
    `);

    const graph = normalizeOrmGraph(runner.program);
    selectModelsForEmitter(runner.program, graph, {
      kinds: ["table"],
    });

    const unused = runner.program.diagnostics.filter(
      (diag) => diag.code === "@qninhdt/typespec-orm/unused-scope",
    );
    expect(unused.length).toBeGreaterThan(0);
  });
});
