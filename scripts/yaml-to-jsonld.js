#!/usr/bin/env node
/*
 * Convert Kompetenzbrille YAML data files to JSON-LD.
 *
 *   node scripts/yaml-to-jsonld.js            # write data/jsonld/*.jsonld
 *   BASE=https://example.org/ node scripts/yaml-to-jsonld.js
 *
 * The JSON-LD output uses the @context files in data/schemas/ and is still
 * valid against the JSON Schemas in data/schemas/ (the schemas declare
 * @context, @id, @type as optional properties).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const yaml = require(path.join(ROOT, 'js', 'vendor', 'js-yaml.min.js'));

// Base IRI for generated node identifiers (override with BASE=… env var).
const BASE = (process.env.BASE || 'https://schnaitter.github.io/Kompetenzbrille/').replace(/\/?$/, '/');
const OUT_DIR = path.join(ROOT, 'data', 'jsonld');

const FW_CONTEXT = BASE + 'data/schemas/framework-context.jsonld';
const PR_CONTEXT = BASE + 'data/schemas/program-context.jsonld';

const readYaml = (rel) => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJson = (rel, doc) => {
  const file = path.join(OUT_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  return file;
};

// ---------------------------------------------------------------- frameworks

function frameworkToJsonLd(fw) {
  const docIri = BASE + 'frameworks/' + fw.id + '/' + fw.version;
  const phaseIri = (id) => docIri + '/phase/' + id;
  const dimIri = (id) => docIri + '/dimension/' + id;
  const compIri = (code) => docIri + '/competency/' + code;

  const doc = {
    '@context': FW_CONTEXT,
    '@id': docIri,
    '@type': 'CompetencyFramework',
  };
  for (const key of ['id', 'version', 'language', 'title', 'shortTitle', 'description', 'doi']) {
    if (fw[key] !== undefined) doc[key] = fw[key];
  }
  if (fw.source !== undefined) doc.source = BASE + fw.source;
  doc.phases = fw.phases.map((p) => ({
    '@id': phaseIri(p.id), '@type': 'Phase', id: p.id, title: p.title,
    ...(p.text !== undefined ? { text: p.text } : {}),
    ...(p.note !== undefined ? { note: p.note } : {}),
  }));
  doc.dimensions = fw.dimensions.map((d) => ({
    '@id': dimIri(d.id), '@type': 'Dimension', id: d.id, label: d.label,
  }));
  doc.competencies = fw.competencies.map((c) => {
    const node = {
      '@id': compIri(c.code), '@type': 'Competency',
      code: c.code, phase: phaseIri(c.phase), title: c.title,
    };
    for (const k of Object.keys(c)) {
      if (!['code', 'phase', 'title'].includes(k)) node[k] = c[k];
    }
    return node;
  });
  return doc;
}

// ------------------------------------------------------------------ programs

function programToJsonLd(pr, frameworkVersions) {
  const docIri = BASE + 'programs/' + pr.id;
  const catIri = (id) => docIri + '/category/' + id;
  const moduleIri = (code) => docIri + '/module/' + code;

  const doc = {
    '@context': PR_CONTEXT,
    '@id': docIri,
    '@type': 'StudyProgram',
  };
  for (const key of ['id', 'title', 'institution', 'institutionAbbr', 'language', 'sourceLabel']) {
    if (pr[key] !== undefined) doc[key] = pr[key];
  }
  if (pr.institutionUrl !== undefined) doc.institutionUrl = pr.institutionUrl;
  if (pr.source !== undefined) doc.source = BASE + pr.source;
  doc.categories = pr.categories.map((c) => ({
    '@id': catIri(c.id), '@type': 'ModuleCategory', id: c.id, label: c.label,
  }));
  doc.modules = pr.modules.map((m) => {
    const node = {
      '@id': moduleIri(m.code), '@type': 'Module',
      code: m.code, title: m.title, credits: m.credits, category: catIri(m.category),
      goals: m.goals,
    };
    if (m.topics !== undefined) node.topics = m.topics;
    node.mappings = (m.mappings || []).map((mp) => {
      const version = frameworkVersions[mp.framework];
      if (!version) throw new Error('mapping references unknown framework: ' + mp.framework);
      return {
        '@id': moduleIri(m.code) + '/mapping/' + mp.framework + '-' + String(mp.competency).replace(/\./g, '_'),
        '@type': 'CompetencyMapping',
        framework: BASE + 'frameworks/' + mp.framework + '/' + version,
        competency: BASE + 'frameworks/' + mp.framework + '/' + version + '/competency/' + mp.competency,
        level: mp.level,
        note: mp.note,
      };
    });
    return node;
  });
  return doc;
}

// ---------------------------------------------------------------------- main

function main() {
  const frameworkVersions = {};
  const frameworkFiles = fs.readdirSync(path.join(ROOT, 'data', 'frameworks'))
    .filter((f) => f.endsWith('.yaml')).sort();
  const programFiles = fs.readdirSync(path.join(ROOT, 'data', 'programs'))
    .filter((f) => f.endsWith('.yaml')).sort();

  for (const f of frameworkFiles) {
    const fw = readYaml('data/frameworks/' + f);
    frameworkVersions[fw.id] = fw.version;
  }

  let n = 0;
  for (const f of frameworkFiles) {
    const fw = readYaml('data/frameworks/' + f);
    const out = writeJson('frameworks/' + f.replace(/\.yaml$/, '.jsonld'), frameworkToJsonLd(fw));
    console.log('wrote', path.relative(ROOT, out), '(' + fw.language + ')');
    n++;
  }
  for (const f of programFiles) {
    const pr = readYaml('data/programs/' + f);
    const out = writeJson('programs/' + f.replace(/\.yaml$/, '.jsonld'), programToJsonLd(pr, frameworkVersions));
    console.log('wrote', path.relative(ROOT, out));
    n++;
  }
  console.log(n + ' JSON-LD document(s) written to ' + path.relative(ROOT, OUT_DIR) + ' (base IRI: ' + BASE + ')');
}

main();
