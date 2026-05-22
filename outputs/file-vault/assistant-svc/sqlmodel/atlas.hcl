data "external_schema" "sqlmodel" {
  program = [
    "atlas-provider-sqlalchemy",
    "--path", ".",
    "--dialect", "postgresql"
  ]
}

env "sqlmodel" {
  src = data.external_schema.sqlmodel.url
  dev = "docker://postgres/16/dev?search_path=public"
  migration {
    dir = "file://migrations"
  }
  format {
    migrate {
      diff = "{{ sql . "  " }}"
    }
  }
}
