## ADDED Requirements

### Requirement: REQ-LOCAL-IDX-PERSIST-RELATIVE Resolve relative chroma.persist_path against the config file directory

When `chroma.persist_path` in `config.yaml` is a relative filesystem path, `loadConfig` SHALL resolve it to an absolute path by anchoring to the directory containing the loaded configuration file (`path.dirname` of the resolved config path), consistent with how relative `notes_root` is resolved.

`loadConfig` SHALL NOT resolve a relative `chroma.persist_path` using only `process.cwd()`.

#### Scenario: SCN-LOCAL-IDX-PERSIST-RELATIVE-01 Relative persist path uses cfgDir

- **WHEN** configuration is loaded from absolute file `/tmp/proj/cfg.yaml` and `chroma.persist_path` is `./chroma-data`
- **THEN** `AppConfig.chroma.persist_path` equals `/tmp/proj/chroma-data` regardless of `process.cwd()` at `loadConfig` invocation time
