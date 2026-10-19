/* Kompetenzbrille – plain client-side app.
 * Loads the QUADRIGA data literacy framework (fixed: de + en translations)
 * and study-program representations from data/manifest.yaml, and provides
 * bidirectional views:
 *   program view   : study program -> framework (what is addressed where?)
 *   framework view : framework competency -> modules of one or more programs
 *   matrix view    : heatmap competencies x modules
 * A single "Language" switcher controls UI strings AND the framework locale.
 */
(function () {
  "use strict";

  /* ================= data registry ================= */

  var FRAMEWORK_ID = "quadriga-dlf";
  var FRAMEWORK_FILES = {
    de: "data/frameworks/quadriga-dlf.de.yaml",
    en: "data/frameworks/quadriga-dlf.en.yaml"
  };
  var FWLOCALES = {};   // lang -> framework data
  var PROGRAMS = [];    // program data objects

  /* fetch + parse a YAML data file (parser: js-yaml, vendored at js/vendor/) */
  function fetchYaml(path) {
    if (!window.jsyaml) {
      var setupErr = new Error("js-yaml not loaded");
      setupErr.code = "setup";
      return Promise.reject(setupErr);
    }
    return fetch(path).then(function (r) {
      if (!r.ok) {
        var httpErr = new Error("HTTP " + r.status + " for " + path);
        httpErr.status = r.status;
        httpErr.path = path;
        throw httpErr;
      }
      return r.text();
    }).then(function (txt) {
      return window.jsyaml.load(txt);
    });
  }

  /* ================= state ================= */

  var state = {
    lang: "de",                 // UI + framework language (single switcher)
    view: "program",            // program | framework | matrix
    programId: null,            // program view + matrix
    programIds: [],             // framework view (multi)
    arrange: "byCompetency",    // byCompetency | byModule
    phases: null,               // Set of phase ids (null = all)
    comps: null,                // Set of competency codes (null = all)
    dims: { knowledge: true, skills: true, examples: true },
    minLevel: 1,
    onlyAddressed: false,
    cats: null,                 // Set of category ids (null = all)
    selectedComp: null,         // framework view
    compareFilter: "all"        // all | diff | shared (framework view, active with 2+ programs)
  };

  /* ================= helpers ================= */

  function t(key) {
    var dict = window.I18N[state.lang] || window.I18N.de;
    return dict[key] !== undefined ? dict[key] : (window.I18N.de[key] || key);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fw() {
    return FWLOCALES[state.lang] || FWLOCALES[Object.keys(FWLOCALES)[0]] || null;
  }
  function programById(id) {
    for (var i = 0; i < PROGRAMS.length; i++) if (PROGRAMS[i].id === id) return PROGRAMS[i];
    return null;
  }
  function phaseById(f, id) {
    for (var i = 0; i < f.phases.length; i++) if (f.phases[i].id === id) return f.phases[i];
    return null;
  }
  function compByCode(f, code) {
    for (var i = 0; i < f.competencies.length; i++) if (f.competencies[i].code === code) return f.competencies[i];
    return null;
  }
  function moduleByCode(p, code) {
    for (var i = 0; i < p.modules.length; i++) if (p.modules[i].code === code) return p.modules[i];
    return null;
  }

  function phaseColorVar(phaseId) { return "var(--phase-" + phaseId + ")"; }

  /* phases outside the data flow (Orientierungswissen, id "0") are shown without a number */
  function phaseNumbered(ph) { return ph.id !== "0"; }
  function phaseTitle(ph) { return phaseNumbered(ph) ? ph.id + ". " + ph.title : ph.title; }
  function phaseNoBadge(ph) { return phaseNumbered(ph) ? '<span class="phase-no">' + esc(ph.id) + "</span>" : ""; }

  /* mappings for a module, restricted to the QUADRIGA framework */
  function moduleMappings(mod) {
    if (!mod.mappings) return [];
    return mod.mappings.filter(function (m) { return m.framework === FRAMEWORK_ID; });
  }

  /* aggregated: competency code -> [{ program, module, mapping }] */
  function competencyIndex(programIds) {
    var idx = {};
    programIds.forEach(function (pid) {
      var p = programById(pid);
      if (!p) return;
      p.modules.forEach(function (mod) {
        if (!catsPass(mod)) return;
        moduleMappings(mod).forEach(function (m) {
          if (m.level < state.minLevel) return;
          (idx[m.competency] = idx[m.competency] || []).push({ program: p, module: mod, mapping: m });
        });
      });
    });
    return idx;
  }

  function catsPass(mod) {
    return !state.cats || state.cats.has(mod.category);
  }
  function phasesPass(phaseId) {
    return !state.phases || state.phases.has(phaseId);
  }
  function compsPass(code) {
    return !state.comps || state.comps.has(code);
  }

  function levelLabel(l) { return t("level" + l); }

  function levelDots(l) {
    var s = '<span class="lvl-dots" title="' + esc(levelLabel(l)) + '">';
    for (var i = 1; i <= 3; i++) s += '<i class="' + (i <= l ? "on-" + l : "") + '"></i>';
    return s + "</span>";
  }

  function noteText(mapping) {
    if (!mapping.note) return "";
    if (typeof mapping.note === "string") return mapping.note;
    return mapping.note[state.lang] || mapping.note.de || mapping.note.en || "";
  }

  function catLabel(program, catId) {
    var c = (program.categories || []).filter(function (x) { return x.id === catId; })[0];
    return c ? c.label : catId;
  }

  /* display label for a program: institution abbreviation + title */
  function programLabel(p) {
    return (p.institutionAbbr ? p.institutionAbbr + " · " : "") + p.title;
  }

  /* <option> list for a program picker; already chosen programs stay disabled */
  function programOptions(selectedId, disabledIds) {
    return PROGRAMS.map(function (p) {
      var disabled = disabledIds.indexOf(p.id) >= 0 && p.id !== selectedId;
      return '<option value="' + esc(p.id) + '"' + (p.id === selectedId ? " selected" : "") +
        (disabled ? " disabled" : "") + ">" + esc(programLabel(p)) + "</option>";
    }).join("");
  }

  /* anchor linking to the institution's website (falls back to plain text) */
  function institutionAnchor(p) {
    if (!p.institution) return p.institutionAbbr || "";
    var text = p.institutionAbbr ? p.institutionAbbr + " – " + p.institution : p.institution;
    if (p.institutionUrl) {
      return '<a href="' + esc(p.institutionUrl) + '" target="_blank" rel="noopener">' + esc(text) + " ↗</a>";
    }
    return esc(text);
  }

  /* unique institutions among a list of program ids, in selection order */
  function institutionsOf(ids) {
    var out = [];
    ids.forEach(function (id) {
      var p = programById(id);
      if (!p || !p.institution) return;
      if (!out.some(function (q) { return q.institution === p.institution; })) out.push(p);
    });
    return out;
  }

  /* ---------- comparison helpers (framework view) ---------- */

  /* comparison is available as soon as two programs are selected */
  function compareActive() {
    return state.programIds.length >= 2;
  }

  /* stable color slot for the n-th selected program */
  function programColorClass(pid) {
    var i = state.programIds.indexOf(pid);
    return "p" + ((i < 0 ? 0 : i) % 6);
  }

  /* compact label for legend and tooltips: degree + discipline initials */
  function programShortLabel(p) {
    var title = String(p.title || p.id || "").trim();
    var degree = "";
    var m = title.match(/^(BA|MA|B\.A\.|M\.A\.)\s+/i);
    if (m) {
      degree = m[1].replace(/\./g, "").toUpperCase();
      title = title.slice(m[0].length);
    }
    var extra = "";
    var pm = title.match(/\(([^)]*)\)/);
    if (pm) {
      extra = pm[1].split(/[^\wÄÖÜäöüß]+/).filter(Boolean).slice(0, 2)
        .map(function (w) { return w.charAt(0).toUpperCase(); }).join("");
      title = title.replace(/\([^)]*\)/g, " ");
    }
    var stop = { und: 1, and: 1, der: 1, die: 1, das: 1, the: 1, of: 1, "in": 1, "für": 1, for: 1 };
    var words = title.split(/[^\wÄÖÜäöüß]+/).filter(function (w) {
      return w && !stop[w.toLowerCase()];
    });
    var initials = words.map(function (w) { return w.charAt(0).toUpperCase(); }).join("");
    if (initials.length < 2 && words.length === 1) initials = words[0].slice(0, 3).toUpperCase();
    var out = [degree, initials].filter(Boolean).join(" ");
    if (extra) out += " " + extra;
    return out || p.id;
  }

  /* distinct program ids that address a competency, in selection order */
  function addressedProgramIds(idx, code) {
    var seen = {};
    (idx[code] || []).forEach(function (e) { seen[e.program.id] = true; });
    return state.programIds.filter(function (pid) { return seen[pid]; });
  }

  /* does a competency show up under the current comparison mode? */
  function compPassesCompareFilter(idx, code) {
    var n = addressedProgramIds(idx, code).length;
    var total = state.programIds.length;
    if (state.compareFilter === "diff") return n >= 1 && n < total;
    if (state.compareFilter === "shared") return n === total;
    return true;
  }

  /* ================= persistence / url hash ================= */

  var PERSIST_KEY = "kompetenzbrille.state.v1";

  function saveState() {
    var s = Object.assign({}, state, {
      phases: state.phases ? Array.from(state.phases) : null,
      comps: state.comps ? Array.from(state.comps) : null,
      cats: state.cats ? Array.from(state.cats) : null
    });
    try { localStorage.setItem(PERSIST_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    writeHash();
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s.lang) state.lang = s.lang;
      ["view", "programId", "arrange", "minLevel", "onlyAddressed", "selectedComp", "compareFilter"].forEach(function (k) {
        if (s[k] !== undefined && s[k] !== null) state[k] = s[k];
      });
      if (Array.isArray(s.programIds)) state.programIds = s.programIds;
      if (s.dims) state.dims = Object.assign({ knowledge: true, skills: true, examples: true }, s.dims);
      if (Array.isArray(s.phases)) state.phases = new Set(s.phases);
      if (Array.isArray(s.comps)) state.comps = new Set(s.comps);
      if (Array.isArray(s.cats)) state.cats = new Set(s.cats);
    } catch (e) { /* ignore */ }
  }

  function writeHash() {
    var parts = ["view=" + state.view, "lang=" + state.lang];
    if (state.view === "framework") {
      if (state.programIds.length) parts.push("programs=" + state.programIds.join(","));
      if (state.selectedComp) parts.push("comp=" + encodeURIComponent(state.selectedComp));
      if (state.compareFilter !== "all") parts.push("cf=" + state.compareFilter);
    } else if (state.programId) {
      parts.push("program=" + encodeURIComponent(state.programId));
    }
    history.replaceState(null, "", "#" + parts.join("&"));
  }

  function readHash() {
    if (!location.hash || location.hash.length < 2) return;
    var params = {};
    location.hash.slice(1).split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p.length === 2) params[p[0]] = decodeURIComponent(p[1]);
    });
    if (params.view) state.view = params.view;
    if (params.lang) state.lang = params.lang;
    if (params.program) state.programId = params.program;
    if (params.programs) state.programIds = params.programs.split(",").filter(Boolean);
    if (params.comp) state.selectedComp = params.comp;
    if (params.cf) state.compareFilter = params.cf;
  }

  /* ================= boot ================= */

  function boot() {
    var jobs = [];
    Object.keys(FRAMEWORK_FILES).forEach(function (lang) {
      jobs.push(fetchYaml(FRAMEWORK_FILES[lang]).then(function (fwData) {
        FWLOCALES[fwData.language || lang] = fwData;
      }));
    });
    jobs.push(fetchYaml("data/manifest.yaml").then(function (manifest) {
      /* load sequentially to keep the manifest order (stable UI + default) */
      return (manifest.programs || []).reduce(function (chain, path) {
        return chain.then(function () {
          return fetchYaml(path).then(function (p) { PROGRAMS.push(p); });
        });
      }, Promise.resolve());
    }));

    readHash();   // hash wins over localStorage
    loadState();  // fills gaps
    readHash();   // and hash again so a shared link always wins

    Promise.all(jobs)
      .then(function () {
        validateState();
        renderAll();
      })
      .catch(function (err) {
        console.error(err);
        showLoadError(err);
      });
  }

  /* Friendly failure screen: a 404 for missing data, otherwise a 503. */
  function showLoadError(err) {
    var status = "503";
    var titleKey = "errorUnavailable";
    var msgKey = "errorUnavailableMsg";
    if (err && err.code === "setup") {
      msgKey = "errorSetup";
    } else if (err && err.status === 404) {
      status = "404";
      titleKey = "errorNotFound";
      msgKey = "errorNotFoundMsg";
    }
    var main = document.getElementById("main");
    if (!main) return;
    main.innerHTML =
      '<div class="load-error">' +
        '<div class="load-error-code">' + status + "</div>" +
        "<h2>" + esc(t(titleKey)) + "</h2>" +
        "<p>" + esc(t(msgKey)) + "</p>" +
        '<button type="button" class="load-error-retry">' + esc(t("retry")) + "</button>" +
      "</div>";
    var btn = main.querySelector(".load-error-retry");
    if (btn) btn.addEventListener("click", function () { location.reload(); });
  }

  function validateState() {
    var langs = Object.keys(FWLOCALES);
    if (langs.length && langs.indexOf(state.lang) < 0) state.lang = langs.indexOf("de") >= 0 ? "de" : langs[0];
    if (["program", "framework", "matrix"].indexOf(state.view) < 0) state.view = "program";
    if (!state.programId || !programById(state.programId)) state.programId = PROGRAMS.length ? PROGRAMS[0].id : null;
    state.programIds = state.programIds.filter(function (id) { return programById(id); });
    if (!state.programIds.length && PROGRAMS.length) state.programIds = [PROGRAMS[0].id];
    var f = fw();
    if (state.selectedComp && f && !compByCode(f, state.selectedComp)) state.selectedComp = null;
    if (["all", "diff", "shared"].indexOf(state.compareFilter) < 0) state.compareFilter = "all";
  }

  /* ================= chrome (header/tabs/selects) ================= */

  function renderChrome() {
    document.getElementById("lbl-language").textContent = t("language");

    var tabs = document.getElementById("view-tabs");
    tabs.innerHTML = "";
    [["program", t("viewProgram")], ["framework", t("viewFramework")], ["matrix", t("viewMatrix")]].forEach(function (v) {
      var b = document.createElement("button");
      b.className = "view-tab" + (state.view === v[0] ? " active" : "");
      b.textContent = v[1];
      b.setAttribute("data-action", "set-view");
      b.setAttribute("data-value", v[0]);
      tabs.appendChild(b);
    });

    var selLang = document.getElementById("sel-lang");
    selLang.innerHTML = "";
    Object.keys(FWLOCALES).forEach(function (lang) {
      var o = document.createElement("option");
      o.value = lang;
      o.textContent = lang === "de" ? "Deutsch" : lang === "en" ? "English" : lang.toUpperCase();
      selLang.appendChild(o);
    });
    selLang.value = state.lang;
  }

  /* ================= sidebar ================= */

  function renderSidebar() {
    var sb = document.getElementById("sidebar");
    var f = fw();
    var h = "";

    /* --- program selectors --- */
    if (state.view === "framework") {
      h += '<section class="filter-section"><h3>' + esc(t("programs")) + '</h3><div class="prog-list">';
      state.programIds.forEach(function (pid, i) {
        var others = state.programIds.filter(function (_, j) { return j !== i; });
        var p = programById(pid);
        h += '<div class="prog-row">';
        /* added programs (not the primary one) get a small remove button in front of the picker */
        if (i > 0) {
          h += '<button type="button" class="prog-remove" data-action="remove-framework-program" data-index="' + i + '" title="' +
            esc(t("removeProgram")) + '" aria-label="' + esc(t("removeProgram")) + '">\u2715</button>';
        }
        h += '<select data-action="set-framework-program" data-index="' + i + '" title="' +
          esc(p ? programLabel(p) : "") + '">' + programOptions(pid, others) + "</select>";
        h += "</div>";
      });
      h += "</div>";
      var remaining = PROGRAMS.filter(function (p) { return state.programIds.indexOf(p.id) < 0; });
      if (remaining.length) {
        h += '<button type="button" class="prog-add" data-action="add-framework-program">+ ' + esc(t("addProgram")) + "</button>";
      }
      var insts = institutionsOf(state.programIds);
      if (insts.length) h += '<p class="inst-link">' + esc(t(insts.length > 1 ? "institutions" : "institution")) + ": " + insts.map(institutionAnchor).join(" · ") + "</p>";
      h += "</section>";
    } else {
      h += '<section class="filter-section"><h3>' + esc(t("program")) + '</h3><select data-action="set-program">';
      PROGRAMS.forEach(function (p) {
        h += '<option value="' + esc(p.id) + '"' + (state.programId === p.id ? " selected" : "") + ">" + esc(programLabel(p)) + "</option>";
      });
      h += "</select>";
      var curProg = programById(state.programId);
      if (curProg && curProg.institution) h += '<p class="inst-link">' + esc(t("institution")) + ": " + institutionAnchor(curProg) + "</p>";
      h += "</section>";
    }

    /* --- comparison mode (framework view; available with two or more programs) --- */
    if (state.view === "framework") {
      h += '<section class="filter-section"><h3>' + esc(t("compare")) + '</h3>';
      if (compareActive()) {
        h += '<div class="seg">';
        [["all", t("compareFilterAll")], ["diff", t("compareFilterDiff")], ["shared", t("compareFilterShared")]].forEach(function (o) {
          h += '<button type="button" data-action="set-compare-filter" data-value="' + o[0] + '" class="' +
            (state.compareFilter === o[0] ? "active" : "") + '">' + esc(o[1]) + "</button>";
        });
        h += "</div>";
      } else {
        h += '<p class="muted small" style="margin:0">' + esc(t("compareNeedsTwo")) + "</p>";
      }
      h += "</section>";
    }

    /* --- arrangement (program view only) --- */
    if (state.view === "program") {
      h += '<section class="filter-section"><h3>' + esc(t("arrangement")) + '</h3><div class="seg">' +
        '<button data-action="set-arrange" data-value="byCompetency" class="' + (state.arrange === "byCompetency" ? "active" : "") + '">' + esc(t("arrangeByCompetency")) + "</button>" +
        '<button data-action="set-arrange" data-value="byModule" class="' + (state.arrange === "byModule" ? "active" : "") + '">' + esc(t("arrangeByModule")) + "</button>" +
        "</div></section>";
    }

    /* --- module categories --- */
    var cats = {};
    PROGRAMS.forEach(function (p) { (p.categories || []).forEach(function (c) { cats[c.id] = c.label; }); });
    var catIds = Object.keys(cats);
    if (catIds.length) {
      h += '<section class="filter-section"><h3>' + esc(t("moduleCategories")) + '</h3>';
      catIds.forEach(function (cid) {
        h += '<label><input type="checkbox" data-action="toggle-cat" value="' + esc(cid) + '"' +
          (!state.cats || state.cats.has(cid) ? " checked" : "") + "> " + esc(cats[cid]) + "</label>";
      });
      h += "</section>";
    }

    /* --- min level --- */
    h += '<section class="filter-section"><h3>' + esc(t("minLevel")) + '</h3><select data-action="set-minlevel">';
    [1, 2, 3].forEach(function (l) {
      h += '<option value="' + l + '"' + (state.minLevel === l ? " selected" : "") + ">≥ " + l + " – " + esc(t("level" + l)) + "</option>";
    });
    h += "</select></section>";

    /* --- phases / competencies / dimensions (program + matrix views) --- */
    if (state.view !== "framework" && f) {
      h += '<section class="filter-section"><h3>' + esc(t("phases")) + '</h3>' +
        '<div class="check-tools"><button data-action="phases-all">' + esc(t("all")) + '</button><button data-action="phases-none">' + esc(t("none")) + "</button></div>";
      f.phases.forEach(function (ph) {
        h += '<label title="' + esc(ph.note || ph.text || "") + '"><input type="checkbox" data-action="toggle-phase" value="' + esc(ph.id) + '"' +
          (!state.phases || state.phases.has(ph.id) ? " checked" : "") + '><span><span class="phase-dot" style="background:' +
          phaseColorVar(ph.id) + '"></span>' + esc(phaseTitle(ph)) + "</span></label>";
      });
      h += "</section>";

      h += '<section class="filter-section"><h3>' + esc(t("competencies")) + '</h3>' +
        '<div class="check-tools"><button data-action="comps-all">' + esc(t("all")) + '</button><button data-action="comps-none">' + esc(t("none")) + "</button></div>";
      f.phases.forEach(function (ph) {
        var comps = f.competencies.filter(function (c) { return c.phase === ph.id; });
        if (!comps.length) return;   /* e.g. Orientierungswissen (phase 0) defines no competencies yet */
        h += '<span class="filter-group-label"><span class="phase-dot" style="background:' + phaseColorVar(ph.id) + '"></span>' + esc(ph.title) + "</span>";
        comps.forEach(function (c) {
          h += '<label><input type="checkbox" data-action="toggle-comp" value="' + esc(c.code) + '"' +
            (!state.comps || state.comps.has(c.code) ? " checked" : "") + "> " + esc(c.code + " " + c.title) + "</label>";
        });
      });
      h += "</section>";

      h += '<section class="filter-section"><h3>' + esc(t("dimensions")) + '</h3>';
      f.dimensions.forEach(function (d) {
        h += '<label><input type="checkbox" data-action="toggle-dim" value="' + esc(d.id) + '"' +
          (state.dims[d.id] !== false ? " checked" : "") + "> " + esc(d.label) + "</label>";
      });
      h += "</section>";

      if (state.view === "program") {
        h += '<section class="filter-section"><label><input type="checkbox" data-action="toggle-only-addressed"' +
          (state.onlyAddressed ? " checked" : "") + "> " + esc(t("onlyAddressed")) + "</label></section>";
      }
    }

    sb.innerHTML = h;
  }

  /* ================= shared fragments ================= */

  /* description fragment for phases that define no competencies (e.g. Orientierungswissen, phase 0) */
  function phaseBlurb(ph) {
    var h = '<p class="phase-blurb">' + esc(ph.text || t("phaseNoComps")) + "</p>";
    if (ph.note) h += '<p class="phase-blurb-note">' + esc(ph.note) + "</p>";
    return h;
  }

  function frameworkSourceLine(f) {
    var s = '<p class="modal-src">' + esc(t("source")) + ": ";
    if (f.source) s += '<a href="' + esc(f.source) + '" target="_blank" rel="noopener">' + esc(f.title) + "</a>";
    else s += esc(f.title);
    if (f.doi) s += ' · <a href="' + esc(f.doi) + '" target="_blank" rel="noopener">DOI</a>';
    return s + "</p>";
  }

  function dimRows(f, comp) {
    var h = '<div class="comp-dims">';
    f.dimensions.forEach(function (d) {
      if (state.dims[d.id] === false) return;
      if (!comp[d.id]) return;
      h += '<div class="dim"><span class="dim-label">' + esc(d.label) + '</span><span>' + esc(comp[d.id]) + "</span></div>";
    });
    return h + "</div>";
  }

  function moduleChip(entry) {
    return '<span class="mod-chip" data-action="open-module" data-program="' + esc(entry.program.id) + '" data-module="' + esc(entry.module.code) + '">' +
      '<span class="code">' + esc(entry.module.code) + "</span>" + levelDots(entry.mapping.level) + "</span>";
  }

  /* ================= program view ================= */

  function renderProgramView() {
    var f = fw();
    var p = programById(state.programId);
    var main = document.getElementById("main");
    if (!f || !p) { main.innerHTML = '<div class="hint-box">' + esc(t("selectProgramHint")) + "</div>"; return; }

    var idx = competencyIndex([p.id]);
    var h = coverageBlock(f, p, idx);

    if (state.arrange === "byModule") {
      h += renderByModule(f, p, idx);
    } else {
      h += renderByCompetency(f, p, idx);
    }
    main.innerHTML = h;
  }

  function coverageBlock(f, p, idx) {
    var total = f.competencies.length;
    var addressed = f.competencies.filter(function (c) { return idx[c.code] && idx[c.code].length; });
    var h = '<div class="coverage"><div class="coverage-head"><strong>' + esc(t("coverage")) + ": " + esc(p.title) + "</strong>" +
      "<span>" + addressed.length + " " + esc(t("coverageOf")) + " " + total + " " + esc(t("competenciesAddressed")) + "</span></div>" +
      '<div class="coverage-bar">';
    f.phases.forEach(function (ph) {
      var comps = f.competencies.filter(function (c) { return c.phase === ph.id; });
      var cov = comps.filter(function (c) { return idx[c.code] && idx[c.code].length; }).length;
      if (!comps.length) return;
      var w = (comps.length / total) * 100;
      var op = 0.25 + 0.75 * (cov / comps.length);
      h += '<span style="width:' + w + "%;background:" + phaseColorVar(ph.id) + ";opacity:" + op.toFixed(2) + '" title="' +
        esc(ph.title + ": " + cov + "/" + comps.length) + '"></span>';
    });
    h += '</div><p class="coverage-note">' + esc(t("editorialNote")) + "</p></div>";
    return h;
  }

  function renderByCompetency(f, p, idx) {
    var h = "";
    f.phases.forEach(function (ph) {
      if (!phasesPass(ph.id)) return;
      var comps = f.competencies.filter(function (c) { return c.phase === ph.id && compsPass(c.code); });
      if (state.onlyAddressed) comps = comps.filter(function (c) { return idx[c.code] && idx[c.code].length; });
      if (!f.competencies.some(function (c) { return c.phase === ph.id; })) {
        /* phase without competencies (Orientierungswissen) — show its description */
        h += '<section class="phase-section" style="--phase-color:' + phaseColorVar(ph.id) + '">' +
          '<div class="phase-header">' + phaseNoBadge(ph) + "<h2>" + esc(ph.title) + "</h2></div>" +
          phaseBlurb(ph) + "</section>";
        return;
      }
      if (!comps.length) return;

      var cov = f.competencies.filter(function (c) { return c.phase === ph.id && idx[c.code] && idx[c.code].length; }).length;
      var all = f.competencies.filter(function (c) { return c.phase === ph.id; }).length;

      h += '<section class="phase-section" style="--phase-color:' + phaseColorVar(ph.id) + '">' +
        '<div class="phase-header">' + phaseNoBadge(ph) + "<h2>" + esc(ph.title) + "</h2>" +
        '<span class="coverage-mini">' + cov + "/" + all + " " + esc(t("competenciesAddressed")) + '</span></div><div class="comp-grid">';

      comps.forEach(function (c) {
        var entries = idx[c.code] || [];
        var cls = "comp-card" + (entries.length ? "" : " unaddressed");
        h += '<article class="' + cls + '">' +
          '<div class="comp-card-head"><span class="comp-code" data-action="open-comp" data-comp="' + esc(c.code) + '">' + esc(c.code) + '</span>' +
          '<span class="comp-title" data-action="open-comp" data-comp="' + esc(c.code) + '">' + esc(c.title) + "</span></div>" +
          dimRows(f, c) +
          '<div class="comp-mods"><span class="comp-mods-label">' + esc(t("addressedIn")) + ":</span>";
        if (entries.length) {
          entries.sort(function (a, b) { return b.mapping.level - a.mapping.level || a.module.code.localeCompare(b.module.code); });
          entries.forEach(function (e) { h += moduleChip(e); });
        } else {
          h += '<span class="muted small">' + esc(t("emptyMatrixCell")) + "</span>";
        }
        h += "</div></article>";
      });
      h += "</div></section>";
    });
    return h || '<div class="hint-box">' + esc(t("noModulesSelected")) + "</div>";
  }

  function renderByModule(f, p, idx) {
    var mods = p.modules.filter(catsPass);
    if (!mods.length) return '<div class="hint-box">' + esc(t("noModulesSelected")) + "</div>";
    var h = "";
    mods.forEach(function (mod) {
      var maps = moduleMappings(mod).filter(function (m) {
        return m.level >= state.minLevel && compByCode(f, m.competency) &&
          phasesPass(compByCode(f, m.competency).phase) && compsPass(m.competency);
      });
      h += '<article class="mod-card"><div class="mod-card-head">' +
        '<span class="mod-code" data-action="open-module" data-program="' + esc(p.id) + '" data-module="' + esc(mod.code) + '">' + esc(mod.code) + "</span>" +
        '<span class="mod-title">' + esc(mod.title) + "</span>" +
        '<span class="cat-badge ' + esc(mod.category) + '">' + esc(catLabel(p, mod.category)) + "</span>" +
        '<span class="mod-meta">' + esc(mod.credits + " " + t("credits")) + "</span></div>";

      if (maps.length) {
        h += '<div class="mod-mappings">';
        maps.sort(function (a, b) { return a.competency.localeCompare(b.competency, undefined, { numeric: true }); });
        maps.forEach(function (m) {
          var c = compByCode(f, m.competency);
          h += '<div class="mapping-row" style="--phase-color:' + phaseColorVar(c.phase) + '">' +
            '<div><span class="m-comp" data-action="open-comp" data-comp="' + esc(c.code) + '">' + esc(c.code + " " + c.title) + "</span>" +
            '<div class="mapping-lvl">' + levelDots(m.level) + " " + esc(levelLabel(m.level)) + "</div></div>" +
            '<div class="m-note">' + esc(noteText(m)) + "</div></div>";
        });
        h += "</div>";
      } else {
        h += '<p class="muted small" style="margin:8px 0 0">' + esc(t("moduleNoCompetenciesFiltered")) + "</p>";
      }
      h += "</article>";
    });
    return h;
  }

  /* ================= framework view ================= */

  /* compact overview of the comparison: per-program coverage + shared/difference counts */
  function compareSummary(f, idx) {
    var h = '<div class="cmp-summary"><div class="cmp-summary-head"><strong>' + esc(t("compare")) + "</strong>";
    if (state.programIds.length < 2) {
      h += '<span class="muted small">' + esc(t("compareNeedsTwo")) + "</span></div></div>";
      return h;
    }
    var perProgram = {};
    var diff = 0, shared = 0;
    var total = state.programIds.length;
    f.competencies.forEach(function (c) {
      var ids = addressedProgramIds(idx, c.code);
      ids.forEach(function (pid) { perProgram[pid] = (perProgram[pid] || 0) + 1; });
      if (ids.length === total) shared++;
      else if (ids.length >= 1) diff++;
    });
    h += "</div>";
    h += '<div class="cmp-legend">';
    state.programIds.forEach(function (pid) {
      var p = programById(pid);
      if (!p) return;
      h += '<span class="cmp-legend-item" title="' + esc(programLabel(p)) + '"><span class="pdot ' + programColorClass(pid) + '"></span>' +
        esc((p.institutionAbbr ? p.institutionAbbr + " · " : "") + programShortLabel(p)) +
        ' <span class="muted small">' + (perProgram[pid] || 0) + "/" + f.competencies.length + "</span></span>";
    });
    h += "</div>";
    h += '<div class="cmp-stats"><span>' + esc(t("compareSharedShort")) + ": <strong>" + shared + "</strong></span>" +
      '<span>' + esc(t("compareDiffShort")) + ": <strong>" + diff + "</strong></span></div>";
    return h + "</div>";
  }

  /* one module card as used in the framework detail list */
  function frameworkModuleCard(e, showProgram) {
    return '<article class="mod-card"><div class="mod-card-head">' +
      '<span class="mod-code" data-action="open-module" data-program="' + esc(e.program.id) + '" data-module="' + esc(e.module.code) + '">' + esc(e.module.code) + "</span>" +
      '<span class="mod-title">' + esc(e.module.title) + "</span>" +
      '<span class="cat-badge ' + esc(e.module.category) + '">' + esc(catLabel(e.program, e.module.category)) + "</span>" +
      '<span class="mod-meta">' + esc((showProgram ? e.program.title + " · " : "") + e.module.credits + " " + t("credits")) + "</span></div>" +
      '<div class="mapping-lvl" style="margin-top:6px">' + levelDots(e.mapping.level) + " " + esc(levelLabel(e.mapping.level)) + "</div>" +
      '<p class="m-note" style="margin:6px 0 0">' + esc(noteText(e.mapping)) + "</p>" +
      '<details class="mod-extra"><summary>' + esc(t("showDetails")) + "</summary>" +
      '<h3>' + esc(t("goals")) + '</h3><p class="goals">' + esc(e.module.goals) + "</p>" +
      (e.module.topics && e.module.topics.length ?
        '<h3>' + esc(t("topics")) + '</h3><ul class="topics">' +
        e.module.topics.map(function (tp) { return "<li>" + esc(tp) + "</li>"; }).join("") + "</ul>" : "") +
      "</details></article>";
  }

  /* detail list grouped by study program (comparison mode) */
  function frameworkCompareDetail(code, idx) {
    var h = "";
    state.programIds.forEach(function (pid) {
      var p = programById(pid);
      if (!p) return;
      var ents = (idx[code] || []).filter(function (e) { return e.program.id === pid; }).sort(function (a, b) {
        return b.mapping.level - a.mapping.level || a.module.code.localeCompare(b.module.code);
      });
      var best = ents.length ? ents.reduce(function (a, b) { return a.mapping.level >= b.mapping.level ? a : b; }) : null;
      h += '<section class="cmp-prog"><div class="cmp-prog-head">' +
        '<span class="pdot ' + programColorClass(pid) + '"></span>' +
        "<strong>" + esc(programLabel(p)) + "</strong>";
      if (ents.length) h += '<span class="cmp-prog-level">' + esc(t("bestLevel")) + ": " + levelDots(best.mapping.level) + " " + esc(levelLabel(best.mapping.level)) + "</span>";
      h += '<span class="cmp-prog-count">' + (ents.length ? ents.length + " " + esc(t("modules")) : esc(t("notAddressedShort"))) + "</span></div>";
      if (ents.length) ents.forEach(function (e) { h += frameworkModuleCard(e, false); });
      else h += '<p class="muted small" style="margin:6px 0 0">' + esc(t("notAddressed")) + "</p>";
      h += "</section>";
    });
    return h;
  }

  function renderFrameworkView() {
    var f = fw();
    var main = document.getElementById("main");
    if (!f) { main.innerHTML = '<div class="hint-box"></div>'; return; }
    var idx = competencyIndex(state.programIds);
    var cmp = compareActive();

    var h = "";

    /* comparison summary */
    if (compareActive()) h += compareSummary(f, idx);

    /* picker grouped by phase */
    f.phases.forEach(function (ph) {
      var comps = f.competencies.filter(function (c) { return c.phase === ph.id; });
      if (cmp) {
        comps = comps.filter(function (c) { return compPassesCompareFilter(idx, c.code); });
      }
      if (!f.competencies.some(function (c) { return c.phase === ph.id; })) {
        /* phase without competencies (Orientierungswissen) — compact blurb row */
        h += '<section class="fw-phase" style="--phase-color:' + phaseColorVar(ph.id) + '">' +
          '<div class="fw-phase-head"><span class="phase-dot"></span><h3>' + esc(phaseTitle(ph)) + "</h3></div>" +
          phaseBlurb(ph) + "</section>";
        return;
      }
      if (!comps.length) return;
      /* one compact row per phase: phase label on the left, competency chips on the right */
      h += '<section class="fw-phase" style="--phase-color:' + phaseColorVar(ph.id) + '">' +
        '<div class="fw-phase-head"><span class="phase-dot"></span><h3>' + esc(phaseTitle(ph)) + "</h3></div>" +
        '<div class="fw-chips">';
      comps.forEach(function (c) {
        var n = (idx[c.code] || []).length;
        var addrs = cmp ? addressedProgramIds(idx, c.code) : null;
        var total = state.programIds.length;
        var cls = "picker-btn" + (state.selectedComp === c.code ? " active" : "");
        if (cmp) {
          if (addrs.length >= 1 && addrs.length < total) cls += " diff";
          else if (addrs.length === total) cls += " shared";
        }
        h += '<button class="' + cls + '" data-action="select-comp" data-comp="' + esc(c.code) + '">' +
          '<span class="code">' + esc(c.code) + "</span>" +
          '<span class="picker-title">' + esc(c.title) + "</span>" +
          '<span class="count' + (n ? "" : " zero") + '">' + n + "</span>";
        if (cmp) {
          h += '<span class="pick-progs">';
          state.programIds.forEach(function (pid) {
            var on = addrs.indexOf(pid) >= 0;
            var pp = programById(pid);
            h += '<span class="pdot ' + programColorClass(pid) + (on ? "" : " off") + '" title="' +
              esc(programLabel(pp) + " \u2013 " + (on ? t("addressedShort") : t("notAddressedShort"))) + '"></span>';
          });
          h += "</span>";
        }
        h += "</button>";
      });
      h += "</div></section>";
    });

    /* detail of selected competency */
    if (state.selectedComp) {
      var c = compByCode(f, state.selectedComp);
      if (c) {
        var entries = (idx[c.code] || []).slice().sort(function (a, b) {
          return b.mapping.level - a.mapping.level || a.program.title.localeCompare(b.program.title) || a.module.code.localeCompare(b.module.code);
        });
        h += '<section class="phase-section" style="--phase-color:' + phaseColorVar(c.phase) + '">' +
          '<div class="phase-header"><span class="phase-no">' + esc(c.code) + "</span><h2>" + esc(c.title) + "</h2>" +
          '<span class="coverage-mini">' + esc(phaseById(f, c.phase).title) + '</span></div>' +
          '<div class="comp-card" style="margin-bottom:14px">' + dimRows(f, c) + "</div>";

        h += '<h3 style="margin:0 0 10px">' + esc(t("addressedIn")) + " (" + entries.length + ")</h3>";
        if (cmp) {
          h += frameworkCompareDetail(c.code, idx);
        } else if (!entries.length) {
          h += '<div class="hint-box">' + esc(t("notAddressed")) + "</div>";
        } else {
          entries.forEach(function (e) { h += frameworkModuleCard(e, true); });
        }
        h += "</section>";
      }
    } else {
      h += '<div class="hint-box">' + esc(t("selectCompetencyHint")) + "</div>";
    }
    main.innerHTML = h;
  }

  /* ================= matrix view ================= */

  function renderMatrixView() {
    var f = fw();
    var p = programById(state.programId);
    var main = document.getElementById("main");
    if (!f || !p) { main.innerHTML = '<div class="hint-box">' + esc(t("selectProgramHint")) + "</div>"; return; }

    var mods = p.modules.filter(catsPass);
    var idx = competencyIndex([p.id]);

    var h = "";

    /* legend */
    h += '<div class="legend"><strong>' + esc(t("legend")) + ":</strong>";
    [1, 2, 3].forEach(function (l) {
      h += '<span class="item"><span class="cell-block l' + l + '"></span>' + esc(l + " – " + t("level" + l)) + "</span>";
    });
    h += '<span class="item"><span class="cell-block" style="background:transparent;border:1px dashed #c6ccd6"></span>' + esc(t("notMapped")) + "</span></div>";

    if (!mods.length) { main.innerHTML = h + '<div class="hint-box">' + esc(t("noModulesSelected")) + "</div>"; return; }

    h += '<div class="matrix-wrap"><table class="matrix"><thead><tr><th></th>';
    mods.forEach(function (m) {
      h += '<th data-action="open-module" data-pop="module" data-program="' + esc(p.id) + '" data-module="' + esc(m.code) + '">' + esc(m.code) + "</th>";
    });
    h += "</tr></thead><tbody>";

    f.phases.forEach(function (ph) {
      if (!phasesPass(ph.id)) return;
      var comps = f.competencies.filter(function (c) { return c.phase === ph.id && compsPass(c.code); });
      if (!f.competencies.some(function (c) { return c.phase === ph.id; })) {
        /* phase without competencies (Orientierungswissen) — a lone phase row, description as tooltip */
        h += '<tr class="phase-row" style="--phase-color:' + phaseColorVar(ph.id) + '">' +
          '<td class="phase-head" title="' + esc(ph.note || ph.text || "") + '">' + esc(phaseTitle(ph)) + "</td>" +
          '<td class="phase-fill" colspan="' + mods.length + '"></td></tr>';
        return;
      }
      if (!comps.length) return;
      /* the phase label sits in the fixed first column; the fill scrolls with the module columns */
      h += '<tr class="phase-row" style="--phase-color:' + phaseColorVar(ph.id) + '">' +
        '<td class="phase-head">' + esc(phaseTitle(ph)) + "</td>" +
        '<td class="phase-fill" colspan="' + mods.length + '"></td></tr>';
      comps.forEach(function (c) {
        h += '<tr style="--phase-color:' + phaseColorVar(c.phase) + '"><td class="row-head" data-action="open-comp" data-pop="comp" data-comp="' + esc(c.code) + '"><span class="code">' + esc(c.code) + "</span>" + esc(c.title) + "</td>";
        mods.forEach(function (m) {
          var entries = (idx[c.code] || []).filter(function (e) { return e.module.code === m.code; });
          if (entries.length) {
            var best = entries.reduce(function (a, b) { return a.mapping.level >= b.mapping.level ? a : b; });
            h += '<td class="cell" data-action="open-cell" data-program="' + esc(p.id) + '" data-module="' + esc(m.code) + '" data-comp="' + esc(c.code) + '" title="' +
              esc(m.code + " × " + c.code + " – " + levelLabel(best.mapping.level)) + '"><span class="cell-block l' + best.mapping.level + '"></span></td>';
          } else {
            h += '<td class="cell empty">' + esc(t("emptyMatrixCell")) + "</td>";
          }
        });
        h += "</tr>";
      });
    });
    h += "</tbody></table></div>";
    main.innerHTML = h;
  }

  /* ================= hover popover (matrix headers) ================= */

  var popShowTimer = null;
  var popHideTimer = null;
  var popAnchor = null;

  function truncate(s, n) {
    s = String(s == null ? "" : s).trim();
    return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "\u2026" : s;
  }

  function getPopover() {
    var root = document.getElementById("popover-root");
    if (!root.firstChild) root.innerHTML = '<div id="popover" class="popover" hidden></div>';
    return root.firstChild;
  }

  function modulePopoverHtml(pid, code) {
    var p = programById(pid);
    var mod = p && moduleByCode(p, code);
    var f = fw();
    if (!p || !mod || !f) return "";
    var maps = moduleMappings(mod).filter(function (m) { return compByCode(f, m.competency); });
    maps.sort(function (a, b) { return a.competency.localeCompare(b.competency, undefined, { numeric: true }); });

    var h = '<div class="pop-head"><span class="pop-code">' + esc(mod.code) + "</span>" + esc(mod.title) + "</div>";
    h += '<p class="pop-kv">' + esc(p.title) + " \u00b7 " + esc(mod.credits + " " + t("credits")) +
      ' \u00b7 <span class="cat-badge ' + esc(mod.category) + '">' + esc(catLabel(p, mod.category)) + "</span></p>";
    if (mod.goals) h += '<p class="pop-goals">' + esc(truncate(mod.goals, 220)) + "</p>";

    h += "<h3>" + esc(t("mappedCompetencies")) + " (" + maps.length + ')</h3><ul class="pop-list">';
    var shown = Math.min(maps.length, 6);
    for (var i = 0; i < shown; i++) {
      var m = maps[i];
      var c = compByCode(f, m.competency);
      h += '<li><span class="code" style="color:' + phaseColorVar(c.phase) + '">' + esc(c.code) + '</span><span class="pop-comp-title">' +
        esc(c.title) + "</span>" + levelDots(m.level) + "</li>";
    }
    h += "</ul>";
    if (maps.length > shown) h += '<p class="pop-more">+ ' + (maps.length - shown) + " \u2026</p>";
    h += '<p class="pop-hint">' + esc(t("popClickDetails")) + "</p>";
    return h;
  }

  function compPopoverHtml(code) {
    var f = fw();
    var c = f && compByCode(f, code);
    if (!f || !c) return "";
    var ph = phaseById(f, c.phase);
    var idx = competencyIndex([state.programId]);
    var n = (idx[c.code] || []).length;

    var h = '<div class="pop-head"><span class="pop-code" style="color:' + phaseColorVar(c.phase) + '">' + esc(c.code) + "</span>" + esc(c.title) + "</div>";
    h += '<p class="pop-kv">' + esc(phaseTitle(ph)) + "</p>";
    f.dimensions.forEach(function (d) {
      if (!c[d.id]) return;
      h += '<div class="pop-dim"><span class="dim-label">' + esc(d.label) + ":</span> " + esc(truncate(c[d.id], 130)) + "</div>";
    });
    h += '<p class="pop-count">' + (n ? esc(t("addressedInModules").replace("{n}", n)) : esc(t("notMapped"))) + "</p>";
    h += '<p class="pop-hint">' + esc(t("popClickDetails")) + "</p>";
    return h;
  }

  function positionPopover(anchor, pop) {
    var r = anchor.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    pop.style.visibility = "hidden";
    pop.hidden = false;
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var x, y;
    if (anchor.tagName === "TH") {
      x = r.left + r.width / 2 - w / 2;   /* centered below the column header */
      y = r.bottom + 8;
    } else {
      x = r.right + 10;                  /* right of the row head, flip if tight */
      y = r.top + r.height / 2 - h / 2;
      if (x + w > vw - 8) x = r.left - w - 10;
    }
    x = Math.max(8, Math.min(x, vw - w - 8));
    y = Math.max(8, Math.min(y, vh - h - 8));
    pop.style.left = x + "px";
    pop.style.top = y + "px";
    pop.style.visibility = "";
  }

  function popoverHtmlFor(el) {
    var kind = el.getAttribute("data-pop");
    if (kind === "module") return modulePopoverHtml(el.getAttribute("data-program"), el.getAttribute("data-module"));
    if (kind === "comp") return compPopoverHtml(el.getAttribute("data-comp"));
    return "";
  }

  function queueShowPopover(el) {
    clearTimeout(popHideTimer);
    var pop = getPopover();
    if (popAnchor === el && !pop.hidden) return;
    clearTimeout(popShowTimer);
    popAnchor = el;
    popShowTimer = setTimeout(function () {
      if (!popAnchor) return;
      var html = popoverHtmlFor(popAnchor);
      if (!html) return;
      pop.innerHTML = html;
      positionPopover(popAnchor, pop);
    }, 160);
  }

  function scheduleHidePopover() {
    clearTimeout(popShowTimer);
    popHideTimer = setTimeout(hidePopover, 220);
  }

  function hidePopover() {
    clearTimeout(popShowTimer);
    clearTimeout(popHideTimer);
    popAnchor = null;
    var pop = document.getElementById("popover");
    if (pop) { pop.hidden = true; pop.innerHTML = ""; }
  }

  document.addEventListener("mouseover", function (e) {
    var el = e.target.closest("[data-pop]");
    if (el) {
      queueShowPopover(el);
    } else if (e.target.closest("#popover")) {
      clearTimeout(popHideTimer);   /* keep it alive while hovering the popover */
    } else {
      scheduleHidePopover();
    }
  });

  window.addEventListener("scroll", hidePopover, true);

  /* ================= modal ================= */

  function openModal(html) {
    var root = document.getElementById("modal-root");
    root.innerHTML = '<div class="modal-overlay" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h2 id="modal-title"></h2><button class="modal-close" data-action="close-modal" title="' + esc(t("close")) + '">✕</button></div>' +
      '<div id="modal-body"></div></div></div>';
    document.getElementById("modal-title").innerHTML = html.title;
    document.getElementById("modal-body").innerHTML = html.body;
    document.addEventListener("keydown", escClose);
  }
  function escClose(e) { if (e.key === "Escape") closeModal(); }
  function closeModal() {
    document.getElementById("modal-root").innerHTML = "";
    document.removeEventListener("keydown", escClose);
  }

  function openModuleModal(pid, code) {
    var p = programById(pid);
    var mod = p && moduleByCode(p, code);
    if (!mod) return;
    var f = fw();
    var body = '<p class="kv">' + esc(p.title) + " · " + esc(mod.credits + " " + t("creditsLong")) + " · " +
      '<span class="cat-badge ' + esc(mod.category) + '">' + esc(catLabel(p, mod.category)) + "</span></p>";
    if (mod.goals) body += "<h3>" + esc(t("goals")) + "</h3><p>" + esc(mod.goals) + "</p>";
    if (mod.topics && mod.topics.length) {
      body += "<h3>" + esc(t("topics")) + '</h3><ul class="topics">' + mod.topics.map(function (tp) { return "<li>" + esc(tp) + "</li>"; }).join("") + "</ul>";
    }
    var maps = moduleMappings(mod).filter(function (m) { return compByCode(f, m.competency); });
    body += "<h3>" + esc(t("mappedCompetencies")) + " (" + maps.length + ")</h3>";
    if (maps.length) {
      body += '<div class="mod-mappings">';
      maps.sort(function (a, b) { return a.competency.localeCompare(b.competency, undefined, { numeric: true }); });
      maps.forEach(function (m) {
        var c = compByCode(f, m.competency);
        body += '<div class="mapping-row" style="--phase-color:' + phaseColorVar(c.phase) + '">' +
          '<div><span class="m-comp" data-action="open-comp" data-comp="' + esc(c.code) + '">' + esc(c.code + " " + c.title) + "</span>" +
          '<div class="mapping-lvl">' + levelDots(m.level) + " " + esc(levelLabel(m.level)) + "</div></div>" +
          '<div class="m-note">' + esc(noteText(m)) + "</div></div>";
      });
      body += "</div>";
    } else {
      body += '<p class="muted">' + esc(t("moduleNoCompetencies")) + "</p>";
    }
    if (p.source) body += '<p class="modal-src">' + esc(t("source")) + ': <a href="' + esc(p.source) + '" target="_blank" rel="noopener">' + esc(p.sourceLabel || p.title) + "</a></p>";
    if (p.institution) body += '<p class="modal-src">' + esc(t("institution")) + ': ' + institutionAnchor(p) + "</p>";
    openModal({ title: esc(mod.code + " – " + mod.title), body: body });
  }

  function openCompModal(code) {
    var f = fw();
    var c = f && compByCode(f, code);
    if (!c) return;
    var ph = phaseById(f, c.phase);
    var body = '<p class="kv">' + esc(phaseTitle(ph)) + "</p>";
    var savedDims = state.dims;
    state.dims = { knowledge: true, skills: true, examples: true };
    body += dimRows(f, c);
    state.dims = savedDims;
    var ids = state.view === "framework" ? state.programIds : [state.programId];
    var entries = (competencyIndex(ids)[c.code] || []).sort(function (a, b) {
      return b.mapping.level - a.mapping.level || a.module.code.localeCompare(b.module.code);
    });
    body += "<h3>" + esc(t("addressedIn")) + " (" + entries.length + ")</h3>";
    if (entries.length) {
      body += '<div class="mod-mappings">';
      entries.forEach(function (e) {
        body += '<div class="mapping-row"><div><span class="m-comp" data-action="open-module" data-program="' + esc(e.program.id) + '" data-module="' + esc(e.module.code) + '">' +
          esc(e.module.code + " – " + e.module.title) + "</span>" +
          '<div class="mapping-lvl">' + levelDots(e.mapping.level) + " " + esc(levelLabel(e.mapping.level)) + " · " + esc(e.program.title) + "</div></div>" +
          '<div class="m-note">' + esc(noteText(e.mapping)) + "</div></div>";
      });
      body += "</div>";
    } else {
      body += '<p class="muted">' + esc(t("notAddressed")) + "</p>";
    }
    body += frameworkSourceLine(f);
    openModal({ title: esc(c.code + " " + c.title), body: body });
  }

  function openCellModal(pid, code, compCode) {
    var p = programById(pid);
    var mod = p && moduleByCode(p, code);
    var f = fw();
    var c = f && compByCode(f, compCode);
    if (!mod || !c) return;
    var m = moduleMappings(mod).filter(function (x) { return x.competency === compCode; })[0];
    var body = '<p class="kv">' + esc(p.title) + "</p>";
    body += '<div class="mapping-row" style="--phase-color:' + phaseColorVar(c.phase) + ';border-top:none">' +
      '<div><span class="m-comp">' + esc(c.code + " " + c.title) + "</span>" +
      '<div class="mapping-lvl">' + levelDots(m ? m.level : 1) + " " + esc(m ? levelLabel(m.level) : "") + "</div></div>" +
      '<div class="m-note">' + esc(m ? noteText(m) : "") + "</div></div>";
    body += '<p style="margin-top:14px"><button class="view-tab" data-action="open-module" data-program="' + esc(pid) + '" data-module="' + esc(code) + '">' + esc(t("modules")) + ": " + esc(mod.code) + '</button> ' +
      '<button class="view-tab" data-action="open-comp" data-comp="' + esc(compCode) + '">' + esc(t("competencies")) + ": " + esc(c.code) + "</button></p>";
    openModal({ title: esc(mod.code + " × " + c.code + " " + c.title), body: body });
  }

  /* ================= events ================= */

  function rerender() { validateState(); saveState(); renderAll(); }

  function renderAll() {
    hidePopover();
    renderChrome();
    renderSidebar();
    if (state.view === "program") renderProgramView();
    else if (state.view === "framework") renderFrameworkView();
    else renderMatrixView();
  }

  function collectSet(action) {
    var set = new Set();
    document.querySelectorAll('input[data-action="' + action + '"]').forEach(function (el) {
      if (el.checked) set.add(el.value);
    });
    return set;
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    hidePopover();
    var action = el.getAttribute("data-action");

    switch (action) {
      case "set-view": state.view = el.getAttribute("data-value"); rerender(); break;
      case "set-arrange": state.arrange = el.getAttribute("data-value"); rerender(); break;
      case "phases-all": state.phases = null; rerender(); break;
      case "phases-none": state.phases = new Set(); rerender(); break;
      case "comps-all": state.comps = null; rerender(); break;
      case "comps-none": state.comps = new Set(); rerender(); break;
      case "select-comp": {
        var code = el.getAttribute("data-comp");
        state.selectedComp = (state.selectedComp === code) ? null : code;
        rerender();
        if (state.selectedComp) {
          var target = document.querySelector('.picker-btn[data-comp="' + code + '"]');
          if (target && target.scrollIntoView) target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        break;
      }
      case "open-module": openModuleModal(el.getAttribute("data-program"), el.getAttribute("data-module")); break;
      case "open-comp": openCompModal(el.getAttribute("data-comp")); break;
      case "open-cell": openCellModal(el.getAttribute("data-program"), el.getAttribute("data-module"), el.getAttribute("data-comp")); break;
      case "add-framework-program": {
        var next = PROGRAMS.filter(function (p) { return state.programIds.indexOf(p.id) < 0; })[0];
        if (next) state.programIds.push(next.id);
        rerender(); break;
      }
      case "remove-framework-program": {
        var ri = parseInt(el.getAttribute("data-index"), 10);
        if (state.programIds.length > 1 && ri >= 0 && ri < state.programIds.length) state.programIds.splice(ri, 1);
        rerender(); break;
      }
      case "set-compare-filter": {
        var cf = el.getAttribute("data-value");
        if (cf !== state.compareFilter) {
          state.compareFilter = cf;
          /* keep the selection if it still shows up in the new mode, otherwise drop it */
          if (state.selectedComp && !compPassesCompareFilter(competencyIndex(state.programIds), state.selectedComp)) {
            state.selectedComp = null;
          }
        }
        rerender(); break;
      }
      case "close-modal": if (e.target === el || el.classList.contains("modal-close")) closeModal(); break;
    }
  });

  document.addEventListener("change", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    switch (action) {
      case "set-program": state.programId = el.value; rerender(); break;
      case "set-framework-program": {
        var fi = parseInt(el.getAttribute("data-index"), 10);
        if (fi >= 0 && fi < state.programIds.length) state.programIds[fi] = el.value;
        rerender(); break;
      }
      case "toggle-cat": state.cats = collectSet("toggle-cat"); rerender(); break;
      case "toggle-phase": state.phases = collectSet("toggle-phase"); rerender(); break;
      case "toggle-comp": state.comps = collectSet("toggle-comp"); rerender(); break;
      case "toggle-dim": state.dims[el.value] = el.checked; rerender(); break;
      case "set-minlevel": state.minLevel = parseInt(el.value, 10) || 1; rerender(); break;
      case "toggle-only-addressed": state.onlyAddressed = el.checked; rerender(); break;
    }
  });

  document.getElementById("sel-lang").addEventListener("change", function (e) {
    state.lang = e.target.value;
    rerender();
  });

  window.addEventListener("hashchange", function () {
    readHash();
    validateState();
    renderAll();
  });

  /* ================= go ================= */
  boot();
})();
