/* Shared accessible modal dialog for the viewer (js/app.js) and the editor
 * (js/editor.js). Implements the WAI-ARIA modal dialog pattern:
 *   - focus moves to the dialog title on open
 *   - Tab / Shift+Tab cycle inside the dialog (focus trap)
 *   - Escape closes (via the caller's onRequestClose)
 *   - focus returns to the trigger on close
 *   - aria-labelledby links the title; the rest of the page is inert
 *   - background scroll is locked while open
 * Callers keep their own click delegation for the close button / overlay
 * and call KB_DIALOG.close() from their closeModal().
 */
(function () {
  "use strict";

  var current = null;

  function focusable(container) {
    var nodes = container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return Array.prototype.filter.call(nodes, function (el) {
      return el.getClientRects().length > 0;
    });
  }

  /* make every body child except the modal root unreachable for AT + pointer */
  function setBackgroundInert(root, on) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === root || el.tagName === "SCRIPT") return;
      if (on) {
        el.setAttribute("inert", "");
        el.setAttribute("aria-hidden", "true");
      } else {
        el.removeAttribute("inert");
        el.removeAttribute("aria-hidden");
      }
    });
  }

  function open(opts) {
    if (current) close();
    var root = opts.root;
    var prevFocus = document.activeElement;

    root.innerHTML =
      '<div class="modal-overlay" data-action="close-modal">' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head"><h2 id="modal-title" tabindex="-1"></h2>' +
      '<button type="button" class="modal-close" data-action="close-modal" aria-label="' + opts.closeLabel + '">✕</button>' +
      '</div><div id="modal-body" class="modal-body"></div></div></div>';
    document.getElementById("modal-title").innerHTML = opts.titleHTML;
    document.getElementById("modal-body").innerHTML = opts.bodyHTML;

    var dialog = root.querySelector(".modal");
    var state = {
      root: root,
      dialog: dialog,
      prevFocus: prevFocus,
      prevOverflow: document.documentElement.style.overflow
    };
    current = state;

    setBackgroundInert(root, true);
    document.documentElement.style.overflow = "hidden";

    state.onKeydown = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (opts.onRequestClose) opts.onRequestClose();
        else close();
        return;
      }
      if (e.key !== "Tab") return;
      var items = focusable(dialog);
      if (!items.length) { e.preventDefault(); return; }
      var first = items[0];
      var last = items[items.length - 1];
      var active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", state.onKeydown, true);

    /* title first, so screen readers announce the dialog name */
    document.getElementById("modal-title").focus();
  }

  function close() {
    if (!current) return;
    var s = current;
    current = null;
    document.removeEventListener("keydown", s.onKeydown, true);
    setBackgroundInert(s.root, false);
    document.documentElement.style.overflow = s.prevOverflow;
    s.root.innerHTML = "";
    var target = (s.prevFocus && s.prevFocus.isConnected) ? s.prevFocus
      : (document.getElementById("main") || document.getElementById("editor-main"));
    if (target && target.focus) target.focus();
  }

  window.KB_DIALOG = { open: open, close: close };
})();
