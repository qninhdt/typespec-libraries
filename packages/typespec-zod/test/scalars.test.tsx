import { describe, expect, it } from "vitest";
import { getOutputFileContent } from "@qninhdt/typespec-orm/testing";
import { emitZodFile, renderZodOutput } from "./utils.jsx";

describe("Zod scalar type mappings", () => {
  it("maps string to z.string()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        name: string;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.string()");
  });

  it("maps boolean to z.boolean()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        active: boolean;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.boolean()");
  });

  it("maps integer types to z.number().int() for 32-bit and z.string().regex for wider", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model IntTest {
        a: int8;
        b: int16;
        c: int32;
        d: int64;
      }
    `,
      "IntTest.ts",
    );

    // 8/16/32-bit integers map to z.number().int()
    expect(output).toContain("z.number()");
    expect(output).toContain(".int()");
    // int64 defaults to "string" strategy: z.string().regex(/^-?\d+$/)
    expect(output).toContain("z.string().regex(/^-?\\d+$/)");
    expect(output).not.toContain("z.bigint()");
  });

  it("maps float types to z.number()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model FloatTest {
        a: float32;
        b: float64;
      }
    `,
      "FloatTest.ts",
    );

    expect(output).toContain("z.number()");
  });

  it("maps decimal to z.number()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Product {
        price: decimal;
      }
    `,
      "Product.ts",
    );

    expect(output).toContain("z.number()");
  });

  it("maps bytes to z.instanceof() with Uint8Array", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        data: bytes;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.instanceof(Uint8Array)");
  });

  it("maps uuid scalar to z.uuid()", async () => {
    const output = await emitZodFile(
      `
      scalar uuid extends string;

      @data("Form")
      model User {
        id: uuid;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.uuid()");
    expect(output).not.toContain("z.string().uuid()");
  });

  it("maps plainDate to z.coerce.date()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        birthDate: plainDate;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.coerce.date()");
  });

  it("maps plainTime to z.iso.time()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        time: plainTime;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.iso.time()");
    expect(output).not.toContain("z.string().time()");
  });

  it("maps utcDateTime to z.coerce.date()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        createdAt: utcDateTime;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.coerce.date()");
  });

  it("maps duration to z.iso.duration()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Task {
        duration: duration;
      }
    `,
      "Task.ts",
    );

    expect(output).toContain("z.iso.duration()");
    expect(output).not.toContain("z.string().duration()");
  });

  it("maps safeint to z.number().int().safe()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        age: safeint;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.number()");
    expect(output).toContain(".int()");
    expect(output).toContain(".safe()");
  });
});

describe("Zod optional fields", () => {
  it("generates .optional() for optional fields", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        name: string;
        bio?: string;
      }
    `,
      "User.ts",
    );

    // bio field should have .optional()
    const bioIndex = output.indexOf("bio:");
    expect(bioIndex).toBeGreaterThan(-1);
    const bioSection = output.slice(bioIndex, bioIndex + 50);
    expect(bioSection).toContain(".optional()");
  });

  it("generates .default() for fields with default values", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        enabled: boolean = true;
        count: int32 = 0;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".default(");
  });

  it("preserves empty string default values", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        displayName: string = "";
      }
    `,
      "User.ts",
    );

    expect(output).toContain('displayName: z.string().default("")');
  });

  it("matches numeric default literals to the emitted schema type", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        count: int32 = 0;
        total: int64 = 42;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".default(0)");
    // int64 default under "string" int64-strategy renders as JSON string literal
    expect(output).toContain('.default("42")');
    expect(output).not.toContain(".default(0n)");
    expect(output).not.toContain(".default(42n)");
  });
});

describe("Zod semantic scalars", () => {
  it("maps email to z.email()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        contact: email;
      }
    `,
      "User.ts",
    );

    expect(output).toContain("z.email()");
    expect(output).not.toContain("z.string().email()");
  });

  it("maps ipv4 to z.ipv4()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Server {
        addr: ipv4;
      }
    `,
      "Server.ts",
    );

    expect(output).toContain("z.ipv4()");
    expect(output).not.toContain("z.string().ipv4()");
  });

  it("maps ipv6 to z.ipv6()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Server {
        addr: ipv6;
      }
    `,
      "Server.ts",
    );

    expect(output).toContain("z.ipv6()");
    expect(output).not.toContain("z.string().ipv6()");
  });

  it("maps ip to z.union of ipv4 and ipv6", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Server {
        addr: ip;
      }
    `,
      "Server.ts",
    );

    expect(output).toContain("z.union(");
    expect(output).toContain("z.ipv4()");
    expect(output).toContain("z.ipv6()");
    expect(output).not.toContain("z.string().ip()");
  });

  it("maps url to z.url()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Link {
        href: url;
      }
    `,
      "Link.ts",
    );

    expect(output).toContain("z.url()");
    expect(output).not.toContain("z.string().url()");
  });

  it("maps cidr to z.cidr()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Network {
        subnet: cidr;
      }
    `,
      "Network.ts",
    );

    expect(output).toContain("z.cidr()");
    expect(output).not.toContain("z.string().cidr()");
  });

  it("maps base64 to z.base64()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Attachment {
        content: base64;
      }
    `,
      "Attachment.ts",
    );

    expect(output).toContain("z.base64()");
    expect(output).not.toContain("z.string().base64()");
  });

  it("does not add extra regex for email scalar", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model User {
        contact: email;
      }
    `,
      "User.ts",
    );

    expect(output).toContain(".email()");
    expect(output).not.toContain(".regex(");
    expect(output).not.toContain(".describe(");
  });

  it("emits branded alias with regex for mac scalar", async () => {
    const output = await renderZodOutput(
      `
      @data("Form")
      model Device {
        macAddr: mac;
      }
    `,
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "Device.ts");

    expect(scalarsFile).toContain("export const macSchema = z");
    expect(scalarsFile).toContain(".string()");
    expect(scalarsFile).toContain(".regex(");
    expect(scalarsFile).toContain('.brand("mac")');
    expect(scalarsFile).not.toContain(".mac(");
    expect(modelFile).toContain('import { macSchema } from "./_scalars.js";');
    expect(modelFile).toContain("macAddr: macSchema");
  });

  it("maps cuid to z.cuid()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Resource {
        id: cuid;
      }
    `,
      "Resource.ts",
    );

    expect(output).toContain("z.cuid()");
    expect(output).not.toContain("z.string().cuid()");
  });

  it("maps cuid2 to z.cuid2()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Resource {
        id: cuid2;
      }
    `,
      "Resource.ts",
    );

    expect(output).toContain("z.cuid2()");
    expect(output).not.toContain("z.string().cuid2()");
  });

  it("maps ulid to z.ulid()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Resource {
        id: ulid;
      }
    `,
      "Resource.ts",
    );

    expect(output).toContain("z.ulid()");
    expect(output).not.toContain("z.string().ulid()");
  });

  it("maps nanoid to z.nanoid()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Resource {
        id: nanoid;
      }
    `,
      "Resource.ts",
    );

    expect(output).toContain("z.nanoid()");
    expect(output).not.toContain("z.string().nanoid()");
  });

  it("maps jwt to z.jwt()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Auth {
        token: jwt;
      }
    `,
      "Auth.ts",
    );

    expect(output).toContain("z.jwt()");
    expect(output).not.toContain("z.string().jwt()");
  });

  it("maps emoji to z.emoji()", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Reaction {
        icon: emoji;
      }
    `,
      "Reaction.ts",
    );

    expect(output).toContain("z.emoji()");
    expect(output).not.toContain("z.string().emoji()");
  });

  it("does not add extra regex for cuid scalar", async () => {
    const output = await emitZodFile(
      `
      @data("Form")
      model Resource {
        id: cuid;
      }
    `,
      "Resource.ts",
    );

    expect(output).toContain(".cuid()");
    expect(output).not.toContain(".regex(");
  });
});

describe("Zod user-defined scalars", () => {
  it("emits user-defined scalar as named declaration with .brand()", async () => {
    const output = await renderZodOutput(
      `
      @minValue(18)
      scalar AdultAge extends int32;

      @data("Form")
      model RegistrationForm {
        age: AdultAge;
      }
    `,
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "RegistrationForm.ts");

    expect(scalarsFile).toContain("export const AdultAgeSchema = z.number().int()");
    expect(scalarsFile).toContain('.brand("AdultAge")');
    expect(scalarsFile).toContain(".gte(18)");
    expect(modelFile).toContain("age: AdultAgeSchema");
  });

  it("emits user-defined string scalar with constraints and .brand()", async () => {
    const output = await renderZodOutput(
      `
      @minLength(8)
      @maxLength(128)
      scalar StrongPassword extends string;

      @data("Form")
      model LoginForm {
        password: StrongPassword;
      }
    `,
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "LoginForm.ts");

    expect(scalarsFile).toContain("export const StrongPasswordSchema = z");
    expect(scalarsFile).toContain(".string()");
    expect(scalarsFile).toContain(".min(8)");
    expect(scalarsFile).toContain(".max(128)");
    expect(scalarsFile).toContain('.brand("StrongPassword")');
    expect(modelFile).toContain("password: StrongPasswordSchema");
  });

  it("references user-defined scalar by name in fields", async () => {
    const output = await renderZodOutput(
      `
      @minValue(18) @maxValue(150)
      scalar AdultAge extends int32;

      @data("Form")
      model Profile {
        name: string;
        age: AdultAge;
      }
    `,
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "Profile.ts");

    expect(scalarsFile).toContain("export const AdultAgeSchema =");
    expect(modelFile).toContain('import { AdultAgeSchema } from "./_scalars.js";');
    expect(modelFile).toContain("age: AdultAgeSchema");
  });

  it("emits user-defined scalar extending float64 with constraints", async () => {
    const output = await renderZodOutput(
      `
      @minValue(0) @maxValue(100)
      scalar Percentage extends float64;

      @data("Form")
      model Stats {
        completion: Percentage;
      }
    `,
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "Stats.ts");

    expect(scalarsFile).toContain("export const PercentageSchema = z");
    expect(scalarsFile).toContain(".number()");
    expect(scalarsFile).toContain(".nonnegative()");
    expect(scalarsFile).toContain(".lte(100)");
    expect(scalarsFile).toContain('.brand("Percentage")');
    expect(modelFile).toContain("completion: PercentageSchema");
  });

  it("emits user-defined scalar with @pattern and .brand()", async () => {
    const output = await renderZodOutput(
      `
      @pattern("^[A-Z]{2}-[0-9]{4}$")
      scalar ProductCode extends string;

      @data("Form")
      model Product {
        code: ProductCode;
      }
    `,
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "Product.ts");

    expect(scalarsFile).toContain("export const ProductCodeSchema =");
    expect(scalarsFile).toContain(".string()");
    expect(scalarsFile).toContain(".regex(");
    expect(scalarsFile).toContain("^[A-Z]{2}-[0-9]{4}$");
    expect(scalarsFile).toContain('.brand("ProductCode")');
    expect(modelFile).toContain("code: ProductCodeSchema");
  });
});

describe("Zod user-defined scalar constraint overrides", () => {
  it("property narrows scalar's maxValue", async () => {
    const output = await renderZodOutput(
      `
      @minValue(0) @maxValue(150)
      scalar Age extends int32;

      @data("Form")
      model Player {
        @maxValue(13) age: Age;
      }
    `,
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "Player.ts");

    expect(scalarsFile).toContain(
      "export const AgeSchema = z.number().int().nonnegative().lte(150)",
    );
    expect(modelFile).toContain("AgeSchema.lte(13)");
    expect(modelFile).not.toContain("lte(150)");
  });

  it("property adds constraint not present on scalar", async () => {
    const output = await renderZodOutput(
      `
      @minValue(0)
      scalar PositiveInt extends int32;

      @data("Form")
      model Bounded {
        @maxValue(100) value: PositiveInt;
      }
    `,
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "Bounded.ts");

    expect(scalarsFile).toContain("export const PositiveIntSchema = z");
    expect(scalarsFile).toContain(".number()");
    expect(scalarsFile).toContain(".int()");
    expect(scalarsFile).toContain(".nonnegative()");
    expect(modelFile).toContain("PositiveIntSchema");
    expect(modelFile).toContain(".lte(100)");
  });

  it("property narrows string scalar's maxLength", async () => {
    const output = await renderZodOutput(
      `
      @minLength(1) @maxLength(255)
      scalar ShortText extends string;

      @data("Form")
      model Comment {
        @maxLength(100) body: ShortText;
      }
    `,
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "Comment.ts");

    expect(scalarsFile).toContain("export const ShortTextSchema = z.string().min(1).max(255)");
    expect(modelFile).toContain("ShortTextSchema.max(100)");
    expect(modelFile).not.toContain("max(255)");
  });

  it("imports root scalar declarations from nested model files", async () => {
    const output = await renderZodOutput(
      `
      @minLength(8)
      scalar StrongPassword extends string;

      @data("Form")
      model LoginForm {
        password: StrongPassword;
      }
    `,
      "forms/auth",
    );
    const scalarsFile = getOutputFileContent(output, "_scalars.ts");
    const modelFile = getOutputFileContent(output, "forms/auth/LoginForm.ts");

    expect(scalarsFile).toContain("export const StrongPasswordSchema");
    expect(modelFile).toContain('import { StrongPasswordSchema } from "../../_scalars.js";');
    expect(modelFile).toContain("password: StrongPasswordSchema");
    expect(modelFile).not.toContain("<Unresolved Symbol");
  });
});
