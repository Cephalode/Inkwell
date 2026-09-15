/* ui-core — shared chrome for test-ui consoles.
   Theme boot/persist, hash router, accessible drawer, event delegation, toast,
   HTML escaping, sparkline. Each project copies this file unchanged; app.js
   supplies UI.init({ views, titles, actions }). */

const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function spark(data, w = 120, h = 32, color = "var(--accent)") {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(" ");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

const UI = {
  views: {}, titles: {}, actions: {}, content: null, _lastFocus: null, _toastTimer: 0,

  init(cfg) {
    Object.assign(this, cfg);
    this.content = $("#content");

    // Theme: localStorage > system preference; toggle persists.
    try {
      const saved = localStorage.getItem("tui-theme");
      if (saved) document.documentElement.dataset.theme = saved;
      else if (matchMedia("(prefers-color-scheme: light)").matches)
        document.documentElement.dataset.theme = "light";
    } catch (e) { /* storage may be unavailable */ }
    $("#themeToggle")?.addEventListener("click", () => {
      const r = document.documentElement;
      r.dataset.theme = r.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("tui-theme", r.dataset.theme); } catch (e) {}
    });

    // Drawer (dialog semantics live in the HTML; behavior here).
    $("#drawerClose")?.addEventListener("click", () => this.closeDrawer());
    $("#drawerScrim")?.addEventListener("click", () => this.closeDrawer());
    document.addEventListener("keydown", e => { if (e.key === "Escape") this.closeDrawer(); });

    // Event delegation — [data-action] elements anywhere (content, drawer, topbar).
    document.body.addEventListener("click", e => this._dispatch(e));
    document.body.addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-action][tabindex]")) {
        e.preventDefault(); this._dispatch(e);
      }
    });
    // Built-in demo action: visible feedback for not-yet-wired controls.
    this.actions.demo = id => this.toast(`Demo — would ${id} in the live product.`);

    window.addEventListener("hashchange", () => this.route());
    this.route();
  },

  _dispatch(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    // A click on a real control inside an actionable row belongs to that control.
    const inner = e.target.closest("button, a, input, select, label");
    if (inner && inner !== el && !inner.contains(el)) {
      if (!inner.dataset.action) return;
    }
    const fn = this.actions[el.dataset.action];
    if (fn) fn(el.dataset.id, el);
  },

  route() {
    const first = Object.keys(this.views)[0];
    const view = (location.hash || "#" + first).slice(1);
    const fn = this.views[view] || this.views[first];
    this.closeDrawer();
    this.content.innerHTML = fn();
    document.querySelectorAll(".nav-item").forEach(a =>
      a.classList.toggle("active", a.dataset.view === (this.views[view] ? view : first)));
    const crumbs = $("#crumbs");
    if (crumbs) crumbs.textContent = this.titles[view] || this.titles[first] || "";
  },

  /* Re-render a single region (A1: never rebuild a form the user is typing in). */
  patch(sel, html) { const el = $(sel, this.content); if (el) el.innerHTML = html; },

  openDrawer(title, html) {
    this._lastFocus = document.activeElement;
    $("#drawerTitle").textContent = title;
    $("#drawerBody").innerHTML = html;
    $("#drawer").classList.add("open");
    $("#drawerScrim").classList.add("show");
    document.body.style.overflow = "hidden";
    $("#drawerClose").focus();
  },

  closeDrawer() {
    const d = $("#drawer");
    if (!d || !d.classList.contains("open")) return;
    d.classList.remove("open");
    $("#drawerScrim").classList.remove("show");
    document.body.style.overflow = "";
    if (this._lastFocus && document.contains(this._lastFocus)) this._lastFocus.focus();
  },

  toast(msg) {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  },
};

/* Shared row/control builders */
const row = (action, id, cells) =>
  `<tr class="clickable" tabindex="0" role="button" data-action="${action}" data-id="${esc(id)}">${cells}</tr>`;
const demoBtn = (label, verb, cls = "ghost") =>
  `<button class="btn ${cls} small" data-action="demo" data-id="${esc(verb)}">${label}</button>`;
const chip = (group, val, label, active) =>
  `<span class="chip ${active ? "active" : ""}" role="button" tabindex="0" data-action="filter" data-id="${group}:${val}">${label}</span>`;
