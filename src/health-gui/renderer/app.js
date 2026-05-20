function createSingleFlight(fn) {
  let busy = false;
  return async () => {
    if (busy) return { skipped: true };
    busy = true;
    try {
      return { skipped: false, result: await fn() };
    } finally {
      busy = false;
    }
  };
}

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

/**
 * @param {typeof window.jbHealth} jbApi
 * @param {"init" | "corpus"} mode
 */
function bindPipelineProgressUi(jbApi, mode) {
  const wrap = document.getElementById("pipeline-progress-wrap");
  const live = document.getElementById("pipeline-progress-live");
  const list = document.getElementById("pipeline-step-list");
  const hint = document.getElementById("pipeline-progress-hint");
  const subscribe =
    jbApi && typeof jbApi === "object" && "subscribePipelineProgress" in jbApi
      ? /** @type {{ subscribePipelineProgress?: (fn: (data: unknown) => void) => () => void }} */ (
          jbApi
        ).subscribePipelineProgress
      : undefined;
  if (!wrap || !live || !list || typeof subscribe !== "function") {
    return () => {};
  }

  wrap.classList.remove("hidden");
  live.textContent = "";
  list.innerHTML = "";
  if (hint) hint.textContent = "執行進度（即時輸出）";
  const compileMode =
    /** @type {HTMLSelectElement | null} */ (document.getElementById("compile-mode"))?.value === "agent"
      ? "agent"
      : "local";
  const compileText = compileMode === "agent" ? "agent-compile（Codex）" : "wiki-compile";

  const steps =
    mode === "init"
      ? [
          { id: "sqlite", text: "SQLite 匯出（若需要）" },
          ...(compileMode === "agent"
            ? []
            : [{ id: "index", text: "index（向量索引）" }]),
          { id: "wiki", text: compileText },
        ]
      : [
          ...(compileMode === "agent"
            ? []
            : [{ id: "index", text: "index（向量索引）" }]),
          { id: "wiki", text: compileText },
        ];

  /** @type {Record<string, HTMLLIElement>} */
  const liById = {};
  for (const s of steps) {
    const li = document.createElement("li");
    li.className = "pending";
    li.textContent = s.text;
    li.dataset.stepId = s.id;
    list.appendChild(li);
    liById[s.id] = li;
  }

  function setStepState(stepId, state) {
    const li = liById[stepId];
    if (li) li.className = state;
  }

  function mapPhaseToStepId(phase) {
    if (phase === "sqlite-sync") return "sqlite";
    if (phase === "index") return "index";
    if (phase === "wiki-compile") return "wiki";
    if (phase === "agent-compile") return "wiki";
    return null;
  }

  function appendLive(text) {
    live.textContent = (live.textContent + text).slice(-20000);
    live.scrollTop = live.scrollHeight;
  }

  const unsub = subscribe((raw) => {
    const ev = /** @type {{ kind?: string, message?: string, phase?: string, label?: string, channel?: string, text?: string, exitCode?: number | null, spawnFailed?: boolean }} */ (
      raw && typeof raw === "object" ? raw : {}
    );
    if (ev.kind === "precheck" && hint) {
      hint.textContent = ev.message ?? "";
      return;
    }
    if (ev.kind === "sqlite_skipped") {
      const li = liById["sqlite"];
      if (li) li.textContent = "SQLite 匯出（略過）";
      setStepState("sqlite", "done");
      appendLive(`— ${ev.message ?? ""}\n`);
      return;
    }
    if (ev.kind === "phase_start") {
      const sid = mapPhaseToStepId(/** @type {string} */ (ev.phase));
      if (sid) setStepState(sid, "run");
      appendLive(`\n▶ ${ev.label ?? ev.phase}\n`);
      return;
    }
    if (ev.kind === "phase_stream") {
      const line = ev.text ?? "";
      if (line === "") return;
      const prefix = ev.channel === "stderr" ? "err: " : "";
      appendLive(`${prefix}${line}\n`);
      return;
    }
    if (ev.kind === "phase_end") {
      const sid = mapPhaseToStepId(/** @type {string} */ (ev.phase));
      if (!sid) return;
      const ok = ev.exitCode === 0 && !ev.spawnFailed;
      setStepState(sid, ok ? "done" : "bad");
    }
  });

  return () => {
    unsub();
    wrap.classList.add("hidden");
  };
}

