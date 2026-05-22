import { describe, expect, it } from "vitest";
import { emitPyFile } from "../utils.jsx";

describe("SQLModel emitter end-to-end", () => {
  it("emits a complete table model with field constraints and managed timestamps", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @maxLength(255) name: string;
        @unique contact: email;
        age?: int32;
        @autoCreateTime createdAt: utcDateTime;
        @autoUpdateTime updatedAt: utcDateTime;
      }
    `,
      "user.py",
    );

    expect(output).toContain("class User(SQLModel, table=True):");
    expect(output).toContain('__tablename__: ClassVar[str] = "users"');
    expect(output).toContain("id: UUID = Field(default_factory=uuid4, primary_key=True)");
    expect(output).toContain("name: str = Field(max_length=255");
    expect(output).toContain("contact: EmailStr = Field(unique=True");
    expect(output).toContain("age: int | None = Field(default=None");
    expect(output).toContain("created_at: datetime");
    expect(output).toContain("server_default=func.now()");
    expect(output).toContain("updated_at: datetime");
    expect(output).toContain("onupdate=func.now()");
  });

  it("emits table models with enum columns and bidirectional relationships", async () => {
    const code = `
      enum Status {
        active: "active",
        inactive: "inactive",
      }

      @table
      model User {
        @key id: uuid;
        name: string;
        status: Status;
        @mappedBy("user")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        title: string;
        content: text;
        userId: uuid;
        @foreignKey("user_id")
        @onDelete("CASCADE")
        user: User;
      }
    `;

    const user = await emitPyFile(code, "user.py");
    const post = await emitPyFile(code, "post.py");

    expect(user).toContain("class Status(str, Enum):");
    expect(user).toContain('active = "active"');
    expect(user).toContain("status: Status = Field(");
    expect(user).toContain('SAEnum(Status, name="status")');
    expect(user).toContain("posts: list[Post]");
    expect(user).toContain("Relationship(");
    expect(post).toContain("content: str");
    expect(post).toContain("user_id: UUID = Field(");
    expect(post).toContain('ForeignKey("users.id", ondelete="CASCADE")');
    expect(post).toContain('user: User | None = Relationship(back_populates="posts")');
  });

  it("emits @data model as a Pydantic BaseModel with validation metadata", async () => {
    const output = await emitPyFile(
      `
      model RegisterForm {
        @title("Full Name") @minLength(1) name: string;
        @title("Email") contact: email;
        @title("Password") @minLength(8) password: string;
      }
    `,
      "register_form.py",
    );

    expect(output).toContain("class RegisterForm(BaseModel):");
    expect(output).toContain('"""RegisterForm"""');
    expect(output).toContain('name: str = Field(..., min_length=1, title="Full Name")');
    expect(output).toContain('contact: EmailStr = Field(..., title="Email")');
    expect(output).toContain('password: str = Field(..., min_length=8, title="Password")');
    expect(output).not.toContain("table=True");
    expect(output).not.toContain("__tablename__");
  });

  it("emits @data model references and arrays as DTO types", async () => {
    const output = await emitPyFile(
      `
      namespace App.Shared {
        model PageInfo {
          nextPageToken?: string;
        }
      }

      namespace App.Metadata {
        model NodeView {
          id: uuid;
        }

        model FileView {
          node: NodeView;
          labels: string[];
          page: App.Shared.PageInfo;
          related: NodeView[];
        }
      }
    `,
      "file_view.py",
    );

    expect(output).toContain("from .node_view import NodeView");
    expect(output).toContain("from ..shared.page_info import PageInfo");
    expect(output).toContain("node: NodeView = Field(...)");
    expect(output).toContain("labels: list[str] = Field(...)");
    expect(output).toContain("page: PageInfo = Field(...)");
    expect(output).toContain("related: list[NodeView] = Field(...)");
    expect(output).not.toContain(": Any = Field");
  });

  it("emits composite index and unique table args", async () => {
    const output = await emitPyFile(
      `
      @table
      model Product {
        @key id: uuid;
        name: string;
        email: string;
        code: string;
        version: int32;
        idxNameEmail: composite<"name", "email">;
        @unique
        unqCodeVer: composite<"code", "version">;
      }
    `,
      "product.py",
    );

    expect(output).toContain("__table_args__ = (");
    expect(output).toContain('Index("products_name_email_idx", "name", "email")');
    expect(output).toContain(
      'UniqueConstraint("code", "version", name="products_code_version_unique")',
    );
    expect(output).toContain("from sqlalchemy import Index, UniqueConstraint");
    expect(output).not.toContain("idx_name_email:");
    expect(output).not.toContain("unq_code_ver:");
  });

  it("emits __init__.py with all table model exports", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
      }

      @table
      model Post {
        @key id: uuid;
        title: string;
      }
    `,
      "__init__.py",
    );

    expect(output).toContain('"""models - auto-generated models. DO NOT EDIT."""');
    expect(output).toContain("from .user import User");
    expect(output).toContain("from .post import Post");
    expect(output).toContain("__all__ = [");
    expect(output).toContain('"User"');
    expect(output).toContain('"Post"');
  });

  it("emits standalone package metadata", async () => {
    const code = `
      namespace App.Identity {
        @table
        model User {
          @key id: uuid;
          name: string;
        }
      }
    `;
    const options = {
      standalone: true,
      "library-name": "acme-models",
    };

    const pyproject = await emitPyFile(code, "pyproject.toml", "models", options);
    const init = await emitPyFile(code, "__init__.py", "models", options);
    const user = await emitPyFile(code, "user.py", "models", options);

    expect(pyproject).toContain('name = "acme-models"');
    expect(init).toContain("from .user import User");
    expect(init).toContain('"User"');
    expect(user).toContain("class User(SQLModel, table=True):");
    expect(user).toContain('__tablename__: ClassVar[str] = "users"');
  });
});
