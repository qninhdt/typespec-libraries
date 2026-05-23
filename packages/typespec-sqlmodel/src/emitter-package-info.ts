import type { EmitContext, Scalar } from "@typespec/compiler";
import { camelToSnake, type NormalizedOrmModel } from "@qninhdt/typespec-orm";
import {
  buildPythonScalarAliasNames,
  collectAliasableScalarsForModels,
} from "./components/PyScalars.jsx";
import type { SqlModelEmitterOptions } from "./lib.js";

export interface PackageInfo {
  dir: string;
  moduleName: string;
  models: { name: string; moduleFile: string }[];
  childPackages: Set<string>;
  includeMetadata: boolean;
  importAssociations: boolean;
}

export interface ScalarGroup {
  topLevel: string;
  scalars: Scalar[];
  aliasNames: Map<Scalar, string>;
}

export function buildPackageInfo(
  models: NormalizedOrmModel[],
  associationDirs: string[],
): Map<string, PackageInfo> {
  const packages = new Map<string, PackageInfo>();

  const ensurePackage = (dir: string, moduleName: string): PackageInfo => {
    const existing = packages.get(dir);
    if (existing) {
      return existing;
    }

    const info: PackageInfo = {
      dir,
      moduleName,
      models: [],
      childPackages: new Set<string>(),
      // Expose `target_metadata = SQLModel.metadata` at every package level,
      // not just single-segment roots. Multi-segment namespace packages
      // (e.g. `foo/bar/baz/__init__.py`) need it too so consumers can
      // `from foo.bar.baz import target_metadata` for Atlas/Alembic. The
      // metadata is a singleton, so re-exporting at nested levels is cheap.
      includeMetadata: true,
      importAssociations: false,
    };
    packages.set(dir, info);
    return info;
  };

  for (const model of models) {
    for (let i = 1; i <= model.namespacePath.length; i++) {
      const dir = model.namespacePath.slice(0, i).join("/");
      ensurePackage(dir, dir.replaceAll("/", "."));
      if (i < model.namespacePath.length) {
        const parentDir = model.namespacePath.slice(0, i).join("/");
        const childName = model.namespacePath[i];
        ensurePackage(parentDir, parentDir.replaceAll("/", ".")).childPackages.add(childName);
      }
    }

    ensurePackage(model.namespaceDir, model.namespace).models.push({
      name: model.model.name,
      moduleFile: camelToSnake(model.model.name),
    });
  }

  for (const dir of associationDirs) {
    ensurePackage(dir, dir.replaceAll("/", ".")).importAssociations = true;
  }

  return packages;
}

export function buildScalarGroups(
  program: EmitContext<SqlModelEmitterOptions>["program"],
  models: NormalizedOrmModel[],
): ScalarGroup[] {
  const byTopLevel = new Map<string, NormalizedOrmModel[]>();
  for (const model of models) {
    const topLevel = model.namespacePath[0];
    if (!topLevel) continue;
    const group = byTopLevel.get(topLevel) ?? [];
    group.push(model);
    byTopLevel.set(topLevel, group);
  }

  return [...byTopLevel.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([topLevel, groupModels]) => {
      const scalars = collectAliasableScalarsForModels(
        program,
        groupModels.map((model) => model.model),
      );
      return {
        topLevel,
        scalars,
        aliasNames: buildPythonScalarAliasNames(program, scalars),
      };
    })
    .filter((group) => group.scalars.length > 0);
}

/**
 * Returns scalars referenced from 2+ top-level namespaces. These get hoisted
 * to a single root-level `_shared/scalars.py`; per-namespace `_scalars.py`
 * re-exports them so import paths stay stable.
 */
export function buildSharedScalars(groups: ScalarGroup[]): Scalar[] {
  const counts = new Map<Scalar, number>();
  for (const group of groups) {
    for (const scalar of group.scalars) {
      counts.set(scalar, (counts.get(scalar) ?? 0) + 1);
    }
  }
  const shared: Scalar[] = [];
  for (const [scalar, count] of counts.entries()) {
    if (count > 1) shared.push(scalar);
  }
  return shared.sort((a, b) => a.name.localeCompare(b.name));
}
