/* ==========================================================================
   agent.js — the floating "ask about my work" window.

   The window stays hidden until a live endpoint answers a health check, so the
   public site never shows a dead widget. The model key lives server-side; this
   file never sees it.
   ========================================================================== */

(function () {
  "use strict";

  var root = document.querySelector("[data-agent-endpoint]");
  if (!root) return;

  var endpoint = (root.getAttribute("data-agent-endpoint") || "").trim();
  var panel = root.querySelector(".assistant__panel");
  var launch = root.querySelector("[data-agent-launch]");
  var closeBtn = root.querySelector("[data-agent-close]");
  var log = root.querySelector(".agent__log");
  var form = root.querySelector(".agent__form");
  var input = root.querySelector("#agent-q");
  var statusEl = root.querySelector("[data-agent-status]");
  var submit = form ? form.querySelector('button[type="submit"]') : null;
  var openers = document.querySelectorAll("[data-agent-open]");

  if (!panel || !launch || !log || !form || !input || !endpoint) return;

  var history = [];
  var busy = false;
  var open = false;
  var lastFocus = null;

  /* --------------------------------------------------------------- open/close */

  function focusable() {
    var nodes = panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return Array.prototype.filter.call(nodes, function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function openWindow() {
    if (open) return;
    open = true;
    lastFocus = document.activeElement;
    root.classList.add("is-open");
    panel.removeAttribute("inert");
    panel.setAttribute("aria-hidden", "false");
    launch.setAttribute("aria-expanded", "true");
    input.focus({ preventScroll: true });
  }

  function closeWindow() {
    if (!open) return;
    open = false;
    root.classList.remove("is-open");
    panel.setAttribute("inert", "");
    panel.setAttribute("aria-hidden", "true");
    launch.setAttribute("aria-expanded", "false");

    var back =
      lastFocus && lastFocus !== document.body && lastFocus.isConnected ? lastFocus : launch;
    if (typeof back.focus === "function") back.focus({ preventScroll: true });
  }

  launch.addEventListener("click", function () {
    if (open) closeWindow();
    else openWindow();
  });

  if (closeBtn) closeBtn.addEventListener("click", closeWindow);

  Array.prototype.forEach.call(openers, function (btn) {
    btn.addEventListener("click", openWindow);
  });

  document.addEventListener("pointerdown", function (e) {
    if (open && !root.contains(e.target)) closeWindow();
  });

  document.addEventListener("keydown", function (e) {
    if (!open) return;

    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      closeWindow();
      return;
    }

    if (e.key !== "Tab") return;

    var items = focusable();
    if (!items.length) return;

    var first = items[0];
    var last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ------------------------------------------------------------------- chat */

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  function addMessage(text, kind) {
    var p = document.createElement("p");
    p.className = "agent__msg agent__msg--" + kind;
    p.textContent = text;
    log.appendChild(p);
    scrollDown();
    return p;
  }

  function addTyping() {
    var el = document.createElement("div");
    el.className = "agent__typing";
    el.setAttribute("aria-label", "Answering");
    el.innerHTML = "<span></span><span></span><span></span>";
    log.appendChild(el);
    scrollDown();
    return el;
  }

  function begin() {
    busy = true;
    if (submit) submit.disabled = true;
    input.setAttribute("aria-busy", "true");
  }

  function end() {
    busy = false;
    if (submit) submit.disabled = false;
    input.removeAttribute("aria-busy");
  }

  async function ask(question) {
    if (busy) return;
    var text = question.trim().slice(0, 500);
    if (text.length < 2) return;

    addMessage(text, "user");
    history.push({ role: "user", content: text });
    input.value = "";
    begin();

    var typing = addTyping();

    try {
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-6) })
      });

      var data = null;
      try {
        data = await response.json();
      } catch (e) {}

      typing.remove();

      if (!response.ok) {
        addMessage(
          data && data.error
            ? data.error
            : "Couldn't reach the notes. Email works better: purveshnileshbhadale@gmail.com",
          "error"
        );
        history.pop();
        return;
      }

      var answer = data && data.answer;
      if (!answer) {
        addMessage("No answer came back. Try rephrasing.", "error");
        history.pop();
        return;
      }

      addMessage(answer, "bot");
      history.push({ role: "assistant", content: answer });
      if (history.length > 8) history = history.slice(-8);
    } catch (error) {
      typing.remove();
      addMessage(
        "Offline — the assistant isn't reachable right now. Email still works: purveshnileshbhadale@gmail.com",
        "error"
      );
      history.pop();
    } finally {
      end();
      if (open) input.focus({ preventScroll: true });
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    ask(input.value);
  });

  Array.prototype.forEach.call(root.querySelectorAll("[data-ask]"), function (btn) {
    btn.addEventListener("click", function () {
      openWindow();
      ask(btn.getAttribute("data-ask") || "");
    });
  });

  /* Health check. A 404 or a failed request leaves everything hidden, so the
     site never shows a widget that cannot answer. GET answers 200 with {ok:true}. */
  fetch(endpoint, { method: "GET", headers: { Accept: "application/json" } })
    .then(function (r) {
      if (r.status === 404 || r.status === 0) return null;

      root.hidden = false;
      Array.prototype.forEach.call(openers, function (btn) {
        btn.hidden = false;
      });
      setStatus("Generated from one notes file. It can be wrong — verify anything you rely on.");
      return true;
    })
    .catch(function () {
      /* stay hidden */
    });
})();
