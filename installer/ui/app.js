(() => {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  const appWindow = window.__TAURI__.window.getCurrentWindow();

  const $ = (selector) => document.querySelector(selector);
  const pages = document.querySelectorAll(".page");

  const STEPS = {
    install: [
      ["stop", "Fermeture de RapidTunes"],
      ["files", "Copie des fichiers"],
      ["shortcuts", "Création des raccourcis"],
      ["registry", "Enregistrement dans Windows"],
      ["finish", "Finalisation"]
    ],
    uninstall: [
      ["stop", "Fermeture de RapidTunes"],
      ["shortcuts", "Suppression des raccourcis"],
      ["registry", "Nettoyage de Windows"],
      ["files", "Suppression des fichiers"],
      ["data", "Suppression de vos données"],
      ["finish", "Finalisation"]
    ]
  };

  let context = null;
  let flow = "install";
  let stepList = [];
  let stepProgress = {};
  let installedDir = "";
  let lastAction = null;

  const timelineFor = () => {
    if (context.mode === "uninstall") return [["uninstall", "Confirmation"], ["progress", "Désinstallation"], ["done", "Terminé"]];
    if (context.mode === "update") return [["progress", "Mise à jour"], ["done", "Terminé"]];
    return [["welcome", "Bienvenue"], ["options", "Options"], ["progress", "Installation"], ["done", "Terminé"]];
  };

  function renderTimeline(current) {
    const entries = timelineFor();
    const currentIndex = entries.findIndex(([id]) => id === current);
    $("#timeline").innerHTML = entries
      .map(([id, label], index) => {
        const state = index < currentIndex ? "is-done" : index === currentIndex ? "is-active" : "";
        return `<li class="${state}">${label}</li>`;
      })
      .join("");
  }

  function show(page) {
    pages.forEach((section) => section.classList.toggle("is-visible", section.dataset.page === page));
    renderTimeline(page === "error" ? "progress" : page);
  }

  function setTitle(text) {
    $("#window-title").textContent = text;
    document.title = text;
  }

  function buildSteps(kind, withData) {
    stepList = STEPS[kind].filter(([id]) => id !== "data" || withData);
    stepProgress = {};
    $("#steps").innerHTML = stepList
      .map(([id, label]) => `<li data-step="${id}"><span class="steps__icon"></span><span>${label}</span></li>`)
      .join("");
    setProgressBar(0);
  }

  function setProgressBar(percent) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    $("#progress-bar").style.width = `${value}%`;
    $("#progress-percent").textContent = `${value} %`;
  }

  function updateOverall() {
    const total = stepList.length || 1;
    let sum = 0;
    for (const [id] of stepList) sum += stepProgress[id] ?? 0;
    setProgressBar(sum / total);
  }

  listen("progress", ({ payload }) => {
    const item = document.querySelector(`[data-step="${payload.id}"]`);
    if (!item) return;
    item.classList.remove("is-running", "is-done", "is-error");
    if (payload.state === "running") item.classList.add("is-running");
    if (payload.state === "done") item.classList.add("is-done");
    stepProgress[payload.id] = payload.state === "done" ? 100 : payload.percent;
    if (payload.detail) $("#progress-detail").textContent = payload.detail + "...";
    updateOverall();
  });

  listen("finished", ({ payload }) => {
    if (!payload.ok) {
      const running = document.querySelector(".steps .is-running");
      if (running) {
        running.classList.remove("is-running");
        running.classList.add("is-error");
      }
      $("#error-message").textContent = payload.error || "Erreur inconnue.";
      setTitle("Un problème est survenu");
      show("error");
      return;
    }
    setProgressBar(100);
    if (flow === "install") {
      installedDir = payload.dir;
      finishInstall();
    } else {
      finishUninstall();
    }
  });

  function finishInstall() {
    const updating = Boolean(context.existing_version) || context.mode === "update";
    $("#done-title").textContent = updating ? "Mise à jour terminée" : "Installation terminée";
    $("#done-text").textContent = updating
      ? `RapidTunes ${context.version} est installé.`
      : "RapidTunes est prêt à être utilisé.";
    setTitle($("#done-title").textContent);
    show("done");
    // Mise à jour lancée depuis l'application: on relance RapidTunes automatiquement.
    if (context.mode === "update") {
      $("#done-options").hidden = true;
      if (context.relaunch) {
        setTimeout(async () => {
          try {
            await invoke("launch_app", { dir: installedDir });
          } catch (_) {
            /* ignoré */
          }
          invoke("quit");
        }, 1400);
      }
    }
  }

  function finishUninstall() {
    $("#done-title").textContent = "Désinstallation terminée";
    $("#done-text").textContent = "RapidTunes a été supprimé de cet ordinateur.";
    $("#done-options").hidden = true;
    setTitle("Désinstallation terminée");
    show("done");
  }

  async function startInstall() {
    const dir = $("#install-dir").value.trim();
    if (!dir) {
      const error = $("#options-error");
      error.textContent = "Choisissez un dossier d'installation.";
      error.hidden = false;
      return;
    }
    flow = "install";
    lastAction = startInstall;
    const updating = Boolean(context.existing_version) || context.mode === "update";
    $("#progress-title").textContent = updating ? "Mise à jour en cours" : "Installation en cours";
    setTitle($("#progress-title").textContent);
    $("#progress-detail").textContent = "Préparation...";
    buildSteps("install", false);
    show("progress");
    await invoke("run_install", {
      options: {
        dir,
        desktop_shortcut: $("#opt-desktop").checked,
        start_menu_shortcut: $("#opt-startmenu").checked,
        autostart: $("#opt-autostart").checked
      }
    });
  }

  async function startUninstall() {
    flow = "uninstall";
    lastAction = startUninstall;
    const deleteData = $("#opt-delete-data").checked;
    $("#progress-title").textContent = "Désinstallation en cours";
    setTitle("Désinstallation en cours");
    $("#progress-detail").textContent = "Préparation...";
    buildSteps("uninstall", deleteData);
    show("progress");
    await invoke("run_uninstall", { options: { delete_data: deleteData } });
  }

  const actions = {
    cancel: () => invoke("quit"),
    "to-welcome": () => show("welcome"),
    "to-options": () => {
      $("#options-error").hidden = true;
      show("options");
    },
    "start-install": startInstall,
    "start-uninstall": startUninstall,
    retry: () => (lastAction ? lastAction() : null),
    finish: async () => {
      if (flow === "install" && context.mode !== "update" && $("#opt-launch").checked && installedDir) {
        try {
          await invoke("launch_app", { dir: installedDir });
        } catch (_) {
          /* ignoré */
        }
      }
      invoke("quit");
    }
  };

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (target) actions[target.dataset.action]?.();
  });

  $("#btn-close").addEventListener("click", () => appWindow.close());
  $("#btn-minimize").addEventListener("click", () => appWindow.minimize());
  $("#btn-browse").addEventListener("click", async () => {
    const picked = await invoke("pick_directory", { current: $("#install-dir").value });
    if (picked) {
      // Un dossier choisi qui n'est pas déjà « RapidTunes » reçoit un sous-dossier dédié.
      const clean = picked.replace(/[\\/]+$/, "");
      $("#install-dir").value = /rapidtunes$/i.test(clean) ? clean : `${clean}\\RapidTunes`;
    }
  });

  document.addEventListener("contextmenu", (event) => event.preventDefault());

  async function init() {
    context = await invoke("get_context");
    $("#install-dir").value = context.default_dir;
    $("#sidebar-version").textContent = `Version ${context.version}`;

    if (context.mode === "uninstall") {
      setTitle("Désinstallation de RapidTunes");
      show("uninstall");
      return;
    }
    if (context.mode === "update") {
      await startInstall();
      return;
    }
    setTitle("Installation de RapidTunes");
    if (context.existing_version) {
      $("#welcome-title").textContent = "Mettre à jour RapidTunes";
      $("#welcome-text").textContent = "Une version de RapidTunes est déjà installée. Ce programme va la remplacer en conservant vos données.";
      const notice = $("#welcome-existing");
      notice.textContent = `Version installée : ${context.existing_version} → nouvelle version : ${context.version}`;
      notice.hidden = false;
    }
    show("welcome");
  }

  init();
})();