/** @type {unknown} */
let lastHealthSnap = null;

/** @param {unknown} snap */
function applyHealthSnapshot(snap) {
  lastHealthSnap = snap;
  el("health-json").textContent = JSON.stringify(snap, null, 2);
  renderConnectionLabels(lastHealthSnap);
  syncDependencyButtons(lastHealthSnap);
}

/**
 * @param {typeof window.jbHealth} jbApi
 * @param {"chroma-server" | "ollama-serve"} kind
 * @param {number} [maxWaitMs]
 */
async function pollUntilDependencyReachable(jbApi, kind, maxWaitMs = 25000) {
  const start = Date.now();
  const intervalMs = 500;
  while (Date.now() - start < maxWaitMs) {
    const snap = await jbApi.checkHealth();
    if (snap && typeof snap === "object" && snap.ok === true) {
      if (kind === "chroma-server" && snap.chroma?.reachable === true) {
        applyHealthSnapshot(snap);
        return true;
      }
      if (kind === "ollama-serve" && snap.ollama?.reachable === true) {
        applyHealthSnapshot(snap);
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function buildPullText(snap) {
  if (!snap || typeof snap !== "object") return "";
  const rec = /** @type {{ ok?: boolean, ollama?: { missingModels?: string[] } }} */ (
    snap
  );
  if (!rec.ok) return "";
  const mm = rec.ollama?.missingModels;
  if (!mm?.length) return "";
  return mm.map((m) => `ollama pull ${m}`).join("\n");
}

function buildChromaHint(snap) {
  if (!snap || typeof snap !== "object") return "";
  const rec = /** @type {{ ok?: boolean, chroma?: { reachable?: boolean, persistPath?: string, host?: string, port?: number } }} */ (
    snap
  );
  if (!rec.ok || !rec.chroma || rec.chroma.reachable) return "";
  const p = rec.chroma.persistPath ?? "";
  const host = rec.chroma.host ?? "127.0.0.1";
  const port = rec.chroma.port ?? 8000;
  return `pnpm exec chroma run --path ${p} --host ${host} --port ${port}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function renderConnectionLabels(snap) {
  const o = document.getElementById("dep-line-ollama");
  const c = document.getElementById("dep-line-chroma");
  if (!o || !c) return;
  if (snap == null) {
    o.textContent = "Ollama：請按「重新整理」以顯示連線狀態";
    c.textContent = "Chroma：請按「重新整理」以顯示連線狀態";
    return;
  }
  if (typeof snap !== "object" || snap.ok !== true) {
    o.textContent = "Ollama：（無法判定，請檢查 config）";
    c.textContent = "Chroma：（無法判定，請檢查 config）";
    return;
  }
  const rec = /** @type {{ ollama?: { reachable?: boolean }, chroma?: { reachable?: boolean } }} */ (
    snap
  );
  const or = rec.ollama?.reachable === true;
  const cr = rec.chroma?.reachable === true;
  o.textContent = or ? "Ollama：已連線" : "Ollama：未連線";
  c.textContent = cr ? "Chroma：已連線" : "Chroma：未連線";
}

function syncDependencyButtons(snap) {
  const bo = document.getElementById("btn-start-ollama");
  const bc = document.getElementById("btn-start-chroma");
  if (!bo || !bc) return;
  const okSnap = snap && typeof snap === "object" && snap.ok === true;
  const oReach =
    okSnap && /** @type {{ ollama?: { reachable?: boolean } }} */ (snap).ollama?.reachable === true;
  const cReach =
    okSnap && /** @type {{ chroma?: { reachable?: boolean } }} */ (snap).chroma?.reachable === true;
  bo.disabled = !!oReach;
  bc.disabled = !!cReach;
}

async function init() {
  const jb = window.jbHealth;
  if (!jb) {
    el("meta-line").textContent = "preload 未就緒（jbHealth 不可用）";
    return;
  }

  const meta = await jb.getMeta();
  el("meta-line").textContent = `config: ${meta.configPath} · repo: ${meta.repoRoot} · CHROMA_HOST=${meta.chromaHost} PORT=${meta.chromaPort}`;

  const fieldsRes = await jb.loadConfigFields();
  if (!fieldsRes.ok) {
    el("save-msg").textContent = `無法載入設定：${fieldsRes.message ?? fieldsRes.code}`;
  } else {
    const f = fieldsRes.fields;
    const form = /** @type {HTMLFormElement} */ (document.getElementById("cfg-form"));
    form.notes_root.value = f.notes_root;
    form.ollama_base_url.value = f.ollama_base_url;
    form.ollama_embed_model.value = f.ollama_embed_model;
    form.ollama_chat_model.value = f.ollama_chat_model;
    form.chroma_persist_path.value = f.chroma_persist_path;
  }

  const runHealth = createSingleFlight(() => jb.checkHealth());

  async function refresh() {
    const st = el("refresh-status");
    st.textContent = "";
    const r = await runHealth();
    if (r.skipped) {
      st.textContent = "略過（上一輪尚在進行）";
      return;
    }
    lastHealthSnap = r.result;
    applyHealthSnapshot(lastHealthSnap);
  }

  el("btn-refresh").addEventListener("click", () => {
    refresh().catch((e) => {
      el("health-json").textContent = String(e);
    });
  });

  el("btn-copy-pull").addEventListener("click", async () => {
    const t = buildPullText(lastHealthSnap);
    if (!t) {
      el("refresh-status").textContent = "目前無缺模型可複製";
      return;
    }
    const ok = await copyToClipboard(t);
    el("refresh-status").textContent = ok ? "已複製 ollama pull" : "複製失敗（瀏覽器權限）";
  });

  el("btn-copy-chroma").addEventListener("click", async () => {
    const t = buildChromaHint(lastHealthSnap);
    if (!t) {
      el("refresh-status").textContent = "Chroma 已連線或尚無建議文字";
      return;
    }
    const ok = await copyToClipboard(t);
    el("refresh-status").textContent = ok ? "已複製 Chroma 建議指令" : "複製失敗（瀏覽器權限）";
  });

  document.getElementById("cfg-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = /** @type {HTMLFormElement} */ (ev.target);
    const msg = el("save-msg");
    msg.textContent = "儲存中…";
    const body = {
      notes_root: form.notes_root.value.trim(),
      ollama_base_url: form.ollama_base_url.value.trim(),
      ollama_embed_model: form.ollama_embed_model.value.trim(),
      ollama_chat_model: form.ollama_chat_model.value.trim(),
      chroma_persist_path: form.chroma_persist_path.value.trim(),
    };
    const res = await jb.saveConfigFields(body);
    if (!res.ok) {
      msg.textContent = `失敗：${res.message ?? res.code}`;
    } else {
      msg.textContent = "已儲存並通過 loadConfig 驗證。";
      await refresh();
    }
  });

  async function loadNotebooks() {
    const box = el("notebook-list");
    const st = el("notebook-filter-status");
    st.textContent = "載入中…";
    box.innerHTML = "";
    const res = await jb.listNotebooks();
    if (!res.ok) {
      st.textContent = `載入失敗：${res.message ?? res.code}`;
      return;
    }
    const selected = new Set(res.selectedIds ?? []);
    renderNotebookTree(box, res.notebooks ?? [], selected);
    st.textContent = `已載入 ${(res.notebooks ?? []).length} 個筆記本`;
  }

  el("btn-load-notebooks").addEventListener("click", () => {
    loadNotebooks().catch((e) => {
      el("notebook-filter-status").textContent = String(e);
    });
  });

  el("btn-save-notebooks").addEventListener("click", async () => {
    const ids = [...document.querySelectorAll("#notebook-list input[type=checkbox]:checked")].map(
      (x) => /** @type {HTMLInputElement} */ (x).value,
    );
    const res = await jb.saveNotebookFilter({ ids });
    el("notebook-filter-status").textContent = res.ok
      ? `已儲存 ${ids.length} 個筆記本`
      : `儲存失敗：${res.message ?? res.code}`;
  });

  el("btn-check-all-notebooks").addEventListener("click", () => {
    setAllNotebookChecks(true);
  });

  el("btn-clear-notebooks").addEventListener("click", () => {
    setAllNotebookChecks(false);
  });

  el("btn-expand-notebooks").addEventListener("click", () => {
    document.querySelectorAll("#notebook-list details").forEach((d) => {
      /** @type {HTMLDetailsElement} */ (d).open = true;
    });
  });

  el("btn-collapse-notebooks").addEventListener("click", () => {
    document.querySelectorAll("#notebook-list details").forEach((d) => {
      /** @type {HTMLDetailsElement} */ (d).open = false;
    });
  });

  /**
   * @param {HTMLElement} root
   * @param {Array<{ id: string, parent_id?: string, title?: string, path?: string, slug?: string }>} notebooks
   * @param {Set<string>} selected
   */
  function renderNotebookTree(root, notebooks, selected) {
    const byParent = new Map();
    const byId = new Set(notebooks.map((n) => n.id));
    for (const nb of notebooks) {
      const parent = nb.parent_id && byId.has(nb.parent_id) ? nb.parent_id : "";
      const arr = byParent.get(parent) ?? [];
      arr.push(nb);
      byParent.set(parent, arr);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => String(a.path ?? a.title ?? "").localeCompare(String(b.path ?? b.title ?? ""), "zh-Hant"));
    }
    const tree = document.createElement("ul");
    for (const nb of byParent.get("") ?? []) tree.appendChild(renderNotebookNode(nb, byParent, selected));
    root.appendChild(tree);
    root.onchange = (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
      const li = input.closest("li");
      if (li) {
        li.querySelectorAll("input[type=checkbox]").forEach((child) => {
          /** @type {HTMLInputElement} */ (child).checked = input.checked;
          /** @type {HTMLInputElement} */ (child).indeterminate = false;
        });
      }
      updateNotebookIndeterminate(root);
    };
    updateNotebookIndeterminate(root);
  }

  /**
   * @param {{ id: string, title?: string, path?: string, slug?: string }} nb
   * @param {Map<string, Array<{ id: string, title?: string, path?: string, slug?: string }>>} byParent
   * @param {Set<string>} selected
   */
  function renderNotebookNode(nb, byParent, selected) {
    const li = document.createElement("li");
    const children = byParent.get(nb.id) ?? [];
    const row = notebookRow(nb, selected);
    if (children.length > 0) {
      const details = document.createElement("details");
      details.open = true;
      const summary = document.createElement("summary");
      summary.appendChild(row);
      details.appendChild(summary);
      const ul = document.createElement("ul");
      for (const child of children) ul.appendChild(renderNotebookNode(child, byParent, selected));
      details.appendChild(ul);
      li.appendChild(details);
    } else {
      li.appendChild(row);
    }
    return li;
  }

  /**
   * @param {{ id: string, title?: string, path?: string, slug?: string }} nb
   * @param {Set<string>} selected
   */
  function notebookRow(nb, selected) {
    const label = document.createElement("label");
    label.className = "notebook-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = nb.id;
    input.checked = selected.has(nb.id);
    input.addEventListener("click", (ev) => ev.stopPropagation());
    label.appendChild(input);
    label.appendChild(document.createTextNode(String(nb.title ?? nb.path ?? nb.id)));
    const slug = document.createElement("span");
    slug.className = "notebook-slug";
    slug.textContent = String(nb.slug ?? "");
    label.appendChild(slug);
    label.title = String(nb.path ?? nb.title ?? nb.id);
    return label;
  }

  /**
   * @param {HTMLElement} root
   */
  function updateNotebookIndeterminate(root) {
    const items = [...root.querySelectorAll("li")].reverse();
    for (const li of items) {
      const own = li.querySelector(":scope > details > summary input[type=checkbox], :scope > label input[type=checkbox]");
      if (!(own instanceof HTMLInputElement)) continue;
      const childInputs = [...li.querySelectorAll(":scope ul input[type=checkbox]")].filter(
        (x) => x instanceof HTMLInputElement,
      );
      if (childInputs.length === 0) continue;
      const checked = childInputs.filter((x) => /** @type {HTMLInputElement} */ (x).checked).length;
      own.indeterminate = checked > 0 && checked < childInputs.length;
      own.checked = checked === childInputs.length;
    }
  }

  function setAllNotebookChecks(checked) {
    document.querySelectorAll("#notebook-list input[type=checkbox]").forEach((input) => {
      /** @type {HTMLInputElement} */ (input).checked = checked;
      /** @type {HTMLInputElement} */ (input).indeterminate = false;
    });
  }

  function appendStackLog(title, res) {
    const pre = el("stack-log");
    const chunk = `\n--- ${title} ---\nexit=${res.exitCode} ok=${res.ok} code=${res.code}\nstdout (tail):\n${res.stdoutTail || ""}\nstderr (tail):\n${res.stderrTail || ""}\n`;
    pre.textContent = (pre.textContent + chunk).slice(-12000);
  }

  el("btn-install-stack").addEventListener("click", async () => {
    if (
      !confirm(
        "將執行 scripts/launchd/install-joplin-brain-stack.sh 安裝 LaunchAgents，確定？",
      )
    )
      return;
    const res = await jb.runStackScript({
      kind: "install-stack",
      confirmed: true,
    });
    appendStackLog("install-stack", res);
  });

  el("btn-uninstall-stack").addEventListener("click", async () => {
    if (
      !confirm(
        "將執行 scripts/launchd/uninstall-joplin-brain-stack.sh 解除 LaunchAgents，確定？（不刪除資料目錄）",
      )
    )
      return;
    const res = await jb.runStackScript({
      kind: "uninstall-stack",
      confirmed: true,
    });
    appendStackLog("uninstall-stack", res);
  });

  renderConnectionLabels(null);
  syncDependencyButtons(null);

  const runStartOllama = createSingleFlight(() =>
    jb.startLocalDependency({ kind: "ollama-serve", confirmed: true }),
  );
  const runStartChroma = createSingleFlight(() =>
    jb.startLocalDependency({ kind: "chroma-server", confirmed: true }),
  );

  function formatDepResult(res) {
    if (!res || typeof res !== "object") return "無效回應";
    if (res.ok === true)
      return `已送出啟動（pid=${res.pid ?? "?"}）；介面將自動輪詢連線狀態。`;
    const code = /** @type {{ code?: string, message?: string }} */ (res).code;
    const msg = /** @type {{ message?: string }} */ (res).message;
    if (code === "ALREADY_RUNNING") return "探測為已連線，未重複啟動。";
    if (code === "SKIPPED_IN_FLIGHT") return "略過（上一輪啟動尚在進行）。";
    if (code === "SPAWN_ERROR") return `啟動失敗：${msg ?? code}`;
    return `${code ?? "錯誤"}${msg ? ` — ${msg}` : ""}`;
  }

  el("btn-start-ollama").addEventListener("click", async () => {
    if (
      !confirm(
        "將於背景啟動「ollama serve」（detached）。關閉 Health GUI 後行程仍可能繼續執行；stdout／stderr 不會顯示在本視窗。確定？",
      )
    )
      return;
    const st = el("refresh-status");
    const r = await runStartOllama();
    if (r.skipped) {
      st.textContent = "略過（上一輪尚在進行）";
      return;
    }
    const res = r.result;
    if (!res || typeof res !== "object" || !("ok" in res) || res.ok !== true) {
      st.textContent = formatDepResult(
        /** @type {Parameters<typeof formatDepResult>[0]} */ (res),
      );
      return;
    }
    const pid = "pid" in res ? res.pid : undefined;
    st.textContent = "啟動已送出，正在等待連線…";
    const up = await pollUntilDependencyReachable(jb, "ollama-serve");
    st.textContent = up
      ? "Ollama 已連線。"
      : `已送出啟動（pid=${pid ?? "?"}），約 25s 內仍未連線；請查日誌或按「重新整理」。`;
  });

  el("btn-start-chroma").addEventListener("click", async () => {
    if (
      !confirm(
        "將於背景啟動「pnpm exec chroma run …」（detached，argv 與 scripts/launchd/run-chroma.sh 同源語意）。關閉 GUI 後行程仍可能繼續；輸出不會顯示在本視窗。確定？",
      )
    )
      return;
    const st = el("refresh-status");
    const r = await runStartChroma();
    if (r.skipped) {
      st.textContent = "略過（上一輪尚在進行）";
      return;
    }
    const res = r.result;
    if (!res || typeof res !== "object" || !("ok" in res) || res.ok !== true) {
      st.textContent = formatDepResult(
        /** @type {Parameters<typeof formatDepResult>[0]} */ (res),
      );
      return;
    }
    const pid = "pid" in res ? res.pid : undefined;
    st.textContent = "啟動已送出，正在等待連線…";
    const up = await pollUntilDependencyReachable(jb, "chroma-server");
    st.textContent = up
      ? "Chroma 已連線。"
      : `已送出啟動（pid=${pid ?? "?"}），約 25s 內仍未連線；請查日誌或按「重新整理」。`;
  });

  function appendPipelineLog(res, runLabel) {
    const pre = el("corpus-log");
    const rec = /** @type {{ ok?: boolean, code?: string, message?: string }} */ (res);
    let chunk = `\n--- ${runLabel} ---\nok=${rec.ok} code=${rec.code ?? ""}\n`;
    if (rec.message) chunk += `message: ${rec.message}\n`;

    const maybeSq =
      res && typeof res === "object" && res !== null && "sqliteSync" in res
        ? /** @type {{ sqliteSync?: object }} */ (res).sqliteSync
        : null;
    if (maybeSq && typeof maybeSq === "object") {
      const s = /** @type {{ skipped?: boolean, exitCode?: number | null, stdoutTail?: string, stderrTail?: string }} */ (
        maybeSq
      );
      chunk += `sqlite-sync skipped=${s.skipped === true} exit=${s.exitCode}\nsqlite-sync stdout (tail):\n${s.stdoutTail ?? ""}\nsqlite-sync stderr (tail):\n${s.stderrTail ?? ""}\n`;
    }

    const idx = /** @type {{ exitCode?: number | null, stdoutTail?: string, stderrTail?: string }} */ (
      res && typeof res === "object" && res !== null && "index" in res
        ? /** @type {{ index: object }} */ (res).index
        : {}
    );
    const wiki = /** @type {{ exitCode?: number | null, stdoutTail?: string, stderrTail?: string }} */ (
      res && typeof res === "object" && res !== null && "wikiCompile" in res
        ? /** @type {{ wikiCompile: object }} */ (res).wikiCompile
        : {}
    );
    chunk += `index exit=${idx.exitCode}\nindex stdout (tail):\n${idx.stdoutTail ?? ""}\nindex stderr (tail):\n${idx.stderrTail ?? ""}\nwiki-compile exit=${wiki.exitCode}\nwiki stdout (tail):\n${wiki.stdoutTail ?? ""}\nwiki stderr (tail):\n${wiki.stderrTail ?? ""}\n`;
    pre.textContent = (pre.textContent + chunk).slice(-12000);
  }

  function setPipelineButtonsDisabled(disabled) {
    /** @type {HTMLButtonElement} */ (el("btn-run-init")).disabled = disabled;
    /** @type {HTMLButtonElement} */ (el("btn-run-corpus")).disabled = disabled;
  }

  const selectedCompileMode = () =>
    /** @type {HTMLSelectElement} */ (el("compile-mode")).value === "agent" ? "agent" : "local";
  const initConfirmText = (mode) =>
    mode === "agent"
      ? "初始化管線：若 notes_root 無 .md，先執行 sqlite-sync --export-only（僅匯出，不接續 config 內 pipeline），再由 Codex Agent 執行 agent-compile，讀取 notes_root 並寫入 wiki_root。此模式需要本機已登入的 codex exec，不使用 OpenAI API；不會在此步驟執行 index 或 wiki-compile。若設定啟用 Joplin wiki 寫回，agent-compile 成功後會經本機 Data API 更新 @llm-wiki/wiki，並同步 brainstorming、artifacts。確定執行？"
      : "初始化管線：若 notes_root 無 .md，先執行 sqlite-sync --export-only（僅匯出，不接續 config 內 pipeline），再執行 index 與 wiki-compile（需 Ollama／Chroma）。寫回若啟用可能影響 Joplin。確定執行？";
  const corpusConfirmText = (mode) =>
    mode === "agent"
      ? "將執行 agent-compile（不會自動匯出 SQLite；可能耗時數分鐘）。此模式需要本機已登入的 codex exec，會讀取 notes_root 並寫入 wiki_root，不使用 OpenAI API。若設定啟用 Joplin wiki 寫回，成功後會經本機 Data API 更新 @llm-wiki/wiki，並同步 brainstorming、artifacts。若 notes_root 尚無 .md，請改用「初始化」按鈕或先手動 sqlite-sync。確定執行？"
      : "將依序執行「pnpm exec joplin-llm-wiki index」與「wiki-compile」（不會自動匯出 SQLite；可能耗時數分鐘）。若 notes_root 尚無 .md，請改用「初始化」按鈕或先手動 sqlite-sync。若設定啟用 Joplin wiki 寫回，wiki-compile 會經本機 Data API 更新 @llm-wiki/wiki，並同步 brainstorming、artifacts（須 Desktop Clipper 服務可用）。確定執行？";
  const runInit = createSingleFlight(() =>
    jb.runInitPipeline({ confirmed: true, compileMode: selectedCompileMode() }),
  );
  const runCorpus = createSingleFlight(() =>
    jb.runCorpusPipeline({ confirmed: true, compileMode: selectedCompileMode() }),
  );

  el("btn-run-init").addEventListener("click", async () => {
    const mode = selectedCompileMode();
    if (
      !confirm(initConfirmText(mode))
    )
      return;
    const st = el("corpus-status");
    let tearProgress = () => {};
    st.textContent = "初始化執行中…（請勿關閉視窗）";
    setPipelineButtonsDisabled(true);
    try {
      tearProgress = bindPipelineProgressUi(jb, "init");
      const r = await runInit();
      if (r.skipped) {
        st.textContent = "略過（上一輪管線尚在進行）";
        return;
      }
      const res = r.result;
      appendPipelineLog(res, "init-pipeline");
      st.textContent =
        res && typeof res === "object" && res.ok === true
          ? mode === "agent"
            ? "初始化完成（匯出如需已執行，agent-compile 成功）。"
            : "初始化完成（匯出如需已執行，index 與 wiki-compile 皆成功）。"
          : `初始化結束：${/** @type {{ code?: string }} */ (res).code ?? "錯誤"}（詳見下方日誌）`;
    } catch (e) {
      appendPipelineLog(
        {
          ok: false,
          code: "EXCEPTION",
          message: String(e),
          sqliteSync: {
            exitCode: null,
            stdoutTail: "",
            stderrTail: "",
            skipped: false,
          },
          index: { exitCode: null, stdoutTail: "", stderrTail: String(e) },
          wikiCompile: { exitCode: null, stdoutTail: "", stderrTail: "" },
        },
        "init-pipeline",
      );
      st.textContent = "執行時發生例外（見日誌）";
    } finally {
      tearProgress();
      setPipelineButtonsDisabled(false);
    }
  });

  el("btn-run-corpus").addEventListener("click", async () => {
    const mode = selectedCompileMode();
    if (
      !confirm(corpusConfirmText(mode))
    )
      return;
    const st = el("corpus-status");
    let tearProgress = () => {};
    st.textContent = "執行中…（請勿關閉視窗）";
    setPipelineButtonsDisabled(true);
    try {
      tearProgress = bindPipelineProgressUi(jb, "corpus");
      const r = await runCorpus();
      if (r.skipped) {
        st.textContent = "略過（上一輪管線尚在進行）";
        return;
      }
      const res = r.result;
      appendPipelineLog(res, "corpus-pipeline");
      st.textContent =
        res && typeof res === "object" && res.ok === true
          ? mode === "agent"
            ? "管線完成（agent-compile 成功）。"
            : "管線完成（index 與 wiki-compile 皆成功）。"
          : `管線結束：${/** @type {{ code?: string }} */ (res).code ?? "錯誤"}（詳見下方日誌）`;
    } catch (e) {
      appendPipelineLog(
        {
          ok: false,
          code: "EXCEPTION",
          message: String(e),
          index: { exitCode: null, stdoutTail: "", stderrTail: String(e) },
          wikiCompile: { exitCode: null, stdoutTail: "", stderrTail: "" },
        },
        "corpus-pipeline",
      );
      st.textContent = "執行時發生例外（見日誌）";
    } finally {
      tearProgress();
      setPipelineButtonsDisabled(false);
    }
  });

  await refresh();
}

init().catch((e) => {
  document.getElementById("health-json").textContent = String(e);
});
