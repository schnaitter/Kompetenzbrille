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

  var DRAFT_KEY = "kb-editor-draft";
  var LANG_KEY = "kompetenzbrille.editor.lang";
  var PROGRAM_SCHEMA = "data/schemas/program-schema.json";

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

  /* ================= state ================= */

  var uidCounter = 0;
  function nextUid() { uidCounter += 1; return uidCounter; }

  var state = {
    lang: "de",
    source: null,            // repo | upload | new
    sourcePath: null,        // manifest path when source === "repo"
    program: null,           // normalized, editable model
    frameworks: {},          // id -> { de: data, en: data }
    frameworkOrder: [],
    manifest: [],            // program paths
    repoPrograms: [],        // { path, id, title, abbr, language }
    draft: null,
    draftBanner: false,
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
      loadDraft();
      render();
      state.ready = true;
    }).catch(function (err) {
      console.error(err);
      showFatal(err);
    });
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || !d.model) return;
      if (d.lang) state.lang = d.lang;
      state.draft = d;
      state.draftBanner = true;
    } catch (e) { /* ignore a corrupt draft */ }
  }

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
          var known = fwd && fwd.competencies && fwd.competencies.some(function (c) { return String(c.code) === String(mp.competency); });
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

  /* ================= rendering ================= */

  function render() {
    renderLangSelect();
    renderSidebar();
    renderMain();
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
    if (state.draftBanner && state.draft) {
      h += draftBannerHtml();
    }
    if (!state.program) {
      if (!state.draftBanner) h += '<div class="hint-box">' + esc(t("editorNoProgram")) + "</div>";
      main.innerHTML = h;
      return;
    }
    h += renderBaseInfo();
    h += renderCategories();
    h += renderModules();
    main.innerHTML = h;
  }

  function draftBannerHtml() {
    var d = state.draft;
    var title = d.title || d.programId || "—";
    return '<div class="ed-draft-banner">' +
      '<div class="ed-draft-text"><strong>' + esc(t("editorDraftTitle")) + "</strong> – " +
      esc(t("editorDraftFor")) + ": " + esc(title) + " · " + esc(formatTime(d.savedAt)) + "</div>" +
      '<div class="ed-draft-actions">' +
      '<button type="button" class="ed-btn ed-btn-primary" data-action="resume">' + esc(t("editorResume")) + "</button>" +
      '<button type="button" class="ed-btn" data-action="discard">' + esc(t("editorDiscard")) + "</button>" +
      "</div></div>";
  }

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
    if (item._isNew && empty) cls += " is-new-empty";
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

  function moduleEmpty(m) {
    return isEmptyStr(m.code) && isEmptyStr(m.title) && isEmptyStr(m.goals) &&
      (!m.mappings || !m.mappings.length);
  }
  function mappingEmpty(mp) {
    return isEmptyStr(mp.competency) && isEmptyStr(mp.note && mp.note.de) && isEmptyStr(mp.note && mp.note.en);
  }
  function topicEmpty(tp) { return isEmptyStr(tp.text); }
  function categoryEmpty(c) { return isEmptyStr(c.id) && isEmptyStr(c.label); }

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
    var target = modelTarget(el);
    if (!target || !target.obj) return;
    var item = target.obj;
    var kind = el.getAttribute("data-kind");
    var empty = (kind === "module") ? moduleEmpty(item)
      : (kind === "mapping") ? mappingEmpty(item)
        : (kind === "topic") ? topicEmpty(item)
          : categoryEmpty(item);
    el.classList.toggle("marked-deleted", isDeleted(item));
    el.classList.toggle("is-new-empty", !!item._isNew && empty);
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
    var draft = {
      v: 1,
      programId: p.id || "",
      title: p.title || "",
      source: state.source,
      sourcePath: state.sourcePath,
      lang: state.lang,
      savedAt: Date.now(),
      yaml: safeDump(exportProgram(false)),
      model: p
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      state.savedAt = draft.savedAt;
      state.dirty = false;
      refreshStatusOnly();
    } catch (e) {
      setNotice("error", "localStorage: " + (e && e.message ? e.message : e));
    }
  }

  function safeDump(obj) {
    try { return dumpYaml(obj); } catch (e) { return ""; }
  }

  function refreshStatusOnly() {
    var sb = byId("editor-sidebar");
    if (!sb) return;
    var status = sb.querySelector(".ed-status");
    if (status) status.textContent = savedStatusText();
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    state.savedAt = null;
    state.dirty = false;
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
      applyProgram(raw, "repo", path);
      setNotice("ok", t("editorOkLoaded") + ": " + path.split("/").pop());
      renderMain();
    }).catch(function (err) {
      setNotice("error", parseErrorMessage(err));
      renderMain();
      renderSidebar();
    });
  }

  function applyProgram(raw, source, sourcePath) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      setNotice("error", t("editorErrNoFile"));
      renderMain();
      renderSidebar();
      return;
    }
    state.program = normalizeProgram(raw);
    state.source = source;
    state.sourcePath = sourcePath || null;
    state.draftBanner = false;
    state.openModules = {};
    state.dirty = false;
    state.savedAt = null;
    /* the single draft slot now refers to the freshly chosen source */
    clearDraft();
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
    applyProgram(template, "new", null);
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
        applyProgram(raw, "upload", null);
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
    var nv = byId("nav-view");
    if (nv) nv.textContent = t("editorNavView");
    var ne = byId("nav-editor");
    if (ne) ne.textContent = t("editorNavEditor");
    var badge = document.querySelector(".editor-badge");
    if (badge) badge.textContent = t("editorBadge");
  }

  function onInput(e) {
    var el = e.target.closest("[data-field]");
    if (!el) return;
    setFieldValue(el);
    if (el.getAttribute("data-kind") === "module") refreshModuleSummary(el.closest(".ed-item"));
    refreshItem(el.closest(".ed-item"));
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
    renderSidebar();
  }

  function onClick(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    switch (action) {
      case "new-program": createNewProgram(); break;
      case "save-draft":
        if (state.program) { saveDraft(); setNotice("ok", t("editorSaveBrowser")); renderMain(); }
        break;
      case "delete-draft":
        if (!window.confirm(t("editorConfirmDeleteDraft"))) return;
        clearDraft();
        state.draftBanner = false;
        state.draft = null;
        setNotice("info", t("editorDeleteDraft"));
        render();
        break;
      case "export": handleExport(); break;
      case "show-removals": showRemovalPreview(); break;
      case "resume": resumeDraft(); break;
      case "discard":
        if (!window.confirm(t("editorConfirmDiscard"))) return;
        clearDraft();
        state.draftBanner = false;
        state.draft = null;
        render();
        break;
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
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("ed-flash");
      setTimeout(function () { el.classList.remove("ed-flash"); }, 1200);
    }
  }

  function miOfUid(uid) {
    var mods = state.program.modules || [];
    for (var i = 0; i < mods.length; i++) if (mods[i]._uid === uid) return i;
    return -1;
  }

  function resumeDraft() {
    var d = state.draft;
    if (!d || !d.model) return;
    if (d.lang) { state.lang = d.lang; localStorage.setItem(LANG_KEY, state.lang); }
    state.program = normalizeProgram(d.model);
    state.source = d.source || null;
    state.sourcePath = d.sourcePath || null;
    state.savedAt = d.savedAt || null;
    state.dirty = false;
    state.draftBanner = false;
    state.openModules = {};
    render();
    setNotice("ok", t("editorResume"));
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
  document.addEventListener("toggle", function (e) {
    var d = e.target;
    if (d && d.tagName === "DETAILS" && d.classList.contains("ed-module")) {
      var mi = parseInt(d.getAttribute("data-mi"), 10);
      var m = state.program && state.program.modules[mi];
      if (m) state.openModules[m._uid] = d.open;
    }
  }, true);

  window.addEventListener("beforeunload", function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ================= go ================= */
  boot();
})();
