/* Kompetenzbrille – client-side YAML editor for study programs.
 *
 * Fully static: reuses css/style.css, js/i18n.js, js/vendor/js-yaml.min.js and
 * the editor strings in js/editor-i18n.js. Loads data/manifest.yaml (program
 * list + framework list), data/programs/*.yaml and data/frameworks/*.yaml.
 *
 * A single "Language" switcher controls the editor chrome, the framework
 * locale used for the competency dropdowns and the language of a newly
 * created program. Program content language is edited explicitly.
 */
(function () {
  "use strict";

  var DRAFT_KEY = "kb-editor-draft";          /* legacy single-draft slot (migrated) */
  var DRAFTS_KEY = "kb-editor-drafts";        /* array of drafts */
  var PANEL_KEY = "kompetenzbrille.editor.frameworkPanel";
  var DRAFTS_OPEN_KEY = "kompetenzbrille.editor.draftsOpen";
  var LANG_KEY = "kompetenzbrille.editor.lang";
  var MAX_DRAFTS = 20;
  var PROGRAM_SCHEMA = "data/schemas/program-schema.json";
  /* Reserved mapping target for the Orientierungswissen (framework phase 0). */
  var ORIENTATION_CODE = "__orientation";

  /* ================= i18n ================= */

  function t(key) {
    var ed = window.EDITOR_I18N || {};
    var edDict = ed[state.lang] || ed.de || {};
    if (edDict[key] !== undefined) return edDict[key];
    var dict = (window.I18N && (window.I18N[state.lang] || window.I18N.de)) || {};
    if (dict[key] !== undefined) return dict[key];
    if (ed.de && ed.de[key] !== undefined) return ed.de[key];
    return key;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function byId(id) { return document.getElementById(id); }
  function isEmptyStr(v) { return v == null || String(v).trim() === ""; }
  function isDeleted(o) { return !!(o && o._deleted); }
  function toInt(v) { var n = parseInt(v, 10); return isNaN(n) ? v : n; }
  function fileBaseName(name) { return String(name || "").replace(/^.*\//, "").replace(/\.ya?ml$/i, ""); }

  /* ================= state ================= */

  var uidCounter = 0;
  function nextUid() { uidCounter += 1; return uidCounter; }

  var state = {
    lang: "de",
    source: null,            // repo | upload | new
    sourcePath: null,        // manifest path when source === "repo"
    fileName: null,          // basename of the loaded/uploaded YAML file
    program: null,           // normalized, editable model
    frameworks: {},          // id -> { de: data, en: data }
    frameworkOrder: [],
    manifest: [],            // program paths
    repoPrograms: [],        // { path, id, title, abbr, language }
    drafts: [],              // saved drafts, newest first
    draftsOpen: false,       // sidebar draft list expanded?
    draftId: null,           // id of the draft currently being edited
    panelMode: "framework",  // framework | original
    frameworkPanelId: null,  // framework shown in the panel
    frameworkFilter: "",     // competency filter text
    originalModel: null,     // pristine server copy for comparison
    originalForId: null,     // id the original belongs to
    originalLoading: false,
    originalError: false,
    activeModuleUid: null,   // last focused module (target for panel mappings)
    savedAt: null,
    dirty: false,
    openModules: {},         // uid -> bool
    errors: [],
    notice: null             // { type, text }
  };

  /* ================= data loading ================= */

  function fetchYaml(path) {
    if (!window.jsyaml) {
      var err = new Error("js-yaml not loaded");
      err.code = "setup";
      return Promise.reject(err);
    }
    return fetch(path).then(function (r) {
      if (!r.ok) {
        var e = new Error("HTTP " + r.status + " for " + path);
        e.status = r.status;
        e.path = path;
        throw e;
      }
      return r.text();
    }).then(function (txt) { return window.jsyaml.load(txt); });
  }

  function loadFrameworkFiles(paths) {
    return Promise.all(paths.map(function (path) {
      return fetchYaml(path).then(function (fw) {
        var id = fw.id || path;
        state.frameworks[id] = state.frameworks[id] || {};
        state.frameworks[id][fw.language || "de"] = fw;
      }).catch(function () { /* ignore a broken framework file */ });
    })).then(function () {
      state.frameworkOrder = Object.keys(state.frameworks);
    });
  }

  function loadRepoIndex() {
    return state.manifest.reduce(function (chain, path) {
      return chain.then(function () {
        return fetchYaml(path).then(function (p) {
          state.repoPrograms.push({
            path: path, id: p.id || "", title: p.title || path,
            abbr: p.institutionAbbr || "", language: p.language || "de"
          });
        }).catch(function () {
          state.repoPrograms.push({ path: path, id: "", title: path, abbr: "", language: "de" });
        });
      });
    }, Promise.resolve());
  }

  function boot() {
    state.lang = localStorage.getItem(LANG_KEY) || "de";
    buildLangSelect();

    fetchYaml("data/manifest.yaml").then(function (man) {
      state.manifest = man.programs || [];
      var fwPaths = man.frameworks || [];
      var work = [loadRepoIndex()];
      if (fwPaths.length) {
        work.push(loadFrameworkFiles(fwPaths));
      } else {
        /* fallback so the editor still works if the manifest has no list */
        work.push(loadFrameworkFiles([
          "data/frameworks/quadriga-dlf.de.yaml",
          "data/frameworks/quadriga-dlf.en.yaml"
        ]));
      }
      return Promise.all(work);
    }).then(function () {
      loadPanelPrefs();
      loadDrafts();
      render();
      state.ready = true;
    }).catch(function (err) {
      console.error(err);
      showFatal(err);
    });
  }

  /* ---------- panel preferences ---------- */

  function loadPanelPrefs() {
    try {
      state.draftsOpen = localStorage.getItem(DRAFTS_OPEN_KEY) === "1";
    } catch (e) { /* ignore */ }
    try {
      var raw = localStorage.getItem(PANEL_KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      state.frameworkPanelId = p.id || null;
      if (p.mode === "original" || p.mode === "framework") state.panelMode = p.mode;
    } catch (e) { /* ignore */ }
  }

  function savePanelPrefs() {
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify({
        id: state.frameworkPanelId, mode: state.panelMode
      }));
    } catch (e) { /* ignore */ }
  }

  /* ---------- drafts ---------- */

  function loadDrafts() {
    var list = [];
    try {
      var raw = localStorage.getItem(DRAFTS_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) list = arr.filter(function (d) { return d && d.model; });
      }
    } catch (e) { /* ignore a corrupt store */ }

    /* migrate the legacy single-draft slot into the list */
    try {
      var legacy = localStorage.getItem(DRAFT_KEY);
      if (legacy) {
        var d = JSON.parse(legacy);
        if (d && d.model) {
          d.id = d.id || d.programId || d.sourcePath || ("neu-" + (d.savedAt || Date.now()));
          if (!list.some(function (x) { return x.id === d.id; })) list.push(d);
        }
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (e) { /* ignore */ }

    state.drafts = sortDrafts(list);
    writeDrafts();
  }

  function sortDrafts(list) {
    return list.slice().sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
  }

  function pruneDrafts() {
    state.drafts = sortDrafts(state.drafts).slice(0, MAX_DRAFTS);
  }

  function writeDrafts() {
    pruneDrafts();
    while (true) {
      try {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(state.drafts));
        return;
      } catch (e) {
        /* storage full: drop the oldest draft and retry */
        if (state.drafts.length > 1) { state.drafts.pop(); continue; }
        setNotice("error", "localStorage: " + (e && e.message ? e.message : e));
        return;
      }
    }
  }

  function draftById(id) {
    for (var i = 0; i < state.drafts.length; i++) if (state.drafts[i].id === id) return state.drafts[i];
    return null;
  }

  function draftIdFor() {
    if (state.program.id) return state.program.id;
    if (state.sourcePath) return state.sourcePath;
    return "neu-" + Date.now();
  }

  function draftLabel(d) { return d.title || d.programId || d.id || "—"; }

  /* ================= normalization ================= */

  function normalizeProgram(raw) {
    var src = raw || {};
    var p = Object.assign({}, src);
    p.$schema = p.$schema || PROGRAM_SCHEMA;
    p.id = p.id || "";
    p.title = p.title || "";
    p.institution = p.institution || "";
    p.institutionAbbr = p.institutionAbbr || "";
    p.institutionUrl = p.institutionUrl || "";
    p.language = p.language || "de";
    p.source = p.source || "";
    p.sourceLabel = p.sourceLabel || "";
    p.categories = (Array.isArray(src.categories) ? src.categories : []).map(normalizeCategory);
    p.modules = (Array.isArray(src.modules) ? src.modules : []).map(normalizeModule);
    registerUids(p);
    return p;
  }

  function normalizeCategory(c) {
    var o = Object.assign({}, c);
    o.id = o.id || "";
    o.label = o.label || "";
    if (!o._uid) o._uid = nextUid();
    return o;
  }

  function normalizeModule(m) {
    var o = Object.assign({}, m);
    o.code = o.code || "";
    o.title = o.title || "";
    o.credits = (o.credits === undefined || o.credits === null) ? "" : String(o.credits);
    o.category = o.category || "";
    o.goals = o.goals || "";
    o.topics = (Array.isArray(m.topics) ? m.topics : []).map(function (tp) {
      var to = (tp && typeof tp === "object") ? Object.assign({}, tp) : { text: String(tp == null ? "" : tp) };
      to.text = to.text || "";
      if (!to._uid) to._uid = nextUid();
      return to;
    });
    o.mappings = (Array.isArray(m.mappings) ? m.mappings : []).map(normalizeMapping);
    if (!o._uid) o._uid = nextUid();
    return o;
  }

  function normalizeMapping(mp) {
    var o = Object.assign({}, mp);
    o.framework = o.framework || "";
    o.competency = (o.competency === undefined || o.competency === null) ? "" : String(o.competency);
    o.level = (o.level === undefined || o.level === null) ? 1 : toInt(o.level);
    o._notePlain = typeof mp.note === "string";
    var note = mp.note;
    if (typeof note === "string") note = { de: note, en: "" };
    else if (!note || typeof note !== "object") note = { de: "", en: "" };
    o.note = { de: note.de || "", en: note.en || "" };
    if (typeof note === "object") {
      Object.keys(note).forEach(function (k) {
        if (k !== "de" && k !== "en") o.note[k] = note[k];
      });
    }
    if (!o._uid) o._uid = nextUid();
    return o;
  }

  function registerUids(p) {
    var max = uidCounter;
    function scan(o) { if (o && o._uid && o._uid > max) max = o._uid; }
    (p.categories || []).forEach(scan);
    (p.modules || []).forEach(function (m) {
      scan(m);
      (m.topics || []).forEach(scan);
      (m.mappings || []).forEach(scan);
    });
    uidCounter = max;
  }

  /* ================= serialization ================= */

  function copyIf(obj, out, key) {
    if (obj[key] !== undefined && obj[key] !== null) out[key] = obj[key];
  }

  function keepItem(strip) {
    return function (o) { return !(strip && o._deleted); };
  }

  function exportProgram(strip) {
    var p = state.program;
    if (!p) return null;
    var out = {};
    out.$schema = p.$schema || PROGRAM_SCHEMA;
    copyIf(p, out, "$comment");
    copyIf(p, out, "@context");
    copyIf(p, out, "@id");
    copyIf(p, out, "@type");
    out.id = p.id;
    out.title = p.title;
    out.institution = p.institution;
    out.institutionAbbr = p.institutionAbbr;
    out.institutionUrl = p.institutionUrl;
    out.language = p.language;
    if (!isEmptyStr(p.source)) out.source = p.source;
    if (!isEmptyStr(p.sourceLabel)) out.sourceLabel = p.sourceLabel;
    out.categories = (p.categories || []).filter(keepItem(strip)).map(function (c) {
      var o = {};
      copyIf(c, o, "@id"); copyIf(c, o, "@type");
      o.id = c.id; o.label = c.label; return o;
    });
    out.modules = (p.modules || []).filter(keepItem(strip)).map(exportModule(strip));
    return out;
  }

  function exportModule(strip) {
    return function (m) {
      var o = {};
      copyIf(m, o, "@id"); copyIf(m, o, "@type");
      o.code = m.code;
      o.title = m.title;
      o.credits = toInt(m.credits);
      o.category = m.category;
      o.goals = m.goals;
      var topics = (m.topics || []).filter(function (tp) {
        return !(strip && tp._deleted) && !isEmptyStr(tp.text);
      }).map(function (tp) { return tp.text; });
      if (topics.length) o.topics = topics;
      var maps = (m.mappings || []).filter(keepItem(strip)).map(exportMapping);
      if (maps.length) o.mappings = maps;
      return o;
    };
  }

  function exportMapping(mp) {
    var o = {};
    copyIf(mp, o, "@id"); copyIf(mp, o, "@type");
    o.framework = mp.framework;
    o.competency = String(mp.competency);
    o.level = toInt(mp.level);
    var de = mp.note && mp.note.de ? mp.note.de : "";
    var en = mp.note && mp.note.en ? mp.note.en : "";
    if (mp._notePlain && isEmptyStr(en)) {
      o.note = de;
    } else {
      var note = { de: de };
      if (!isEmptyStr(en)) note.en = en;
      o.note = note;
    }
    return o;
  }

  function dumpYaml(obj) {
    return window.jsyaml.dump(obj, {
      noRefs: true,
      lineWidth: -1,
      sortKeys: false,
      quotingType: "\"",
      forceQuotes: false
    });
  }

  /* ================= validation ================= */

  function validate() {
    var errs = [];
    var p = state.program;
    if (!p) return errs;
    var T = t;

    function push(msg, mi) { errs.push({ msg: msg, mi: (mi === undefined ? null : mi) }); }

    ["id", "title", "institution", "institutionAbbr", "institutionUrl", "language"].forEach(function (f) {
      if (isEmptyStr(p[f])) push(T("valProgramRequired").replace("{field}", T(labelForField(f))), null);
    });
    if (!isEmptyStr(p.id)) {
      if (p.id.length > 64) push(T("valProgramIdLong"), null);
      else if (!/^[a-z][a-z0-9-]*$/.test(p.id)) push(T("valProgramIdPattern").replace("{value}", p.id), null);
    }
    if (!isEmptyStr(p.institutionAbbr) && p.institutionAbbr.length > 24) push(T("valAbbrLong"), null);
    if (!isEmptyStr(p.language) && !/^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(p.language)) {
      push(T("valLanguage").replace("{value}", p.language), null);
    }
    if (state.fileName && p.id !== fileBaseName(state.fileName)) {
      push(T("valIdFileName").replace("{value}", p.id || "—").replace("{file}", state.fileName), null);
    }

    var cats = (p.categories || []).filter(function (c) { return !isDeleted(c); });
    if (!cats.length) push(T("valCategoriesMin"), null);
    var catIds = {};
    cats.forEach(function (c, i) {
      if (isEmptyStr(c.id) || isEmptyStr(c.label)) push(T("valCategoryRequired").replace("{index}", i + 1), null);
      if (!isEmptyStr(c.id)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(c.id)) push(T("valCategoryIdent").replace("{value}", c.id), null);
        if (catIds[c.id]) push(T("valCategoryDuplicate").replace("{value}", c.id), null);
        catIds[c.id] = true;
      }
    });

    var mods = (p.modules || []).filter(function (m) { return !isDeleted(m); });
    if (!mods.length) push(T("valModulesMin"), null);
    var codes = {};
    mods.forEach(function (m, mi) {
      var code = m.code || ("#" + (mi + 1));
      ["code", "title", "category", "goals"].forEach(function (f) {
        if (isEmptyStr(m[f])) push(T("valModuleRequired").replace("{code}", code).replace("{field}", T(labelForField(f))), m._uid);
      });
      if (!isEmptyStr(m.code)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(m.code)) push(T("valModuleCodeIdent").replace("{code}", code), m._uid);
        if (codes[m.code]) push(T("valModuleDuplicate").replace("{code}", code), m._uid);
        codes[m.code] = true;
      }
      var cr = parseInt(m.credits, 10);
      if (m.credits === "" || isNaN(cr) || cr < 1 || cr > 60 || String(cr) !== String(m.credits).trim()) {
        push(T("valCredits").replace("{code}", code), m._uid);
      }
      if (!isEmptyStr(m.category) && !catIds[m.category]) {
        push(T("valCategoryRef").replace("{code}", code).replace("{value}", m.category), m._uid);
      }
      (m.mappings || []).filter(function (mp) { return !isDeleted(mp); }).forEach(function (mp, n) {
        if (isEmptyStr(mp.framework) || state.frameworkOrder.indexOf(mp.framework) < 0) {
          push(T("valFramework").replace("{code}", code).replace("{n}", n + 1).replace("{value}", mp.framework || "—"), m._uid);
        } else {
          var fwd = frameworkData(mp.framework);
          var known = fwd && (
            (fwd.competencies && fwd.competencies.some(function (c) { return String(c.code) === String(mp.competency); })) ||
            isOrientationTarget(mp, fwd)
          );
          if (isEmptyStr(mp.competency) || !known) {
            push(T("valCompetency").replace("{code}", code).replace("{value}", mp.competency || "—").replace("{framework}", mp.framework), m._uid);
          }
        }
        if ([1, 2, 3].indexOf(toInt(mp.level)) < 0) push(T("valLevel").replace("{code}", code), m._uid);
        var de = mp.note && mp.note.de;
        var en = mp.note && mp.note.en;
        if (isEmptyStr(de)) {
          if (!isEmptyStr(en)) push(T("valNoteEn").replace("{code}", code), m._uid);
          else push(T("valNoteDe").replace("{code}", code), m._uid);
        }
      });
    });
    return errs;
  }

  function labelForField(f) {
    return {
      id: "editorFId", title: "editorFTitle", institution: "editorFInstitution",
      institutionAbbr: "editorFInstitutionAbbr", institutionUrl: "editorFInstitutionUrl",
      language: "editorFLanguage", code: "editorFCode", category: "editorFCategory",
      goals: "editorFGoals"
    }[f] || f;
  }

  /* ================= framework helpers ================= */

  function frameworkData(id) {
    var f = state.frameworks[id];
    if (!f) return null;
    return f[state.lang] || f.de || f[Object.keys(f)[0]] || null;
  }

  function frameworkLabel(id) {
    var d = frameworkData(id);
    if (!d) return id;
    return (d.shortTitle || d.title || id) + (d.version ? " v" + d.version : "");
  }

  function orientationPhaseOf(fwd) {
    var phases = (fwd && fwd.phases) || [];
    for (var i = 0; i < phases.length; i++) {
      if (String(phases[i].id) === "0") return phases[i];
    }
    return null;
  }

  function isOrientationTarget(mp, fwd) {
    return !!mp && String(mp.competency) === ORIENTATION_CODE && !!orientationPhaseOf(fwd);
  }

  /* ================= rendering ================= */

  function render() {
    renderLangSelect();
    renderSidebar();
    renderMain();
    renderFrameworkPanel();
  }

  function renderSidebar() {
    var sb = byId("editor-sidebar");
    if (!sb) return;
    state.errors = state.program ? validate() : [];

    var h = "";

    /* source */
    h += '<div class="filter-section"><h3>' + esc(t("editorSource")) + "</h3>";
    h += '<label class="ed-field-label" for="ed-pick-program">' + esc(t("editorLoadRepo")) + "</label>";
    h += '<select id="ed-pick-program" data-action="pick-program">';
    h += '<option value="">' + esc(t("editorChooseProgram")) + "</option>";
    state.repoPrograms.forEach(function (rp) {
      var label = (rp.abbr ? rp.abbr + " · " : "") + rp.title;
      h += '<option value="' + esc(rp.path) + '"' + (state.sourcePath === rp.path ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    h += "</select>";
    h += '<div class="ed-btn-row">';
    h += '<label class="ed-btn ed-btn-file">' + esc(t("editorUpload")) +
      '<input type="file" accept=".yaml,.yml,text/yaml" data-action="upload" hidden></label>';
    h += '<button type="button" class="ed-btn" data-action="new-program">' + esc(t("editorNew")) + "</button>";
    h += "</div>";
    h += '<p class="small muted ed-hint">' + esc(t("editorUnsafeHint")) + "</p>";
    h += "</div>";

    /* actions */
    h += '<div class="filter-section"><h3>' + esc(t("editorActions")) + "</h3>";
    h += '<button type="button" class="ed-btn ed-btn-primary" data-action="export"' +
      (state.program ? "" : " disabled") + ">" + esc(t("editorExport")) + "</button> ";
    h += '<button type="button" class="ed-btn" data-action="save-draft"' +
      (state.program ? "" : " disabled") + ">" + esc(t("editorSaveBrowser")) + "</button> ";
    h += '<button type="button" class="ed-btn ed-btn-danger" data-action="delete-draft">' + esc(t("editorDeleteDraft")) + "</button>";
    h += '<p class="small muted ed-status">' + esc(savedStatusText()) + "</p>";
    var del = countDeleted();
    if (del.total > 0) {
      h += '<p class="small"><button type="button" class="ed-link" data-action="show-removals">' +
        esc(t("editorDeletedCount").replace("{n}", del.total)) + "</button></p>";
    }
    h += "</div>";

    /* drafts */
    h += renderDraftsSection();

    /* validation */
    h += '<div class="filter-section"><h3>' + esc(t("editorValidation")) + "</h3>";
    if (!state.program) {
      h += '<p class="small muted">' + esc(t("editorNoProgram")) + "</p>";
    } else if (!state.errors.length) {
      h += '<p class="ed-ok small">' + esc(t("editorNoErrors")) + "</p>";
    } else {
      h += '<p class="small ed-err-count">' +
        esc(state.errors.length === 1 ? t("editorProblemOne") : t("editorProblemMany").replace("{n}", state.errors.length)) + "</p>";
      h += '<ul class="ed-errors">';
      state.errors.forEach(function (e, i) {
        h += '<li><button type="button" class="ed-link" data-action="goto-error" data-error="' + i + '">' + esc(e.msg) + "</button></li>";
      });
      h += "</ul>";
    }
    h += '<p class="small muted ed-hint">' + esc(t("editorValidateHint")) + "</p>";
    h += "</div>";

    sb.innerHTML = h;
  }

  function renderDraftsSection() {
    var h = '<div class="filter-section"><details class="ed-drafts-details"' + (state.draftsOpen ? " open" : "") + ">";
    h += '<summary>' + esc(t("editorDrafts")) +
      ' <span class="ed-count">' + state.drafts.length + "</span></summary>";
    if (!state.drafts.length) {
      h += '<p class="small muted">' + esc(t("editorDraftsEmpty")) + "</p>";
    } else {
      h += '<ul class="ed-drafts">';
      state.drafts.forEach(function (d) {
        var current = d.id === state.draftId;
        h += '<li class="ed-draft-item' + (current ? " is-current" : "") + '">';
        h += '<div class="ed-draft-meta">';
        h += '<span class="ed-draft-title">' + esc(draftLabel(d)) +
          (current ? ' <span class="ed-draft-current">' + esc(t("editorDraftCurrent")) + "</span>" : "") + "</span>";
        h += '<span class="ed-draft-time">' + esc(formatTime(d.savedAt)) + "</span>";
        h += "</div>";
        h += '<div class="ed-draft-buttons">';
        h += '<button type="button" class="ed-btn" data-action="resume-draft" data-draft-id="' + esc(d.id) + '">' +
          esc(t("editorDraftResume")) + "</button>";
        h += '<button type="button" class="ed-btn ed-btn-danger" data-action="delete-draft-one" data-draft-id="' + esc(d.id) + '">' +
          esc(t("editorDraftDelete")) + "</button>";
        h += "</div></li>";
      });
      h += "</ul>";
    }
    h += "</details></div>";
    return h;
  }

  function savedStatusText() {
    if (!state.program) return "";
    var when = state.savedAt ? formatTime(state.savedAt) : t("editorNeverSaved");
    var line = t("editorLastSaved") + ": " + when;
    line += " · " + (state.dirty ? t("editorDirty") : t("editorClean"));
    return line;
  }

  function formatTime(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString();
    } catch (e) { return String(ts); }
  }

  function countDeleted() {
    var total = 0, modules = 0, mappings = 0, topics = 0, categories = 0;
    if (!state.program) return { total: 0, modules: 0, mappings: 0, topics: 0, categories: 0 };
    var p = state.program;
    (p.categories || []).forEach(function (c) { if (isDeleted(c)) { categories++; total++; } });
    (p.modules || []).forEach(function (m) {
      if (isDeleted(m)) { modules++; total++; }
      (m.topics || []).forEach(function (tp) { if (isDeleted(tp)) { topics++; total++; } });
      (m.mappings || []).forEach(function (mp) { if (isDeleted(mp)) { mappings++; total++; } });
    });
    return { total: total, modules: modules, mappings: mappings, topics: topics, categories: categories };
  }

  function renderMain() {
    var main = byId("editor-main");
    if (!main) return;
    var h = "";
    if (state.notice) {
      h += '<div class="ed-notice ed-notice-' + esc(state.notice.type) + '">' + esc(state.notice.text) + "</div>";
    }
    if (!state.program) {
      h += state.drafts.length
        ? renderDraftsOverview()
        : '<div class="hint-box">' + esc(t("editorNoProgram")) + "</div>";
      main.innerHTML = h;
      return;
    }
    h += renderBaseInfo();
    h += renderCategories();
    h += renderModules();
    main.innerHTML = h;
  }

  /* welcome screen: all saved drafts, newest edit first */
  function renderDraftsOverview() {
    var h = '<div class="ed-drafts-overview">';
    h += '<div class="ed-drafts-overview-head"><h2>' + esc(t("editorDrafts")) +
      ' <span class="ed-count">' + state.drafts.length + "</span></h2>";
    h += '<p class="small muted">' + esc(t("editorDraftsIntro")) + "</p></div>";
    h += '<ul class="ed-draft-cards">';
    state.drafts.forEach(function (d) {
      h += '<li class="ed-draft-card">';
      h += '<div class="ed-draft-card-main">';
      h += '<span class="ed-draft-card-title">' + esc(draftLabel(d)) + "</span>";
      h += '<span class="ed-draft-card-meta">' + esc(draftMeta(d)) + "</span>";
      h += "</div>";
      h += '<div class="ed-draft-card-actions">';
      h += '<button type="button" class="ed-btn ed-btn-primary" data-action="resume-draft" data-draft-id="' + esc(d.id) + '">' +
        esc(t("editorDraftResume")) + "</button>";
      h += '<button type="button" class="ed-btn ed-btn-danger" data-action="delete-draft-one" data-draft-id="' + esc(d.id) + '">' +
        esc(t("editorDraftDelete")) + "</button>";
      h += "</div></li>";
    });
    h += "</ul></div>";
    return h;
  }

  function draftMeta(d) {
    var parts = [];
    if (d.programId && d.programId !== draftLabel(d)) parts.push(d.programId);
    if (d.source === "repo" && d.sourcePath) parts.push(d.sourcePath.split("/").pop());
    else if (d.source === "upload") parts.push(t("editorUpload"));
    else if (d.source === "new") parts.push(t("editorNew"));
    parts.push(formatTime(d.savedAt));
    return parts.join(" · ");
  }

  /* ---------- framework reference panel ---------- */

  function panelFrameworkId() {
    if (state.frameworkPanelId && state.frameworks[state.frameworkPanelId]) return state.frameworkPanelId;
    return state.frameworkOrder[0] || "";
  }

  function renderFrameworkPanel() {
    var aside = byId("framework-sidebar");
    if (!aside) return;

    var h = renderPanelTabs();
    if (state.panelMode === "original") {
      h += renderOriginalPanel();
      aside.innerHTML = h;
      return;
    }

    var fid = panelFrameworkId();
    var fwd = frameworkData(fid);
    h += '<div class="ed-fw-head">';
    h += '<select data-action="pick-framework">' + frameworkOptionsPanel(fid) + "</select>";
    h += '<input type="text" class="ed-fw-filter" data-action="framework-filter" placeholder="' +
      esc(t("editorFrameworkFilter")) + '" value="' + esc(state.frameworkFilter) + '">';
    h += "</div>";
    h += fwd ? renderFrameworkCompetencies(fwd, fid)
      : '<p class="small muted">' + esc(t("editorFrameworkEmpty")) + "</p>";
    aside.innerHTML = h;
    refreshFrameworkFilter();
  }

  function renderPanelTabs() {
    function tab(value, label) {
      return '<button type="button" class="ed-panel-tab' + (state.panelMode === value ? " active" : "") +
        '" data-action="panel-mode" data-value="' + value + '">' + esc(label) + "</button>";
    }
    return '<div class="ed-panel-tabs">' + tab("framework", t("editorPanelFramework")) +
      tab("original", t("editorPanelOriginal")) + "</div>";
  }

  function frameworkOptionsPanel(selected) {
    return state.frameworkOrder.map(function (id) {
      return '<option value="' + esc(id) + '"' + (id === selected ? " selected" : "") + ">" + esc(frameworkLabel(id)) + "</option>";
    }).join("");
  }

  function renderFrameworkCompetencies(fwd, fid) {
    var phases = fwd.phases || [];
    var comps = fwd.competencies || [];
    var byPhase = {};
    comps.forEach(function (c) {
      var key = String(c.phase);
      (byPhase[key] = byPhase[key] || []).push(c);
    });
    var h = "";
    var known = {};
    var oph = orientationPhaseOf(fwd);
    if (oph) h += renderFwOrientation(oph, fid);
    phases.forEach(function (ph) {
      known[String(ph.id)] = true;
      var list = byPhase[String(ph.id)];
      if (!list || !list.length) return;
      h += '<div class="ed-fw-phase" style="--phase-color:' + phaseColorVar(ph.id) + '">';
      h += '<div class="ed-fw-phase-title">';
      if (String(ph.id) !== "0") h += '<span class="ed-fw-phase-no">' + esc(ph.id) + "</span>";
      h += "<span>" + esc(ph.title) + "</span>";
      h += '<span class="ed-fw-phase-count">' + list.length + "</span>";
      h += "</div>";
      list.forEach(function (c) { h += renderFwComp(c, fwd, fid); });
      h += "</div>";
    });
    comps.forEach(function (c) {
      if (known[String(c.phase)]) return;
      if (!known["__orphans"]) {
        known["__orphans"] = true;
        h += '<div class="ed-fw-phase" style="--phase-color:' + phaseColorVar("0") + '">';
      }
      h += renderFwComp(c, fwd, fid);
    });
    if (known["__orphans"]) h += "</div>";
    return h;
  }

  /* phase ids map to the palette variables used across the app */
  function phaseColorVar(id) {
    var n = parseInt(id, 10);
    if (isNaN(n) || n < 0 || n > 5) n = 0;
    return "var(--phase-" + n + ")";
  }

  function renderFwOrientation(ph, fid) {
    var search = (ph.title + " " + (ph.text || "") + " " + (ph.note || "")).toLowerCase();
    var h = '<div class="ed-fw-comp ed-fw-orientation" data-search="' + esc(search) + '">';
    h += '<div class="ed-fw-comp-head">';
    h += '<span class="ed-fw-title">' + esc(ph.title) + "</span>";
    h += '<button type="button" class="ed-btn ed-fw-add" title="' + esc(t("editorAddMappingHere")) +
      '" data-action="panel-add-mapping" data-framework="' + esc(fid) + '" data-competency="' + esc(ORIENTATION_CODE) + '">＋</button>';
    h += "</div>";
    var rows = "";
    if (ph.text) rows += '<div class="ed-fw-dim"><span class="ed-fw-dim-label">' + esc(t("orientationDescription")) + "</span><span>" + esc(ph.text) + "</span></div>";
    if (ph.note) rows += '<div class="ed-fw-dim"><span class="ed-fw-dim-label">' + esc(t("orientationNote")) + "</span><span>" + esc(ph.note) + "</span></div>";
    if (rows) h += '<div class="ed-fw-dims">' + rows + "</div>";
    h += "</div>";
    return h;
  }

  function renderFwComp(c, fwd, fid) {
    var dims = fwd.dimensions || [];
    var search = (c.code + " " + c.title + " " + dims.map(function (d) { return c[d.id] || ""; }).join(" ")).toLowerCase();
    var h = '<div class="ed-fw-comp" data-search="' + esc(search) + '">';
    h += '<div class="ed-fw-comp-head">';
    h += '<span class="ed-fw-code">' + esc(c.code) + '</span><span class="ed-fw-title">' + esc(c.title) + "</span>";
    h += '<button type="button" class="ed-btn ed-fw-add" title="' + esc(t("editorAddMappingHere")) +
      '" data-action="panel-add-mapping" data-framework="' + esc(fid) + '" data-competency="' + esc(c.code) + '">＋</button>';
    h += "</div>";
    var rows = dims.map(function (d) {
      var v = c[d.id];
      return v ? '<div class="ed-fw-dim"><span class="ed-fw-dim-label">' + esc(d.label) + "</span><span>" + esc(v) + "</span></div>" : "";
    }).join("");
    if (rows) h += '<div class="ed-fw-dims">' + rows + "</div>";
    h += "</div>";
    return h;
  }

  function refreshFrameworkFilter() {
    var aside = byId("framework-sidebar");
    if (!aside) return;
    var q = (state.frameworkFilter || "").trim().toLowerCase();
    Array.prototype.forEach.call(aside.querySelectorAll(".ed-fw-comp"), function (el) {
      var s = el.getAttribute("data-search") || "";
      el.hidden = !!q && s.indexOf(q) < 0;
    });
    Array.prototype.forEach.call(aside.querySelectorAll(".ed-fw-phase"), function (ph) {
      var any = false;
      Array.prototype.forEach.call(ph.querySelectorAll(".ed-fw-comp"), function (c) { if (!c.hidden) any = true; });
      ph.hidden = !any;
    });
  }

  /* ---------- read-only original / comparison ---------- */

  function repoPathForId(id) {
    if (!id) return null;
    for (var i = 0; i < state.repoPrograms.length; i++) {
      var rp = state.repoPrograms[i];
      if (rp.id === id || fileBaseName(rp.path) === id) return rp.path;
    }
    return null;
  }

  function ensureOriginal() {
    if (!state.program) return;
    var id = state.program.id;
    var path = repoPathForId(id);
    if (!path) { state.originalModel = null; state.originalForId = id; state.originalError = false; return; }
    if (state.originalForId === id && (state.originalModel || state.originalLoading)) return;
    state.originalForId = id;
    state.originalModel = null;
    state.originalError = false;
    state.originalLoading = true;
    fetchYaml(path).then(function (raw) {
      if (!state.program || state.program.id !== id) return;
      state.originalModel = normalizeProgram(raw);
      state.originalLoading = false;
      renderFrameworkPanel();
    }).catch(function () {
      state.originalLoading = false;
      state.originalError = true;
      renderFrameworkPanel();
    });
  }

  function renderOriginalPanel() {
    if (!state.program) return '<p class="small muted">' + esc(t("editorOriginalNoProgram")) + "</p>";
    var path = repoPathForId(state.program.id);
    if (!path || state.originalError) return '<p class="small muted">' + esc(t("editorOriginalMissing")) + "</p>";
    if (state.originalLoading || state.originalForId !== state.program.id || !state.originalModel) {
      ensureOriginal();
      return '<p class="small muted">' + esc(t("editorOriginalLoading")) + "</p>";
    }
    var diff = computeDiff(state.originalModel, state.program);
    var h = '<div class="ed-ro-head"><span class="ed-ro-title">' + esc(t("editorOriginalTitle")) + "</span>";
    h += '<span class="ed-ro-summary">' + esc(diff.total ? t("editorDiffSummary").replace("{n}", diff.total) : t("editorDiffNone")) + "</span></div>";
    h += '<div class="ed-ro">';
    h += renderReadOnlyProgram(state.originalModel, diff);
    if (diff.added.length) {
      h += '<div class="ed-ro-added-label">' + esc(t("editorDiffAdded")) + " (" + diff.added.length + ")</div>";
      diff.added.forEach(function (entry) { h += renderReadOnlyModule(entry); });
    }
    h += "</div>";
    return h;
  }

  function moduleKey(m) { return !isEmptyStr(m.code) ? "c:" + m.code : "t:" + (m.title || "?"); }
  function mappingKey(mp) { return String(mp.framework) + "\u0001" + String(mp.competency); }
  function sameModule(a, b) { return JSON.stringify(exportModule(false)(a)) === JSON.stringify(exportModule(false)(b)); }
  function sameMapping(a, b) { return JSON.stringify(exportMapping(a)) === JSON.stringify(exportMapping(b)); }

  function computeDiff(orig, draft) {
    var res = { total: 0, base: [], categories: [], modules: [], added: [] };

    ["id", "title", "institution", "institutionAbbr", "institutionUrl", "language", "source", "sourceLabel"]
      .forEach(function (f) {
        var oldV = orig[f] == null ? "" : String(orig[f]);
        var newV = draft[f] == null ? "" : String(draft[f]);
        var changed = oldV !== newV;
        if (changed) res.total++;
        res.base.push({ field: f, labelKey: labelForField(f), old: oldV, new: newV, changed: changed });
      });

    var origCats = {}, draftCats = {};
    (orig.categories || []).forEach(function (c) { origCats[c.id] = c; });
    (draft.categories || []).forEach(function (c) { draftCats[c.id] = c; });
    Object.keys(origCats).forEach(function (id) {
      var dc = draftCats[id] || null;
      var status = !dc ? "removed" : (String(origCats[id].label) !== String(dc.label) ? "changed" : "same");
      if (status !== "same") res.total++;
      res.categories.push({ id: id, orig: origCats[id], draft: dc, status: status });
    });
    Object.keys(draftCats).forEach(function (id) {
      if (!origCats[id]) { res.categories.push({ id: id, orig: null, draft: draftCats[id], status: "added" }); res.total++; }
    });

    var draftByKey = {};
    (draft.modules || []).forEach(function (m) { draftByKey[moduleKey(m)] = m; });
    var origKeys = {};
    (orig.modules || []).forEach(function (m) {
      var key = moduleKey(m);
      origKeys[key] = true;
      var dm = draftByKey[key] || null;
      var status = !dm ? "removed" : (sameModule(m, dm) ? "same" : "changed");
      if (status !== "same") res.total++;
      res.modules.push(buildModuleDiff(m, dm, status));
    });
    (draft.modules || []).forEach(function (m) {
      if (!origKeys[moduleKey(m)]) { res.added.push(buildModuleDiff(null, m, "added")); res.total++; }
    });
    return res;
  }

  function buildModuleDiff(orig, draft, status) {
    var fields = ["code", "title", "credits", "category", "goals"].map(function (f) {
      var oldV = orig ? (orig[f] == null ? "" : String(orig[f])) : "";
      var newV = draft ? (draft[f] == null ? "" : String(draft[f])) : "";
      return { field: f, labelKey: labelForField(f), old: oldV, new: newV, changed: status === "changed" && oldV !== newV };
    });

    var origTopics = orig ? (orig.topics || []).map(topicText).filter(function (s) { return !isEmptyStr(s); }) : [];
    var draftTopics = draft ? (draft.topics || []).map(topicText).filter(function (s) { return !isEmptyStr(s); }) : [];
    var topics = [];
    origTopics.forEach(function (t) { topics.push({ text: t, status: draftTopics.indexOf(t) < 0 ? "removed" : "same" }); });
    draftTopics.forEach(function (t) { if (origTopics.indexOf(t) < 0) topics.push({ text: t, status: "added" }); });

    var origMaps = orig ? (orig.mappings || []) : [];
    var draftMaps = draft ? (draft.mappings || []) : [];
    var draftByMk = {};
    draftMaps.forEach(function (x) { draftByMk[mappingKey(x)] = x; });
    var mappings = [];
    var origMk = {};
    origMaps.forEach(function (x) {
      var mk = mappingKey(x);
      origMk[mk] = true;
      var d = draftByMk[mk] || null;
      mappings.push({ key: mk, orig: x, draft: d, status: !d ? "removed" : (sameMapping(x, d) ? "same" : "changed") });
    });
    draftMaps.forEach(function (x) {
      var mk = mappingKey(x);
      if (!origMk[mk]) mappings.push({ key: mk, orig: null, draft: x, status: "added" });
    });

    return { orig: orig, draft: draft, status: status, fields: fields, topics: topics, mappings: mappings };
  }

  function topicText(tp) { return (tp && typeof tp === "object") ? tp.text : tp; }
  function fieldDiff(entry, f) {
    for (var i = 0; i < entry.fields.length; i++) if (entry.fields[i].field === f) return entry.fields[i];
    return null;
  }
  function cmpText(oldV, newV) {
    return '<span class="ed-diff-old">' + esc(oldV) + '</span><span class="ed-diff-arrow">→</span>' +
      '<span class="ed-diff-new">' + esc(newV) + "</span>";
  }
  function diffField(entry, f) {
    var fd = fieldDiff(entry, f);
    if (!fd) return "";
    if (entry.status === "added") return '<span class="ed-diff-new">' + esc(fd.new) + "</span>";
    if (entry.status === "removed") return '<span class="ed-diff-old">' + esc(fd.old) + "</span>";
    if (fd.changed) return cmpText(fd.old, fd.new);
    return esc(fd.old !== "" ? fd.old : fd.new);
  }

  function renderReadOnlyProgram(p, diff) {
    var h = '<div class="ed-ro-base">';
    diff.base.forEach(function (b) {
      if (!b.changed && isEmptyStr(b.old)) return;
      h += '<div class="ed-ro-kv' + (b.changed ? " is-changed" : "") + '"><span class="ed-ro-k">' +
        esc(t(b.labelKey)) + '</span><span class="ed-ro-v">' +
        (b.changed ? cmpText(b.old, b.new) : esc(b.old)) + "</span></div>";
    });
    h += "</div>";

    if (diff.categories.length) {
      h += '<div class="ed-ro-cats">';
      diff.categories.forEach(function (c) {
        var label = (c.orig && c.orig.label) || (c.draft && c.draft.label) || c.id;
        var cls = c.status === "added" ? "ed-diff-new" : (c.status === "removed" ? "ed-diff-old" : "");
        h += '<span class="cat-badge ' + cls + '">' + esc(label) + "</span>";
      });
      h += "</div>";
    }
    diff.modules.forEach(function (entry) { h += renderReadOnlyModule(entry); });
    return h;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function renderReadOnlyModule(entry) {
    var status = entry.status;
    var m = entry.orig || entry.draft;
    var h = '<div class="mod-card ed-ro-mod' + (status !== "same" ? " is-" + status : "") + '">';
    h += '<div class="mod-card-head"><span class="mod-code">' + diffField(entry, "code") + '</span>';
    h += '<span class="mod-title">' + diffField(entry, "title");
    if (status !== "same") h += '<span class="ed-ro-badge is-' + status + '">' + esc(t("editorDiff" + cap(status))) + "</span>";
    h += '</span><span class="mod-meta">' + diffField(entry, "credits") + " " + esc(t("editorLpShort")) + "</span></div>";
    if (!isEmptyStr(m.category)) h += '<span class="cat-badge">' + diffField(entry, "category") + "</span>";
    var fdGoals = fieldDiff(entry, "goals");
    if (fdGoals && (!isEmptyStr(fdGoals.old) || !isEmptyStr(fdGoals.new))) {
      h += '<p class="goals">' + diffField(entry, "goals") + "</p>";
    }
    if (entry.topics.length) {
      h += '<ul class="topics">';
      entry.topics.forEach(function (tp) {
        var cls = tp.status === "added" ? "ed-diff-new" : (tp.status === "removed" ? "ed-diff-old" : "");
        h += '<li class="' + cls + '">' + esc(tp.text) + "</li>";
      });
      h += "</ul>";
    }
    if (entry.mappings.length) {
      h += '<div class="mod-mappings">';
      entry.mappings.forEach(function (md) { h += renderReadOnlyMapping(md); });
      h += "</div>";
    }
    h += "</div>";
    return h;
  }

  function competencyLabel(mp) {
    var fwd = frameworkData(mp.framework);
    var oph = orientationPhaseOf(fwd);
    if (oph && String(mp.competency) === ORIENTATION_CODE) return oph.title;
    if (fwd && fwd.competencies) {
      for (var i = 0; i < fwd.competencies.length; i++) {
        if (String(fwd.competencies[i].code) === String(mp.competency)) {
          return (mp.competency || "—") + " " + fwd.competencies[i].title;
        }
      }
    }
    return mp.competency || "—";
  }
  function noteParts(mp) {
    if (mp && mp.note && typeof mp.note === "object") return { de: mp.note.de || "", en: mp.note.en || "" };
    return { de: (mp && typeof mp.note === "string") ? mp.note : "", en: "" };
  }
  /* show both language variants: program content is German, notes are bilingual */
  function noteHtml(md) {
    var o = noteParts(md.orig);
    var d = noteParts(md.draft);
    var langLabels = { de: "DE", en: "EN" };
    var h = "";
    ["de", "en"].forEach(function (l) {
      var ov = o[l] || "", dv = d[l] || "";
      if (!ov && !dv) return;
      var inner;
      if (md.status === "added") inner = '<span class="ed-diff-new">' + esc(dv) + "</span>";
      else if (md.status === "removed") inner = '<span class="ed-diff-old">' + esc(ov) + "</span>";
      else if (md.status === "changed" && ov !== dv) inner = cmpText(ov, dv);
      else inner = esc(ov || dv);
      h += '<div class="ed-note-line"><span class="ed-note-lang">' + langLabels[l] + "</span>" + inner + "</div>";
    });
    return h;
  }
  function competencyPhase(mp) {
    var fwd = frameworkData(mp.framework);
    if (String(mp.competency) === ORIENTATION_CODE && orientationPhaseOf(fwd)) return "0";
    if (fwd && fwd.competencies) {
      for (var i = 0; i < fwd.competencies.length; i++) {
        if (String(fwd.competencies[i].code) === String(mp.competency)) return fwd.competencies[i].phase;
      }
    }
    return "0";
  }

  function renderReadOnlyMapping(md) {
    var mp = md.orig || md.draft;
    var changedLevel = md.status === "changed" && toInt(md.orig.level) !== toInt(md.draft.level);
    var changedComp = md.orig && md.draft && String(md.orig.competency) !== String(md.draft.competency);
    var h = '<div class="mapping-row ed-ro-mapping' + (md.status !== "same" ? " is-" + md.status : "") +
      '" style="--phase-color:' + phaseColorVar(competencyPhase(mp)) + '">';
    h += '<div><span class="m-comp">';
    if (md.status === "added") h += '<span class="ed-diff-new">' + esc(competencyLabel(md.draft)) + "</span>";
    else if (md.status === "removed") h += '<span class="ed-diff-old">' + esc(competencyLabel(md.orig)) + "</span>";
    else if (changedComp) h += cmpText(competencyLabel(md.orig), competencyLabel(md.draft));
    else h += esc(competencyLabel(mp));
    h += "</span>";
    if (md.status !== "same") h += '<span class="ed-ro-badge is-' + md.status + '">' + esc(t("editorDiff" + cap(md.status))) + "</span>";
    h += '<div class="mapping-lvl">';
    if (changedLevel) h += levelDots(md.orig.level) + " → " + levelDots(md.draft.level) + " " + esc(levelLabel(md.draft.level));
    else h += levelDots(mp.level) + " " + esc(levelLabel(mp.level));
    h += "</div></div>";
    h += '<div class="m-note">' + noteHtml(md) + "</div></div>";
    return h;
  }

  function levelDots(level) {
    var l = toInt(level);
    var out = '<span class="lvl-dots">';
    for (var i = 1; i <= 3; i++) out += "<i class=\"" + (i <= l ? "on-" + l : "") + "\"></i>";
    return out + "</span>";
  }
  function levelLabel(level) { return t("editorLevel" + toInt(level)); }

  /* ---------- base info ---------- */

  function inputField(label, opts) {
    return '<label class="ed-field"><span class="ed-field-label">' + esc(label) + "</span>" +
      '<input type="' + esc(opts.type || "text") + '"' + dataAttrs(opts) +
      (opts.value != null ? ' value="' + esc(opts.value) + '"' : "") +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") +
      (opts.attrs || "") + "></label>";
  }

  function textareaField(label, opts) {
    return '<label class="ed-field ed-field-wide"><span class="ed-field-label">' + esc(label) + "</span>" +
      '<textarea rows="' + (opts.rows || 3) + '"' + dataAttrs(opts) +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") + ">" +
      esc(opts.value || "") + "</textarea></label>";
  }

  function selectField(label, opts) {
    return '<label class="ed-field"><span class="ed-field-label">' + esc(label) + "</span>" +
      "<select" + dataAttrs(opts) + ">" + opts.options + "</select></label>";
  }

  function dataAttrs(opts) {
    var s = ' data-kind="' + esc(opts.kind) + '" data-field="' + esc(opts.field) + '"';
    var idx = opts.indices || {};
    Object.keys(idx).forEach(function (k) { s += " data-" + k + '="' + esc(idx[k]) + '"'; });
    return s;
  }

  function languageOptions(selected) {
    var langs = ["de", "en"];
    if (selected && langs.indexOf(selected) < 0) langs.push(selected);
    return langs.map(function (l) {
      return '<option value="' + esc(l) + '"' + (l === selected ? " selected" : "") + ">" + esc(l) + "</option>";
    }).join("");
  }

  function renderBaseInfo() {
    var p = state.program;
    var h = '<details class="ed-panel" open><summary>' + esc(t("editorBaseInfo")) + "</summary>";
    h += '<div class="ed-grid ed-grid-2">';
    h += inputField(t("editorFId"), { kind: "program", field: "id", value: p.id, placeholder: t("editorIdPatternHint") });
    h += fileNameField(p);
    h += inputField(t("editorFTitle"), { kind: "program", field: "title", value: p.title });
    h += inputField(t("editorFInstitution"), { kind: "program", field: "institution", value: p.institution });
    h += inputField(t("editorFInstitutionAbbr"), { kind: "program", field: "institutionAbbr", value: p.institutionAbbr });
    h += inputField(t("editorFInstitutionUrl"), { kind: "program", field: "institutionUrl", value: p.institutionUrl });
    h += selectField(t("editorFLanguage"), { kind: "program", field: "language", options: languageOptions(p.language) });
    h += inputField(t("editorFSource"), { kind: "program", field: "source", value: p.source });
    h += inputField(t("editorFSourceLabel"), { kind: "program", field: "sourceLabel", value: p.sourceLabel });
    h += "</div></details>";
    return h;
  }

  /* the id must equal the file name; show it and offer a one-click sync */
  function fileNameField(p) {
    var derived = state.fileName || (p.id ? p.id + ".yaml" : "—");
    var mismatch = state.fileName && p.id !== fileBaseName(state.fileName);
    var h = '<label class="ed-field ed-field-wide"><span class="ed-field-label">' + esc(t("editorFFileName")) + "</span>";
    h += '<div class="ed-file-row">';
    h += '<input type="text" value="' + esc(derived) + '" readonly tabindex="-1" title="' + esc(derived) + '">';
    if (mismatch) {
      h += '<button type="button" class="ed-btn" data-action="sync-id-from-file">' + esc(t("editorUseFileName")) + "</button>";
      if (!isEmptyStr(p.id)) {
        h += '<button type="button" class="ed-btn" data-action="sync-file-from-id">' + esc(t("editorUseId")) + "</button>";
      }
    }
    h += "</div></label>";
    return h;
  }

  /* ---------- categories ---------- */
  function renderCategories() {
    var p = state.program;
    var h = '<details class="ed-panel" open><summary>' + esc(t("editorCategories")) +
      ' <span class="ed-count">' + (p.categories || []).length + "</span></summary>";
    h += '<div class="ed-list">';
    (p.categories || []).forEach(function (c, ci) {
      h += '<div class="' + itemClasses("category", c, categoryEmpty(c)) + '" data-kind="category" data-ci="' + ci + '">';
      h += '<div class="ed-row-fields">';
      h += inputField(t("editorCategoryId"), { kind: "category", field: "id", value: c.id, indices: { ci: ci } });
      h += inputField(t("editorCategoryLabel"), { kind: "category", field: "label", value: c.label, indices: { ci: ci } });
      h += "</div>";
      h += itemFooter("category", c, categoryEmpty(c));
      h += "</div>";
    });
    h += "</div>";
    h += '<button type="button" class="ed-btn ed-btn-add" data-action="add-category">+ ' + esc(t("editorAddCategory")) + "</button>";
    h += "</details>";
    return h;
  }

  /* ---------- modules ---------- */

  function renderModules() {
    var p = state.program;
    var mods = p.modules || [];
    var h = '<section class="ed-modules"><div class="ed-section-head"><h2>' + esc(t("editorModules")) +
      ' <span class="ed-count">' + mods.length + "</span></h2></div>";
    mods.forEach(function (m, mi) {
      h += renderModule(m, mi);
    });
    h += '<button type="button" class="ed-btn ed-btn-add ed-add-module" data-action="add-module">+ ' + esc(t("editorAddModule")) + "</button>";
    h += "</section>";
    return h;
  }

  function moduleOpen(m) {
    if (Object.prototype.hasOwnProperty.call(state.openModules, m._uid)) return state.openModules[m._uid];
    return !!m._isNew;
  }

  function renderModule(m, mi) {
    var open = moduleOpen(m);
    var mapCount = (m.mappings || []).filter(function (x) { return !isDeleted(x); }).length;
    var h = '<details class="' + itemClasses("module", m, moduleEmpty(m)) + ' ed-module" data-kind="module" data-mi="' + mi + '"' + (open ? " open" : "") + ">";
    h += '<summary class="ed-module-summary">';
    h += '<span class="ed-module-code" data-role="sum-code">' + esc(m.code || "–") + "</span>";
    h += '<span class="ed-module-title" data-role="sum-title">' + esc(m.title || t("editorFTitle")) + "</span>";
    h += '<span class="ed-module-meta" data-role="sum-meta">' + esc(moduleMeta(m, mapCount)) + "</span>";
    h += "</summary>";
    h += '<div class="ed-module-body">';

    h += '<div class="ed-grid ed-grid-4">';
    h += inputField(t("editorFCode"), { kind: "module", field: "code", value: m.code, indices: { mi: mi } });
    h += inputField(t("editorFTitle"), { kind: "module", field: "title", value: m.title, indices: { mi: mi } });
    h += inputField(t("editorFCredits"), { kind: "module", field: "credits", value: m.credits, type: "number", indices: { mi: mi }, attrs: ' min="1" max="60" step="1"' });
    h += selectField(t("editorFCategory"), {
      kind: "module", field: "category", indices: { mi: mi },
      options: categoryOptions(m.category)
    });
    h += "</div>";
    h += textareaField(t("editorFGoals"), { kind: "module", field: "goals", value: m.goals, rows: 4, indices: { mi: mi } });

    /* topics */
    h += '<div class="ed-subhead">' + esc(t("editorFTopics")) + "</div>";
    h += '<div class="ed-list ed-topics">';
    if (!(m.topics || []).length) h += '<p class="small muted">' + esc(t("editorTopicsEmpty")) + "</p>";
    (m.topics || []).forEach(function (tp, ti) {
      h += '<div class="' + itemClasses("topic", tp, topicEmpty(tp)) + ' ed-topic" data-kind="topic" data-mi="' + mi + '" data-ti="' + ti + '">';
      h += '<input type="text"' + dataAttrs({ kind: "topic", field: "text", indices: { mi: mi, ti: ti } }) +
        ' value="' + esc(tp.text) + '">';
      h += itemFooter("topic", tp, topicEmpty(tp));
      h += "</div>";
    });
    h += "</div>";
    h += '<button type="button" class="ed-btn ed-btn-add" data-action="add-topic" data-mi="' + mi + '">+ ' + esc(t("editorAddTopic")) + "</button>";

    /* mappings */
    h += '<div class="ed-subhead">' + esc(t("editorMappings")) + ' <span class="ed-count">' + mapCount + "</span></div>";
    h += '<div class="ed-list ed-mappings">';
    if (!(m.mappings || []).length) h += '<p class="small muted">' + esc(t("editorNoMappings")) + "</p>";
    (m.mappings || []).forEach(function (mp, mpi) {
      h += renderMapping(mp, mi, mpi);
    });
    h += "</div>";
    h += '<button type="button" class="ed-btn ed-btn-add" data-action="add-mapping" data-mi="' + mi + '">+ ' + esc(t("editorAddMapping")) + "</button>";

    h += itemFooter("module", m, moduleEmpty(m));
    h += "</div></details>";
    return h;
  }

  function moduleMeta(m, mapCount) {
    var parts = [];
    if (!isEmptyStr(m.credits)) parts.push(m.credits + " " + t("editorLpShort"));
    if (!isEmptyStr(m.category)) parts.push(m.category);
    parts.push(mapCount + " × " + t("editorCompShort"));
    return parts.join(" · ");
  }

  function categoryOptions(selected) {
    var cats = (state.program.categories || []).filter(function (c) { return !isDeleted(c); });
    var h = '<option value="">' + esc(t("editorSelectCategory")) + "</option>";
    var found = false;
    cats.forEach(function (c) {
      if (c.id === selected) found = true;
      h += '<option value="' + esc(c.id) + '"' + (c.id === selected ? " selected" : "") + ">" +
        esc(c.label || c.id) + " (" + esc(c.id) + ")</option>";
    });
    if (selected && !found) h += '<option value="' + esc(selected) + '" selected>' + esc(selected) + "</option>";
    return h;
  }

  function renderMapping(mp, mi, mpi) {
    var idx = { mi: mi, mpi: mpi };
    var h = '<div class="' + itemClasses("mapping", mp, mappingEmpty(mp)) + ' ed-mapping" data-kind="mapping" data-mi="' + mi + '" data-mpi="' + mpi + '">';
    h += '<div class="ed-grid ed-grid-3">';
    h += selectField(t("editorFFramework"), { kind: "mapping", field: "framework", indices: idx, options: frameworkOptions(mp.framework) });
    h += selectField(t("editorFCompetency"), { kind: "mapping", field: "competency", indices: idx, options: competencyOptions(mp.framework, mp.competency) });
    h += selectField(t("editorFLevel"), { kind: "mapping", field: "level", indices: idx, options: levelOptions(mp.level) });
    h += "</div>";
    h += '<div class="ed-grid ed-grid-2">';
    h += textareaField(t("editorFNoteDe"), { kind: "mapping", field: "note.de", value: mp.note && mp.note.de, rows: 2, indices: idx });
    h += textareaField(t("editorFNoteEn"), { kind: "mapping", field: "note.en", value: mp.note && mp.note.en, rows: 2, indices: idx });
    h += "</div>";
    h += itemFooter("mapping", mp, mappingEmpty(mp));
    h += "</div>";
    return h;
  }

  function frameworkOptions(selected) {
    var h = '<option value="">' + esc(t("editorSelectFramework")) + "</option>";
    var found = false;
    state.frameworkOrder.forEach(function (id) {
      if (id === selected) found = true;
      h += '<option value="' + esc(id) + '"' + (id === selected ? " selected" : "") + ">" + esc(frameworkLabel(id)) + "</option>";
    });
    if (selected && !found) h += '<option value="' + esc(selected) + '" selected>' + esc(selected) + "</option>";
    return h;
  }

  function competencyOptions(frameworkId, selected) {
    var h = '<option value="">' + esc(t("editorSelectCompetency")) + "</option>";
    var fwd = frameworkData(frameworkId);
    var found = false;
    var oph = orientationPhaseOf(fwd);
    if (oph) {
      if (String(selected) === ORIENTATION_CODE) found = true;
      h += '<option value="' + esc(ORIENTATION_CODE) + '"' + (String(selected) === ORIENTATION_CODE ? " selected" : "") + ">" +
        esc(oph.title) + "</option>";
    }
    if (fwd && fwd.competencies) {
      fwd.competencies.forEach(function (c) {
        if (String(c.code) === String(selected)) found = true;
        h += '<option value="' + esc(c.code) + '"' + (String(c.code) === String(selected) ? " selected" : "") + ">" +
          esc(c.code + " – " + c.title) + "</option>";
      });
    }
    if (selected && !found) {
      h += '<option value="' + esc(selected) + '" selected>' + esc(selected + " – " + t("editorCompetencyUnknown")) + "</option>";
    }
    return h;
  }

  function levelOptions(selected) {
    var levels = [
      { v: 1, key: "editorLevel1" },
      { v: 2, key: "editorLevel2" },
      { v: 3, key: "editorLevel3" }
    ];
    return levels.map(function (l) {
      return '<option value="' + l.v + '"' + (toInt(selected) === l.v ? " selected" : "") + ">" + esc(t(l.key)) + "</option>";
    }).join("");
  }

  /* ---------- item helpers ---------- */

  function itemClasses(kind, item, empty) {
    var cls = "ed-item ed-item-" + kind;
    if (isDeleted(item)) cls += " marked-deleted";
    if (empty) cls += " is-empty";
    return cls;
  }

  function itemFooter(kind, item, empty) {
    var markLabel = isDeleted(item) ? t("editorUnmarkDelete") : t("editorMarkDelete");
    var h = '<div class="ed-item-footer">';
    h += '<span class="ed-deleted-note">' + esc(t("editorDeletedNote")) + "</span>";
    h += '<button type="button" class="ed-btn ed-btn-danger btn-remove" data-action="remove" data-item-kind="' + kind + '">' +
      esc(t("editorRemove")) + "</button>";
    h += '<button type="button" class="ed-btn btn-mark" data-action="mark" data-item-kind="' + kind + '">' +
      esc(markLabel) + "</button>";
    h += "</div>";
    return h;
  }

  function defaultCategoryId() {
    var cats = (state.program && state.program.categories || []).filter(function (c) { return !isDeleted(c); });
    return cats.length ? cats[0].id : "";
  }
  function defaultFrameworkId() {
    return state.frameworkOrder.length ? state.frameworkOrder[0] : "";
  }

  /* an item is "empty" when it holds no content beyond the default values, so it
   * can be deleted immediately instead of being marked for deletion */
  function moduleEmpty(m) {
    if (!isEmptyStr(m.code) || !isEmptyStr(m.title) || !isEmptyStr(m.goals) || !isEmptyStr(m.credits)) return false;
    if (!isEmptyStr(m.category) && m.category !== defaultCategoryId()) return false;
    var topics = (m.topics || []).filter(function (tp) { return !isDeleted(tp); });
    if (topics.some(function (tp) { return !isEmptyStr(tp.text); })) return false;
    var maps = (m.mappings || []).filter(function (mp) { return !isDeleted(mp); });
    if (maps.some(function (mp) { return !mappingEmpty(mp); })) return false;
    return true;
  }
  function mappingEmpty(mp) {
    var noNote = isEmptyStr(mp.note && mp.note.de) && isEmptyStr(mp.note && mp.note.en);
    /* Single exception to the "empty" rule: a mapping inserted from the framework
     * panel already carries a competency but no rationale yet, so it can still be
     * deleted right away. */
    if (mp._isNew && noNote) return true;
    var fwDefault = isEmptyStr(mp.framework) || mp.framework === defaultFrameworkId();
    return isEmptyStr(mp.competency) && noNote && fwDefault && toInt(mp.level) === 1;
  }
  function topicEmpty(tp) { return isEmptyStr(tp.text); }
  function categoryEmpty(c) { return isEmptyStr(c.id) && isEmptyStr(c.label); }

  function itemIsEmpty(kind, item) {
    if (kind === "module") return moduleEmpty(item);
    if (kind === "mapping") return mappingEmpty(item);
    if (kind === "topic") return topicEmpty(item);
    return categoryEmpty(item);
  }

  /* ================= model access ================= */

  function modelTarget(el) {
    var kind = el.getAttribute("data-kind");
    var p = state.program;
    if (!p) return null;
    var mi, mpi, ci, ti;
    if (kind === "program") return { obj: p };
    if (kind === "category") {
      ci = parseInt(el.getAttribute("data-ci"), 10);
      return { obj: (p.categories || [])[ci] };
    }
    mi = parseInt(el.getAttribute("data-mi"), 10);
    if (kind === "module") return { obj: (p.modules || [])[mi] };
    if (!p.modules || !p.modules[mi]) return null;
    if (kind === "mapping") {
      mpi = parseInt(el.getAttribute("data-mpi"), 10);
      return { obj: (p.modules[mi].mappings || [])[mpi] };
    }
    if (kind === "topic") {
      ti = parseInt(el.getAttribute("data-ti"), 10);
      return { obj: (p.modules[mi].topics || [])[ti] };
    }
    return null;
  }

  function setFieldValue(el) {
    var target = modelTarget(el);
    if (!target || !target.obj) return;
    var field = el.getAttribute("data-field");
    if (field.indexOf(".") >= 0) {
      var parts = field.split(".");
      if (!target.obj[parts[0]] || typeof target.obj[parts[0]] !== "object") target.obj[parts[0]] = {};
      target.obj[parts[0]][parts[1]] = el.value;
    } else {
      target.obj[field] = el.value;
    }
    markDirty();
  }

  function markDirty() {
    if (!state.ready || !state.program) return;
    state.dirty = true;
    scheduleAutosave();
    refreshStatus();
  }

  function refreshStatus() {
    var sb = byId("editor-sidebar");
    if (!sb) return;
    var status = sb.querySelector(".ed-status");
    if (status) status.textContent = savedStatusText();
    refreshAllItems();
  }

  function refreshAllItems() {
    var items = document.querySelectorAll(".ed-item[data-kind]");
    Array.prototype.forEach.call(items, refreshItem);
  }

  function refreshItem(el) {
    if (!el) return;
    var target = modelTarget(el);
    if (!target || !target.obj) return;
    var item = target.obj;
    var kind = el.getAttribute("data-kind");
    var empty = itemIsEmpty(kind, item);
    el.classList.toggle("marked-deleted", isDeleted(item));
    el.classList.toggle("is-empty", empty);
    var markBtn = ownButton(el, "mark");
    if (markBtn) markBtn.textContent = isDeleted(item) ? t("editorUnmarkDelete") : t("editorMarkDelete");
  }

  /* the mark/remove button that belongs to THIS item (not to a nested one) */
  function ownButton(el, action) {
    var btns = el.querySelectorAll('[data-action="' + action + '"]');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].closest(".ed-item") === el) return btns[i];
    }
    return null;
  }

  /* ================= autosave / draft ================= */

  var autosaveTimer = null;
  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () { saveDraft(); }, 500);
  }

  function saveDraft() {
    if (!state.program) return;
    var p = state.program;
    if (!state.draftId) state.draftId = draftIdFor();
    var draft = {
      id: state.draftId,
      v: 1,
      programId: p.id || "",
      title: p.title || "",
      source: state.source,
      sourcePath: state.sourcePath,
      fileName: state.fileName,
      lang: state.lang,
      savedAt: Date.now(),
      yaml: safeDump(exportProgram(false)),
      model: p
    };
    var replaced = false;
    for (var i = 0; i < state.drafts.length; i++) {
      if (state.drafts[i].id === draft.id) { state.drafts[i] = draft; replaced = true; break; }
    }
    if (!replaced) state.drafts.unshift(draft);
    writeDrafts();
    state.savedAt = draft.savedAt;
    state.dirty = false;
    renderSidebar();
  }

  function safeDump(obj) {
    try { return dumpYaml(obj); } catch (e) { return ""; }
  }

  function deleteDraftById(id) {
    state.drafts = state.drafts.filter(function (d) { return d.id !== id; });
    writeDrafts();
    if (state.draftId === id) {
      state.draftId = null;
      state.savedAt = null;
      state.dirty = false;
    }
  }

  /* ================= program sources ================= */

  function confirmReplace() {
    if (state.dirty && !window.confirm(t("editorConfirmReplace"))) return false;
    return true;
  }

  function loadRepoProgram(path) {
    if (!path) return;
    if (!confirmReplace()) { renderSidebar(); return; }
    setNotice("info", t("loading"));
    renderMain();
    fetchYaml(path).then(function (raw) {
      applyProgram(raw, "repo", path, path.replace(/^.*\//, ""));
      setNotice("ok", t("editorOkLoaded") + ": " + path.split("/").pop());
      renderMain();
    }).catch(function (err) {
      setNotice("error", parseErrorMessage(err));
      renderMain();
      renderSidebar();
    });
  }

  function applyProgram(raw, source, sourcePath, fileName) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      setNotice("error", t("editorErrNoFile"));
      renderMain();
      renderSidebar();
      return;
    }
    state.program = normalizeProgram(raw);
    /* the id must equal the file name: fill it in when the file has none */
    if (fileName && isEmptyStr(state.program.id)) state.program.id = fileBaseName(fileName);
    state.source = source;
    state.sourcePath = sourcePath || null;
    state.fileName = fileName || null;
    state.openModules = {};
    state.activeModuleUid = null;
    state.draftId = (state.program.id || sourcePath || ("neu-" + Date.now()));
    var existing = draftById(state.draftId);
    state.savedAt = existing ? existing.savedAt : null;
    state.dirty = false;
    render();
  }

  function createNewProgram() {
    if (!confirmReplace()) return;
    var template = {
      $schema: PROGRAM_SCHEMA,
      id: "",
      title: "",
      institution: "",
      institutionAbbr: "",
      institutionUrl: "",
      language: state.lang === "en" ? "en" : "de",
      categories: [{ id: "pflicht", label: state.lang === "en" ? "Compulsory" : "Pflicht", _isNew: true }],
      modules: []
    };
    setNotice("info", t("editorNew"));
    applyProgram(template, "new", null, null);
  }

  function handleUpload(file) {
    if (!file) return;
    if (!confirmReplace()) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var raw = window.jsyaml.load(String(reader.result));
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          setNotice("error", t("editorErrNoFile"));
          renderMain();
          return;
        }
        applyProgram(raw, "upload", null, file.name);
        setNotice("ok", t("editorOkLoaded") + ": " + file.name);
        renderMain();
      } catch (err) {
        setNotice("error", parseErrorMessage(err));
        renderMain();
      }
    };
    reader.onerror = function () { setNotice("error", "Read error: " + file.name); renderMain(); };
    reader.readAsText(file);
  }

  function parseErrorMessage(err) {
    var msg = t("editorErrParse");
    if (err && err.message) {
      msg += ": " + err.message.split("\n")[0];
    }
    if (err && err.mark && err.mark.line !== undefined) {
      msg += " (" + t("editorErrLine") + " " + (err.mark.line + 1) +
        ", " + t("editorErrColumn") + " " + (err.mark.column + 1) + ")";
    }
    return msg;
  }

  /* ================= export ================= */

  function handleExport() {
    state.errors = validate();
    renderSidebar();
    if (state.errors.length) {
      setNotice("error", t("editorExportBlocked") + " (" + state.errors.length + ")");
      renderMain();
      return;
    }
    var clean = exportProgram(true);
    var yaml = dumpYaml(clean);
    var name = (state.program.id || "program") + ".yaml";
    downloadBlob(name, yaml);
    setNotice("ok", t("editorOkExported") + " → " + name);
    renderMain();
  }

  function downloadBlob(name, text) {
    var blob = new Blob([text], { type: "text/yaml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function showRemovalPreview() {
    var del = countDeleted();
    var lines = [];
    if (state.program) {
      var p = state.program;
      (p.categories || []).forEach(function (c) {
        if (isDeleted(c)) lines.push("Kategorie: " + (c.label || c.id || "—") + " [" + c.id + "]");
      });
      (p.modules || []).forEach(function (m) {
        var code = m.code || "—";
        if (isDeleted(m)) lines.push("Modul (komplett): " + code + " – " + (m.title || ""));
        (m.topics || []).forEach(function (tp) { if (isDeleted(tp)) lines.push("  Thema in " + code + ": " + (tp.text || "")); });
        (m.mappings || []).forEach(function (mp) {
          if (isDeleted(mp)) lines.push("  Zuordnung in " + code + ": " + (mp.framework || "—") + " " + (mp.competency || "—"));
        });
      });
    }
    var body = lines.length
      ? '<ul class="ed-removal-list">' + lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>"
      : '<p class="muted">' + esc(t("editorRemovalsEmpty")) + "</p>";
    openModal(t("editorRemovalsTitle"), body);
  }

  /* ================= modal / notice ================= */

  function openModal(title, bodyHtml) {
    var root = byId("modal-root");
    if (!root) return;
    root.innerHTML = '<div class="modal-overlay" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h2>' + esc(title) + '</h2><button type="button" class="modal-close" data-action="close-modal" aria-label="' + esc(t("close")) + '">×</button></div>' +
      '<div class="modal-body">' + bodyHtml + "</div></div></div>";
  }

  function closeModal() {
    var root = byId("modal-root");
    if (root) root.innerHTML = "";
  }

  function setNotice(type, text) {
    state.notice = { type: type, text: text };
  }

  function showFatal(err) {
    var main = byId("editor-main");
    if (!main) return;
    var titleKey = "errorUnavailable";
    var msgKey = "errorUnavailableMsg";
    if (err && err.code === "setup") { msgKey = "errorSetup"; }
    else if (err && err.status === 404) { titleKey = "errorNotFound"; msgKey = "errorNotFoundMsg"; }
    var detail = (err && err.message) ? " (" + err.message + ")" : "";
    main.innerHTML = '<div class="load-error"><div class="load-error-code">503</div>' +
      "<h2>" + esc(t(titleKey)) + "</h2><p>" + esc(t(msgKey) + detail) + "</p></div>";
  }

  /* ================= structural edits ================= */

  function findItemEl(target) {
    var el = target.closest(".ed-item");
    return el;
  }

  function removeItem(el) {
    var kind = el.getAttribute("data-kind");
    var p = state.program;
    if (kind === "category") {
      p.categories.splice(parseInt(el.getAttribute("data-ci"), 10), 1);
    } else if (kind === "module") {
      p.modules.splice(parseInt(el.getAttribute("data-mi"), 10), 1);
    } else if (kind === "topic") {
      p.modules[parseInt(el.getAttribute("data-mi"), 10)].topics.splice(parseInt(el.getAttribute("data-ti"), 10), 1);
    } else if (kind === "mapping") {
      p.modules[parseInt(el.getAttribute("data-mi"), 10)].mappings.splice(parseInt(el.getAttribute("data-mpi"), 10), 1);
    }
    markDirty();
    renderMain();
    renderSidebar();
  }

  function toggleDeleted(el) {
    var target = modelTarget(el);
    if (!target || !target.obj) return;
    /* empty/default items are removed right away instead of being marked */
    if (itemIsEmpty(el.getAttribute("data-kind"), target.obj)) { removeItem(el); return; }
    target.obj._deleted = !target.obj._deleted;
    markDirty();
    refreshItem(el);
    renderSidebar();
  }

  /* ================= events ================= */

  function buildLangSelect() {
    var sel = byId("sel-lang");
    if (!sel) return;
    sel.innerHTML = '<option value="de">Deutsch</option><option value="en">English</option>';
    sel.value = state.lang;
  }

  function renderLangSelect() {
    var sel = byId("sel-lang");
    if (sel) sel.value = state.lang;
    var lbl = byId("lbl-language");
    if (lbl) lbl.textContent = t("language");
    var ghLink = document.querySelector(".github-link");
    if (ghLink) {
      ghLink.setAttribute("aria-label", t("githubRepo"));
      ghLink.setAttribute("title", t("githubRepo"));
    }
    var nv = byId("nav-view");
    if (nv) nv.textContent = t("editorNavView");
    var ne = byId("nav-editor");
    if (ne) ne.textContent = t("editorNavEditor");
    var badge = document.querySelector(".editor-badge");
    if (badge) badge.textContent = t("editorBadge");
  }

  function onInput(e) {
    if (e.target.getAttribute && e.target.getAttribute("data-action") === "framework-filter") {
      state.frameworkFilter = e.target.value;
      refreshFrameworkFilter();
      return;
    }
    var el = e.target.closest("[data-field]");
    if (!el) return;
    setFieldValue(el);
    var item = el.closest(".ed-item");
    if (el.getAttribute("data-kind") === "module" && item) refreshModuleSummary(item);
    if (item) refreshItem(item);
    if (state.panelMode === "original") renderFrameworkPanel();
  }

  function refreshModuleSummary(moduleEl) {
    if (!moduleEl) return;
    var mi = parseInt(moduleEl.getAttribute("data-mi"), 10);
    var m = state.program.modules[mi];
    if (!m) return;
    var codeEl = moduleEl.querySelector('[data-role="sum-code"]');
    var titleEl = moduleEl.querySelector('[data-role="sum-title"]');
    var metaEl = moduleEl.querySelector('[data-role="sum-meta"]');
    var mapCount = (m.mappings || []).filter(function (x) { return !isDeleted(x); }).length;
    if (codeEl) codeEl.textContent = m.code || "–";
    if (titleEl) titleEl.textContent = m.title || t("editorFTitle");
    if (metaEl) metaEl.textContent = moduleMeta(m, mapCount);
  }

  function onChange(e) {
    if (e.target.getAttribute && e.target.getAttribute("data-action") === "pick-framework") {
      state.frameworkPanelId = e.target.value;
      savePanelPrefs();
      renderFrameworkPanel();
      return;
    }
    var el = e.target.closest("[data-field]");
    if (!el) return;
    var field = el.getAttribute("data-field");
    var kind = el.getAttribute("data-kind");
    setFieldValue(el);
    if (kind === "mapping" && field === "framework") {
      /* refresh the dependent competency dropdown */
      var mi = parseInt(el.getAttribute("data-mi"), 10);
      var mpi = parseInt(el.getAttribute("data-mpi"), 10);
      var mp = state.program.modules[mi].mappings[mpi];
      var compSel = el.closest(".ed-mapping").querySelector('[data-field="competency"]');
      if (compSel) {
        mp.competency = "";
        compSel.innerHTML = competencyOptions(mp.framework, "");
      }
    }
    if (kind === "module") refreshModuleSummary(el.closest(".ed-item"));
    var item = el.closest(".ed-item");
    if (item) refreshItem(item);
    renderSidebar();
    if (state.panelMode === "original") renderFrameworkPanel();
  }

  function onClick(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    switch (action) {
      case "new-program": createNewProgram(); break;
      case "save-draft":
        if (state.program) { saveDraft(); setNotice("ok", t("editorDraftSaved")); renderMain(); }
        break;
      case "delete-draft":
        if (!state.draftId) { setNotice("info", t("editorDraftsEmpty")); renderMain(); break; }
        if (!window.confirm(t("editorConfirmDeleteDraft"))) return;
        deleteDraftById(state.draftId);
        setNotice("info", t("editorDraftDeleted"));
        render();
        break;
      case "delete-draft-one": {
        var did = el.getAttribute("data-draft-id");
        if (!window.confirm(t("editorConfirmDeleteOne"))) return;
        deleteDraftById(did);
        setNotice("info", t("editorDraftDeleted"));
        render();
        break;
      }
      case "resume-draft":
        resumeDraftById(el.getAttribute("data-draft-id"));
        break;
      case "panel-mode":
        state.panelMode = el.getAttribute("data-value") === "original" ? "original" : "framework";
        savePanelPrefs();
        renderFrameworkPanel();
        break;
      case "panel-add-mapping":
        addMappingFromPanel(el.getAttribute("data-framework"), el.getAttribute("data-competency"));
        break;
      case "sync-id-from-file":
        if (state.fileName) {
          state.program.id = fileBaseName(state.fileName);
          markDirty();
          setNotice("ok", t("editorUseFileName"));
          render();
        }
        break;
      case "sync-file-from-id":
        if (state.program && !isEmptyStr(state.program.id)) {
          state.fileName = state.program.id + ".yaml";
          markDirty();
          setNotice("ok", t("editorUseId"));
          render();
        }
        break;
      case "export": handleExport(); break;
      case "show-removals": showRemovalPreview(); break;
      case "add-category":
        state.program.categories.push({ id: "", label: "", _uid: nextUid(), _isNew: true });
        markDirty(); renderMain(); renderSidebar();
        break;
      case "add-module": addModule(); break;
      case "add-topic": addTopic(el); break;
      case "add-mapping": addMapping(el); break;
      case "remove": {
        var itemEl = findItemEl(el);
        if (itemEl) removeItem(itemEl);
        break;
      }
      case "mark": {
        var markEl = findItemEl(el);
        if (markEl) toggleDeleted(markEl);
        break;
      }
      case "goto-error": {
        var idx = parseInt(el.getAttribute("data-error"), 10);
        scrollToError(state.errors[idx]);
        break;
      }
      case "close-modal":
        if (e.target === el || el.classList.contains("modal-close")) closeModal();
        break;
      default: break;
    }
  }

  function addModule() {
    var cats = (state.program.categories || []).filter(function (c) { return !isDeleted(c); });
    var m = {
      code: "", title: "", credits: "", goals: "",
      category: cats.length ? cats[0].id : "",
      topics: [], mappings: [],
      _uid: nextUid(), _isNew: true
    };
    state.program.modules.push(m);
    state.openModules[m._uid] = true;
    state.activeModuleUid = m._uid;
    markDirty(); renderMain(); renderSidebar();
  }

  function addTopic(el) {
    var mi = parseInt(el.getAttribute("data-mi"), 10);
    var m = state.program.modules[mi];
    var tp = { text: "", _uid: nextUid(), _isNew: true };
    m.topics.push(tp);
    markDirty(); renderMain(); renderSidebar();
  }

  function addMapping(el) {
    var mi = parseInt(el.getAttribute("data-mi"), 10);
    var m = state.program.modules[mi];
    var fwId = state.frameworkOrder.length ? state.frameworkOrder[0] : "";
    m.mappings.push({
      framework: fwId, competency: "", level: 1,
      note: { de: "", en: "" },
      _uid: nextUid(), _isNew: true
    });
    state.openModules[m._uid] = true;
    markDirty(); renderMain(); renderSidebar();
  }

  function scrollToError(err) {
    if (!err || err.mi == null) return;
    var el = document.querySelector('.ed-item-module[data-mi="' + miOfUid(err.mi) + '"]');
    if (el) {
      el.open = true;
      if (el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("ed-flash");
      setTimeout(function () { el.classList.remove("ed-flash"); }, 1200);
    }
  }

  function miOfUid(uid) {
    var mods = state.program.modules || [];
    for (var i = 0; i < mods.length; i++) if (mods[i]._uid === uid) return i;
    return -1;
  }

  function activeModule() {
    var mods = (state.program && state.program.modules) || [];
    for (var i = 0; i < mods.length; i++) {
      if (mods[i]._uid === state.activeModuleUid && !mods[i]._deleted) return mods[i];
    }
    for (var j = mods.length - 1; j >= 0; j--) if (!mods[j]._deleted) return mods[j];
    return null;
  }

  function addMappingFromPanel(frameworkId, competency) {
    if (!state.program) { setNotice("error", t("editorNoProgram")); renderMain(); return; }
    var m = activeModule();
    if (!m) { setNotice("error", t("editorNoActiveModule")); renderMain(); return; }
    m.mappings = m.mappings || [];
    m.mappings.push({
      framework: frameworkId, competency: competency, level: 1,
      note: { de: "", en: "" },
      _uid: nextUid(), _isNew: true
    });
    state.openModules[m._uid] = true;
    state.activeModuleUid = m._uid;
    markDirty();
    setNotice("ok", t("editorAddedMapping"));
    renderMain();
    renderSidebar();
    var idx = (state.program.modules || []).indexOf(m);
    setTimeout(function () {
      var el = document.querySelector('.ed-item-module[data-mi="' + idx + '"]');
      if (el) {
        el.open = true;
        el.classList.add("ed-flash");
        if (el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(function () { el.classList.remove("ed-flash"); }, 1200);
      }
    }, 0);
  }

  function resumeDraftById(id) {
    var d = draftById(id);
    if (!d || !d.model) return;
    if (!confirmReplace()) return;
    if (d.lang) { state.lang = d.lang; localStorage.setItem(LANG_KEY, state.lang); }
    state.program = normalizeProgram(d.model);
    state.source = d.source || null;
    state.sourcePath = d.sourcePath || null;
    state.fileName = d.fileName || null;
    state.draftId = d.id;
    state.savedAt = d.savedAt || null;
    state.dirty = false;
    state.openModules = {};
    state.activeModuleUid = null;
    render();
    setNotice("ok", t("editorResume"));
    renderMain();
  }

  /* ---------- wiring ---------- */

  document.addEventListener("input", onInput);
  document.addEventListener("change", function (e) {
    if (e.target.id === "sel-lang") {
      state.lang = e.target.value;
      localStorage.setItem(LANG_KEY, state.lang);
      render();
      return;
    }
    if (e.target.getAttribute && e.target.getAttribute("data-action") === "pick-program") {
      loadRepoProgram(e.target.value);
      return;
    }
    if (e.target.getAttribute && e.target.getAttribute("data-action") === "upload") {
      handleUpload(e.target.files && e.target.files[0]);
      e.target.value = "";
      return;
    }
    onChange(e);
  });
  document.addEventListener("click", onClick);
  document.addEventListener("focusin", function (e) {
    if (!e.target || !e.target.closest) return;
    var mod = e.target.closest(".ed-item-module");
    if (!mod || !state.program) return;
    var mi = parseInt(mod.getAttribute("data-mi"), 10);
    var m = state.program.modules[mi];
    if (m) state.activeModuleUid = m._uid;
  });
  document.addEventListener("toggle", function (e) {
    var d = e.target;
    if (!d) return;
    if (d.tagName === "DETAILS" && d.classList.contains("ed-drafts-details")) {
      state.draftsOpen = d.open;
      try { localStorage.setItem(DRAFTS_OPEN_KEY, state.draftsOpen ? "1" : "0"); } catch (err) { /* ignore */ }
      return;
    }
    if (d.tagName === "DETAILS" && d.classList.contains("ed-module")) {
      var mi = parseInt(d.getAttribute("data-mi"), 10);
      var m = state.program && state.program.modules[mi];
      if (m) {
        state.openModules[m._uid] = d.open;
        if (d.open) state.activeModuleUid = m._uid;
      }
    }
  }, true);

  window.addEventListener("beforeunload", function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ================= go ================= */
  boot();
})();
