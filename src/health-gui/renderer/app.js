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

/** @type {unknown} */
let lastHealthSnap = null;

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
    el("health-json").textContent = JSON.stringify(r.result, null, 2);
    renderConnectionLabels(lastHealthSnap);
    syncDependencyButtons(lastHealthSnap);
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
    if (res.ok === true) return `已送出啟動（pid=${res.pid ?? "?"}），請按「重新整理」確認連線。`;
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
    st.textContent = formatDepResult(r.result);
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
    st.textContent = formatDepResult(r.result);
  });

  await refresh();
}

init().catch((e) => {
  document.getElementById("health-json").textContent = String(e);
});
