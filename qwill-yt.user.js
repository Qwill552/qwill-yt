// ==UserScript==
// @name         Qwill YT — отправить в очередь
// @namespace    qwill-yt.mooo.com
// @version      1.2
// @description  Кнопка слева от лайка на YouTube и в шапке AnimeGO — переносит видео в очередь на qwill-yt.mooo.com с выбором приоритета
// @author       Qwill
// @match        https://www.youtube.com/*
// @match        https://animego.me/*
// @match        https://animego.org/*
// @match        https://animego.one/*
// @match        https://animego.club/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      qwill-yt.mooo.com
// ==/UserScript==

(function () {
  "use strict";

  const LOG = "[QWYT]";
  console.log(LOG, "script loaded", location.href);

  const API_URL = "https://qwill-yt.mooo.com/api/queue-ingest";
  const INGEST_TOKEN = "__INGEST_TOKEN__";
  const SUCCESS_MS = 1600;
  const ERROR_MS = 2200;

  const IS_ANIMEGO = /(^|\.)animego\./i.test(location.hostname);

  const EASE = "cubic-bezier(0.2,0,0,1)";

  const SVG_NS = "http://www.w3.org/2000/svg";

  const ICONS = {
    link: [
      { tag: "path", attrs: { d: "M9 17H7A5 5 0 0 1 7 7h2" } },
      { tag: "path", attrs: { d: "M15 7h2a5 5 0 1 1 0 10h-2" } },
      { tag: "line", attrs: { x1: "8", x2: "16", y1: "12", y2: "12" } },
    ],
    flame: [
      {
        tag: "path",
        attrs: {
          d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
        },
      },
    ],
    circle: [{ tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } }],
    check: [{ tag: "path", attrs: { d: "M20 6 9 17l-5-5" } }],
    warn: [
      { tag: "path", attrs: { d: "M12 9v4" } },
      { tag: "path", attrs: { d: "M12 17h.01" } },
      {
        tag: "path",
        attrs: {
          d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z",
        },
      },
    ],
  };

  function svgEl(shapes, opts) {
    opts = opts || {};
    const el = document.createElementNS(SVG_NS, "svg");
    el.setAttribute("viewBox", "0 0 24 24");
    el.setAttribute("fill", opts.fill || "none");
    el.setAttribute("stroke", opts.stroke === false ? "none" : "currentColor");
    el.setAttribute("stroke-width", "2");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    for (const shape of shapes) {
      const node = document.createElementNS(SVG_NS, shape.tag);
      for (const key of Object.keys(shape.attrs)) {
        node.setAttribute(key, shape.attrs[key]);
      }
      el.appendChild(node);
    }
    return el;
  }

  function isDarkYoutube() {
    return document.documentElement.hasAttribute("dark");
  }

  function colors() {
    return isDarkYoutube()
      ? {
          btnBg: "rgba(255,255,255,0.1)",
          btnBgHover: "rgba(255,255,255,0.2)",
          fg: "#f1f1f1",
          divider: "rgba(255,255,255,0.2)",
          high: "#ff6b9d",
          medium: "#ffcc33",
          low: "#8b9bb4",
          accent: "#4ea3ff",
        }
      : {
          btnBg: "rgba(0,0,0,0.05)",
          btnBgHover: "rgba(0,0,0,0.1)",
          fg: "#0f0f0f",
          divider: "rgba(0,0,0,0.14)",
          high: "#e11d48",
          medium: "#c98900",
          low: "#5a718a",
          accent: "#1a6dff",
        };
  }

  function injectStyle() {
    if (document.getElementById("qwyt-style")) return;
    const c = colors();
    const style = document.createElement("style");
    style.id = "qwyt-style";
    style.textContent =
      "#qwyt-btn{" +
      "--qwyt-size:36px;" +
      "position:relative;display:inline-flex;align-items:center;justify-content:flex-start;" +
      "height:var(--qwyt-size);width:var(--qwyt-size);border-radius:calc(var(--qwyt-size)/2);" +
      "background:" +
      c.btnBg +
      ";color:" +
      c.fg +
      ";overflow:hidden;margin-right:8px;flex-shrink:0;" +
      "transition:width .28s " +
      EASE +
      ", background-color .15s ease-out;" +
      "}" +
      "#qwyt-btn.qwyt-expanded{width:calc(var(--qwyt-size)*3);background:" +
      c.btnBg +
      ";}" +
      "#qwyt-btn:hover{background:" +
      c.btnBgHover +
      ";}" +
      "#qwyt-btn button{" +
      "all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;justify-content:center;" +
      "width:var(--qwyt-size);height:var(--qwyt-size);flex-shrink:0;" +
      "}" +
      "#qwyt-btn button:hover{background:" +
      c.btnBgHover +
      ";}" +
      "#qwyt-btn button:focus-visible{outline:2px solid " +
      c.accent +
      ";outline-offset:-2px;}" +
      "#qwyt-btn svg{width:18px;height:18px;pointer-events:none;}" +
      "#qwyt-btn .qwyt-layer{" +
      "position:absolute;inset:0;display:flex;align-items:center;" +
      "transition:opacity .22s " +
      EASE +
      ", transform .22s " +
      EASE +
      ";" +
      "}" +
      "#qwyt-btn .qwyt-main-layer{justify-content:center;width:var(--qwyt-size);}" +
      "#qwyt-btn .qwyt-options-layer{opacity:0;transform:scale(.85);pointer-events:none;}" +
      "#qwyt-btn.qwyt-expanded .qwyt-options-layer{opacity:1;transform:scale(1);pointer-events:auto;}" +
      "#qwyt-btn.qwyt-expanded .qwyt-main-layer{opacity:0;transform:scale(.85);pointer-events:none;}" +
      "#qwyt-btn .qwyt-status-layer{justify-content:center;width:var(--qwyt-size);opacity:0;transform:scale(.6);pointer-events:none;}" +
      "#qwyt-btn.qwyt-status .qwyt-status-layer{opacity:1;transform:scale(1);}" +
      "#qwyt-btn.qwyt-status .qwyt-main-layer{opacity:0;transform:scale(.6);}" +
      "#qwyt-btn .qwyt-divider{width:1px;height:50%;background:" +
      c.divider +
      ";flex-shrink:0;}" +
      "#qwyt-btn .qwyt-opt-high svg{color:" +
      c.high +
      ";}" +
      "#qwyt-btn .qwyt-opt-medium svg{color:" +
      c.medium +
      ";fill:" +
      c.medium +
      ";}" +
      "#qwyt-btn .qwyt-opt-low svg{color:" +
      c.low +
      ";}" +
      "#qwyt-btn .qwyt-status-ok svg{color:#3ba55d;}" +
      "#qwyt-btn .qwyt-status-err svg{color:#e0445b;}" +
      "@media (prefers-reduced-motion: reduce){#qwyt-btn,#qwyt-btn .qwyt-layer{transition:none!important;}}";
    document.head.appendChild(style);
  }

  function makeIconButton(cls, ariaLabel, title, iconShapes, iconOpts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cls;
    btn.setAttribute("aria-label", ariaLabel);
    if (title) btn.title = title;
    btn.appendChild(svgEl(iconShapes, iconOpts));
    return btn;
  }

  function buildButton() {
    const wrap = document.createElement("div");
    wrap.id = "qwyt-btn";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Отправить в очередь Qwill");

    const mainLayer = document.createElement("div");
    mainLayer.className = "qwyt-layer qwyt-main-layer";
    mainLayer.appendChild(
      makeIconButton("qwyt-main", "Отправить в очередь Qwill", null, ICONS.link),
    );

    const optionsLayer = document.createElement("div");
    optionsLayer.className = "qwyt-layer qwyt-options-layer";
    optionsLayer.setAttribute("aria-hidden", "true");

    const highBtn = makeIconButton(
      "qwyt-opt qwyt-opt-high",
      "Важно — смотреть сейчас",
      "Важно",
      ICONS.flame,
    );
    highBtn.dataset.priority = "high";

    const divider1 = document.createElement("span");
    divider1.className = "qwyt-divider";

    const mediumBtn = makeIconButton(
      "qwyt-opt qwyt-opt-medium",
      "Средне — когда будет время",
      "Средне",
      ICONS.circle,
      { fill: "currentColor" },
    );
    mediumBtn.dataset.priority = "medium";

    const divider2 = document.createElement("span");
    divider2.className = "qwyt-divider";

    const lowBtn = makeIconButton(
      "qwyt-opt qwyt-opt-low",
      "Позже — можно отложить",
      "Позже",
      ICONS.circle,
    );
    lowBtn.dataset.priority = "low";

    optionsLayer.append(highBtn, divider1, mediumBtn, divider2, lowBtn);

    const statusOk = document.createElement("div");
    statusOk.className = "qwyt-layer qwyt-status-layer qwyt-status-ok";
    statusOk.setAttribute("aria-hidden", "true");
    statusOk.appendChild(svgEl(ICONS.check));

    const statusErr = document.createElement("div");
    statusErr.className = "qwyt-layer qwyt-status-layer qwyt-status-err";
    statusErr.setAttribute("aria-hidden", "true");
    statusErr.style.display = "none";
    statusErr.appendChild(svgEl(ICONS.warn));

    wrap.append(mainLayer, optionsLayer, statusOk, statusErr);

    let collapseTimer = null;

    function collapse() {
      wrap.classList.remove("qwyt-expanded");
    }

    function expand() {
      wrap.classList.add("qwyt-expanded");
    }

    function showStatus(ok) {
      wrap.classList.remove("qwyt-expanded");
      wrap.querySelector(".qwyt-status-ok").style.display = ok ? "flex" : "none";
      wrap.querySelector(".qwyt-status-err").style.display = ok ? "none" : "flex";
      wrap.classList.add("qwyt-status");
      window.clearTimeout(collapseTimer);
      collapseTimer = window.setTimeout(
        () => wrap.classList.remove("qwyt-status"),
        ok ? SUCCESS_MS : ERROR_MS,
      );
    }

    wrap.querySelector(".qwyt-main").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (wrap.classList.contains("qwyt-status")) return;
      if (wrap.classList.contains("qwyt-expanded")) collapse();
      else expand();
    });

    wrap.querySelectorAll(".qwyt-opt").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const priority = btn.getAttribute("data-priority");
        collapse();
        showStatus(true);
        sendVideo(currentVideoUrl(), priority, (ok) => {
          if (!ok) showStatus(false);
        });
      });
    });

    document.addEventListener(
      "click",
      (event) => {
        if (!wrap.contains(event.target)) collapse();
      },
      true,
    );

    return wrap;
  }

  function currentVideoUrl() {
    const id = new URLSearchParams(location.search).get("v");
    return id ? "https://www.youtube.com/watch?v=" + id : location.href;
  }

  /** done(ok, reason) — reason человекочитаемо объясняет отказ сервера. */
  function sendPayload(payload, done) {
    GM_xmlhttpRequest({
      method: "POST",
      url: API_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + INGEST_TOKEN,
      },
      data: JSON.stringify(payload),
      timeout: 12000,
      onload: (res) => {
        const ok = res.status >= 200 && res.status < 300;
        const body = (res.responseText || "").slice(0, 200);
        console.log(LOG, "ingest", res.status, body);
        done(ok, ok ? "" : describeError(res.status, body));
      },
      onerror: (err) => {
        console.error(LOG, "ingest failed", err);
        done(false, "нет связи с сервером");
      },
      ontimeout: () => {
        console.error(LOG, "ingest timeout");
        done(false, "сервер не ответил");
      },
    });
  }

  function describeError(status, body) {
    if (status === 401) return "401 — проверьте INGEST_TOKEN в скрипте";
    if (status === 0) return "нет связи с сервером";
    const text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (text && text.length < 80) return status + " — " + text;
    return "ошибка " + status;
  }

  function sendVideo(url, priority, done) {
    sendPayload({ url, priority }, done);
  }

  function isWatchPage() {
    return location.pathname === "/watch";
  }

  function findAnchor() {
    const direct = document.querySelector(
      "segmented-like-dislike-button-view-model, ytd-menu-renderer#top-level-buttons-computed, #top-level-buttons-computed",
    );
    if (direct) return { el: direct, via: "direct" };

    const scoped = document.querySelector(
      "#actions #actions-inner ytd-menu-renderer, ytd-watch-metadata #actions ytd-menu-renderer",
    );
    if (scoped) return { el: scoped, via: "scoped" };

    const likeBtn = document.querySelector(
      'like-button-view-model, button[aria-label*="понрав" i], button[aria-label*="like this video" i], ' +
        'yt-smartimation button[aria-label*="нрав" i], toggle-button-view-model button[aria-label*="нрав" i]',
    );
    if (likeBtn) {
      const closest =
        likeBtn.closest(
          "ytd-menu-renderer, segmented-like-dislike-button-view-model, #top-level-buttons-computed",
        ) || likeBtn.parentElement;
      return { el: closest, via: "likeBtn-fallback" };
    }

    const actions = document.querySelector("#actions, ytd-watch-metadata #actions-inner");
    if (actions) return { el: null, via: "actions-only", actionsEl: actions };

    return { el: null, via: "none" };
  }

  let lastReport = 0;
  let injectedOnce = false;
  let lastErrorReport = 0;

  function ensureInjected() {
    try {
      ensureInjectedInner();
    } catch (err) {
      const now = Date.now();
      if (now - lastErrorReport > 5000) {
        lastErrorReport = now;
        console.error(LOG, "ensureInjected failed:", err);
      }
    }
  }

  function ensureInjectedInner() {
    if (!isWatchPage()) {
      const stale = document.getElementById("qwyt-btn");
      if (stale) stale.remove();
      return;
    }

    injectStyle();
    const found = findAnchor();

    if (!found.el) {
      const now = Date.now();
      if (now - lastReport > 4000) {
        lastReport = now;
        console.log(LOG, "anchor not found, via:", found.via);
        if (found.actionsEl) {
          console.log(LOG, "#actions element found, dumping outerHTML (trimmed):");
          console.log(found.actionsEl.outerHTML.slice(0, 2000));
        } else {
          console.log(LOG, "#actions not found either — dumping document.body child structure near player");
          const meta = document.querySelector("ytd-watch-metadata");
          console.log(LOG, "ytd-watch-metadata:", meta);
          if (meta) console.log(meta.outerHTML.slice(0, 1500));
        }
      }
      return;
    }

    if (!found.el.parentElement) {
      console.log(LOG, "anchor found via", found.via, "but has no parentElement", found.el);
      return;
    }

    const existing = document.getElementById("qwyt-btn");
    if (existing) {
      if (existing.nextElementSibling === found.el) return;
      existing.remove();
      console.log(LOG, "re-injecting: anchor moved");
    }

    const btn = buildButton();
    found.el.parentElement.insertBefore(btn, found.el);
    if (!injectedOnce) {
      injectedOnce = true;
      console.log(LOG, "button injected OK, via:", found.via, found.el);
    }
  }

  const CARD_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-playlist-panel-video-renderer",
    "yt-lockup-view-model",
  ].join(",");

  function resolveCardVideoUrl(card) {
    const link = card.querySelector(
      'a[href*="/watch?v="], a#thumbnail[href*="/watch"], a#video-title[href*="/watch"]',
    );
    if (!link) return null;
    const href = link.getAttribute("href");
    if (!href) return null;
    try {
      return new URL(href, location.origin).href;
    } catch {
      return null;
    }
  }

  function injectCtxStyle() {
    if (document.getElementById("qwyt-ctx-style")) return;
    const c = colors();
    const style = document.createElement("style");
    style.id = "qwyt-ctx-style";
    style.textContent =
      "#qwyt-ctx{" +
      "position:fixed;z-index:999999;min-width:230px;padding:6px;border-radius:12px;" +
      "background:" +
      (isDarkYoutube() ? "#282828" : "#ffffff") +
      ";" +
      "box-shadow:0 2px 10px rgba(0,0,0,.3),0 1px 3px rgba(0,0,0,.2);" +
      "font-family:Roboto,Arial,sans-serif;display:flex;flex-direction:column;gap:2px;" +
      "}" +
      "#qwyt-ctx button{" +
      "all:unset;box-sizing:border-box;display:flex;align-items:center;gap:14px;width:100%;" +
      "padding:10px 14px;border-radius:8px;cursor:pointer;font-size:14px;line-height:20px;" +
      "color:" +
      c.fg +
      ";}" +
      "#qwyt-ctx button:hover,#qwyt-ctx button:focus-visible{background:" +
      c.btnBgHover +
      ";}" +
      "#qwyt-ctx button:focus-visible{outline:2px solid " +
      c.accent +
      ";outline-offset:-2px;}" +
      "#qwyt-ctx svg{width:20px;height:20px;flex-shrink:0;pointer-events:none;}" +
      "#qwyt-ctx .qwyt-ctx-icon{display:flex;}" +
      "#qwyt-ctx .qwyt-ctx-high svg{color:" +
      c.high +
      ";}" +
      "#qwyt-ctx .qwyt-ctx-medium svg{color:" +
      c.medium +
      ";fill:" +
      c.medium +
      ";}" +
      "#qwyt-ctx .qwyt-ctx-low svg{color:" +
      c.low +
      ";}" +
      "#qwyt-ctx .qwyt-ctx-status{display:none;color:#3ba55d;}" +
      "#qwyt-ctx .qwyt-ctx-status.qwyt-ctx-err{color:#e0445b;}" +
      "#qwyt-ctx button.qwyt-ctx-done .qwyt-ctx-icon{display:none;}" +
      "#qwyt-ctx button.qwyt-ctx-done .qwyt-ctx-status{display:flex;}";
    document.head.appendChild(style);
  }

  let closeCtxMenu = null;

  function openContextMenu(x, y, videoUrl) {
    if (closeCtxMenu) closeCtxMenu();
    injectCtxStyle();

    const menu = document.createElement("div");
    menu.id = "qwyt-ctx";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Отправить в очередь Qwill");

    const items = [
      {
        priority: "high",
        label: "Важно — смотреть сейчас",
        icon: ICONS.flame,
        cls: "qwyt-ctx-high",
      },
      {
        priority: "medium",
        label: "Средне — когда будет время",
        icon: ICONS.circle,
        cls: "qwyt-ctx-medium",
        fill: true,
      },
      {
        priority: "low",
        label: "Позже — можно отложить",
        icon: ICONS.circle,
        cls: "qwyt-ctx-low",
      },
    ];

    let closed = false;
    let autoCloseTimer = null;

    function close() {
      if (closed) return;
      closed = true;
      window.clearTimeout(autoCloseTimer);
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
      menu.remove();
      if (closeCtxMenu === close) closeCtxMenu = null;
    }
    closeCtxMenu = close;

    function onOutside(event) {
      if (!menu.contains(event.target)) close();
    }
    function onKeydown(event) {
      if (event.key === "Escape") close();
    }

    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = item.cls;
      btn.setAttribute("role", "menuitem");

      const iconWrap = document.createElement("span");
      iconWrap.className = "qwyt-ctx-icon";
      iconWrap.appendChild(svgEl(item.icon, item.fill ? { fill: "currentColor" } : undefined));

      const label = document.createElement("span");
      label.textContent = item.label;
      label.style.flex = "1";
      label.style.textAlign = "left";

      const status = document.createElement("span");
      status.className = "qwyt-ctx-status";
      status.appendChild(svgEl(ICONS.check));

      btn.append(iconWrap, label, status);

      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.classList.contains("qwyt-ctx-done")) return;
        menu.querySelectorAll("button").forEach((b) => (b.disabled = true));
        btn.classList.add("qwyt-ctx-done");
        autoCloseTimer = window.setTimeout(close, 900);
        sendVideo(videoUrl, item.priority, (ok) => {
          if (!ok) {
            status.classList.add("qwyt-ctx-err");
            status.replaceChildren(svgEl(ICONS.warn));
            window.clearTimeout(autoCloseTimer);
            autoCloseTimer = window.setTimeout(close, 1400);
          }
        });
      });

      menu.appendChild(btn);
    }

    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = Math.max(8, left) + "px";
    menu.style.top = Math.max(8, top) + "px";

    window.setTimeout(() => {
      document.addEventListener("mousedown", onOutside, true);
      document.addEventListener("keydown", onKeydown, true);
      window.addEventListener("scroll", close, true);
      window.addEventListener("blur", close);
    }, 0);
  }

  let lastHoveredCard = null;

  document.addEventListener(
    "mouseover",
    (event) => {
      if (IS_ANIMEGO) return;
      const card = event.target.closest(CARD_SELECTOR);
      if (card) lastHoveredCard = card;
    },
    true,
  );

  function cardUnderPoint(x, y) {
    const direct = document
      .elementsFromPoint(x, y)
      .map((el) => el.closest(CARD_SELECTOR))
      .find(Boolean);
    if (direct) return direct;

    if (lastHoveredCard && lastHoveredCard.isConnected) {
      const rect = lastHoveredCard.getBoundingClientRect();
      const inflated = 24;
      if (
        x >= rect.left - inflated &&
        x <= rect.right + inflated &&
        y >= rect.top - inflated &&
        y <= rect.bottom + inflated
      ) {
        return lastHoveredCard;
      }
    }
    return null;
  }

  document.addEventListener(
    "contextmenu",
    (event) => {
      if (IS_ANIMEGO) return;
      const card = cardUnderPoint(event.clientX, event.clientY);
      if (!card) return;

      const directTarget = card.contains(event.target) ? event.target : card;
      const link = directTarget.closest ? directTarget.closest("a") : null;
      if (link) {
        const href = link.getAttribute("href") || "";
        if (href && !href.includes("/watch")) return;
      }

      const videoUrl = resolveCardVideoUrl(card);
      if (!videoUrl) return;

      event.preventDefault();
      event.stopPropagation();
      openContextMenu(event.clientX, event.clientY, videoUrl);
    },
    true,
  );

  function initYoutube() {
    const observer = new MutationObserver(() => ensureInjected());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener("yt-navigate-finish", () => {
      injectedOnce = false;
      window.setTimeout(ensureInjected, 300);
    });

    window.setInterval(ensureInjected, 1500);
    ensureInjected();
  }

  // ============================== AnimeGO ==============================
  // Часть тайтлов AnimeGO не отдаёт анонимным запросам — сервер очереди
  // получает 404. Поэтому карточку собираем прямо здесь, в браузере с
  // залогиненной сессией, и отправляем на сервер уже готовой.

  const AG_PRIORITIES = [
    {
      priority: "high",
      label: "Важно — смотреть сейчас",
      text: "text-danger",
      icon: ICONS.flame,
    },
    {
      priority: "medium",
      label: "Средне — когда будет время",
      text: "text-warning",
      icon: ICONS.circle,
      fill: true,
    },
    {
      priority: "low",
      label: "Позже — можно отложить",
      text: "text-secondary",
      icon: ICONS.circle,
    },
  ];

  function agTitleEl() {
    return document.querySelector(".entity__title h1");
  }

  /** Инфоблок — пары «подпись → значение» в соседних ячейках грида. */
  function agFieldEl(label) {
    const labels = document.querySelectorAll(
      ".text-body-tertiary.text-opacity-75",
    );
    for (const el of labels) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text === label) return el.nextElementSibling;
    }
    return null;
  }

  function agText(label) {
    const el = agFieldEl(label);
    if (!el) return null;
    return (el.textContent || "").replace(/\s+/g, " ").trim() || null;
  }

  /** Студий может быть несколько — каждая отдельной ссылкой. */
  function agLinks(label) {
    const el = agFieldEl(label);
    if (!el) return null;
    const names = Array.from(el.querySelectorAll("a"))
      .map((a) => (a.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (names.length > 0) return names.join(", ");
    return agText(label);
  }

  function agJsonLd() {
    const blocks = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    for (const block of blocks) {
      try {
        const data = JSON.parse(block.textContent || "");
        if (data && (data.name || data.image)) return data;
      } catch (err) {
        /* на странице бывает и чужой ld+json */
      }
    }
    return null;
  }

  function agPoster() {
    const img = document.querySelector(".entity__poster img");
    const src = img && (img.getAttribute("src") || img.getAttribute("data-src"));
    if (src) return src;
    const meta = document.querySelector('meta[property="og:image"]');
    return meta ? meta.getAttribute("content") : null;
  }

  function agCollect() {
    const ld = agJsonLd() || {};
    const titleEl = agTitleEl();
    const title =
      (titleEl && (titleEl.textContent || "").replace(/\s+/g, " ").trim()) ||
      (ld.name || "").trim();
    if (!title) return null;

    return {
      source: "animego",
      url: location.origin + location.pathname,
      title: title,
      studio: agLinks("Студия") || "",
      thumbnail: agPoster() || (ld.image || "") || "",
      episodes: agText("Эпизоды"),
      publishedAt: ld.datePublished || agText("Выпуск") || null,
    };
  }

  function agInjectStyle() {
    if (document.getElementById("qwyt-ag-style")) return;
    const style = document.createElement("style");
    style.id = "qwyt-ag-style";
    // Своё правило показа меню: у бутстраповских d-* утилит стоит !important,
    // и инлайновый display их не перебивает.
    style.textContent =
      ".qwyt-ag-menu{display:none;position:absolute;top:100%;right:0;left:auto;" +
      "z-index:1080;min-width:220px;}" +
      ".qwyt-ag-menu.qwyt-ag-open{display:block;}" +
      ".qwyt-ag-toggle{background:none;cursor:pointer;}" +
      ".qwyt-ag-toggle svg,.qwyt-ag-menu svg{width:1.15em;height:1.15em;flex-shrink:0;}";
    document.head.appendChild(style);
  }

  /** Правый блок иконок в шапке — и в десктопной, и в мобильной версиях. */
  function agNavbarSlots() {
    const slots = [];
    document.querySelectorAll(".header-navbar").forEach((nav) => {
      const target =
        nav.querySelector(".navbar-nav.justify-content-end") ||
        nav.querySelector(".header-navbar-nav.justify-content-end") ||
        Array.from(nav.querySelectorAll(".navbar-nav")).pop();
      if (target) slots.push(target);
    });
    return slots;
  }

  function agBuildNavItem() {
    const item = document.createElement("div");
    item.className = "nav-item position-relative qwyt-ag-mount";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className =
      "nav-link d-inline-flex icon-link gap-2 btn border-0 qwyt-ag-toggle";
    toggle.title = "Отправить в очередь Qwill";
    toggle.setAttribute("aria-label", "Отправить в очередь Qwill");
    toggle.setAttribute("aria-expanded", "false");
    toggle.appendChild(svgEl(ICONS.link));

    const menu = document.createElement("div");
    menu.className = "dropdown-menu qwyt-ag-menu";

    const header = document.createElement("h6");
    header.className = "dropdown-header";
    header.textContent = "Очередь Qwill";

    const status = document.createElement("div");
    status.className = "px-3 pt-1 pb-2 small";
    status.style.display = "none";

    menu.appendChild(header);

    let resetTimer = null;

    function setOpen(open) {
      menu.classList.toggle("qwyt-ag-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function setStatus(text, cls) {
      status.className = "px-3 pt-1 pb-2 small " + cls;
      status.textContent = text;
      status.style.display = text ? "" : "none";
    }

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(resetTimer);
      setStatus("", "");
      setOpen(!menu.classList.contains("qwyt-ag-open"));
    });

    for (const entry of AG_PRIORITIES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dropdown-item d-flex align-items-center gap-2";

      const icon = document.createElement("span");
      icon.className = "d-inline-flex " + entry.text;
      icon.appendChild(
        svgEl(entry.icon, entry.fill ? { fill: "currentColor" } : undefined),
      );

      btn.append(icon, document.createTextNode(entry.label));
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const payload = agCollect();
        if (!payload) {
          setStatus("Не удалось прочитать страницу", "text-danger");
          return;
        }
        payload.priority = entry.priority;
        setStatus("Отправляю…", "text-body-tertiary");

        sendPayload(payload, (ok, reason) => {
          if (ok) {
            setStatus("Добавлено в очередь", "text-success");
            window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(() => {
              setOpen(false);
              setStatus("", "");
            }, SUCCESS_MS);
          } else {
            setStatus("Не отправилось: " + reason, "text-danger");
          }
        });
      });

      menu.appendChild(btn);
    }

    menu.appendChild(status);
    item.append(toggle, menu);

    function onOutsideClick(event) {
      // Turbo пересобирает страницу — снимаем слушатель вместе с кнопкой.
      if (!item.isConnected) {
        document.removeEventListener("click", onOutsideClick, true);
        return;
      }
      if (!menu.classList.contains("qwyt-ag-open")) return;
      if (!item.contains(event.target)) setOpen(false);
    }
    document.addEventListener("click", onOutsideClick, true);

    return item;
  }

  function agEnsureInjected() {
    if (!agTitleEl()) {
      document.querySelectorAll(".qwyt-ag-mount").forEach((el) => el.remove());
      return;
    }

    agInjectStyle();

    for (const slot of agNavbarSlots()) {
      if (slot.querySelector(".qwyt-ag-mount")) continue;
      slot.appendChild(agBuildNavItem());
    }
  }

  function initAnimego() {
    // Сайт на Turbo: страницы меняются без перезагрузки.
    document.addEventListener("turbo:load", () => agEnsureInjected());
    document.addEventListener("turbo:render", () => agEnsureInjected());
    window.setInterval(agEnsureInjected, 1500);
    agEnsureInjected();
  }

  if (IS_ANIMEGO) initAnimego();
  else initYoutube();
})();
