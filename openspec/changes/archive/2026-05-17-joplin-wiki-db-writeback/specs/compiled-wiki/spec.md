## ADDED Requirements

### Requirement: REQ-WIKI-010 Repository wiki_root default path convention

The file `config.yaml.example` SHALL set `wiki_root` to `./wiki_root` as the default relative path, matching the repository-root convention used for `notes_root`.

The repository SHALL document in `README.md` that the `wiki_root/` directory is excluded from version control when `wiki_root/` appears in `.gitignore`.

#### Scenario: SCN-WIKI-EX-01 Example default relative wiki_root

- **WHEN** an operator copies `config.yaml.example` to a new configuration file in the repository root
- **THEN** `wiki_root` resolves to a directory named `wiki_root` at the repository root alongside `./notes_root` when both keys use `./` relative paths

#### Scenario: SCN-WIKI-EX-02 Gitignore documents exclusion

- **WHEN** `.gitignore` contains the entry `wiki_root/`
- **THEN** `README.md` SHALL mention that compiled wiki outputs under `wiki_root/` are not tracked by default

---

### Requirement: REQ-WIKI-011 Wiki frontmatter domain for Joplin writeback routing

The repository SHALL document in `README.md` that a string field `domain` in wiki YAML frontmatter (or the configured `topic_frontmatter_key` from `joplin_wiki_writeback`) selects the child notebook title under the configured parent notebook (default `note-wiki`) when writeback runs.

When `domain` is omitted, writeback routing SHALL fall back to `_uncategorized` per `joplin-wiki-writeback` specification.

#### Scenario: SCN-WIKI-DOMAIN-01 Documentation mentions domain for writeback

- **WHEN** `README.md` describes the `joplin_wiki_writeback` notebook tree
- **THEN** it SHALL mention that `domain` (or the configured `topic_frontmatter_key`) in wiki frontmatter selects the child notebook title
