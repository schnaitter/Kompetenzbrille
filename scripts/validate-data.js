// Validate Kompetenzbrille data files against their JSON Schemas, check
// cross-file references, and validate the generated JSON-LD serializations.
//
//   npm install                # installs the dev dependency (ajv)
//   node scripts/validate-data.js
//
// Uses the vendored js/vendor/js-yaml.min.js for YAML parsing.
'use strict';

const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
// Change into the repo root so relative data paths work from any cwd.
process.chdir(ROOT);

const Ajv2020 = require('ajv/dist/2020').default ?? require('ajv/dist/2020');
const yaml = require(path.join(ROOT, 'js', 'vendor', 'js-yaml.min.js'));

const schemas = {
  framework: JSON.parse(fs.readFileSync('data/schemas/framework-schema.json','utf8')),
  program: JSON.parse(fs.readFileSync('data/schemas/program-schema.json','utf8')),
};
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = { framework: ajv.compile(schemas.framework), program: ajv.compile(schemas.program) };

const frameworks = {};
let fail = 0;
for (const f of fs.readdirSync('data/frameworks').filter(f=>f.endsWith('.yaml'))) {
  const d = yaml.load(fs.readFileSync('data/frameworks/'+f,'utf8'));
  if (!validators.framework(d)) { fail++; console.log('FAIL framework', f, JSON.stringify(validators.framework.errors,null,1)); }
  else console.log('ok   framework', f);
  frameworks[d.id] = d;
}
const programs = {};
for (const f of fs.readdirSync('data/programs').filter(f=>f.endsWith('.yaml'))) {
  const d = yaml.load(fs.readFileSync('data/programs/'+f,'utf8'));
  if (!validators.program(d)) { fail++; console.log('FAIL program', f, JSON.stringify(validators.program.errors,null,1)); }
  else console.log('ok   program', f);
  const expectedId = f.replace(/\.yaml$/, '');
  if (d.id !== expectedId) { fail++; console.log('FAIL program', f, 'id', d.id, 'does not match file name (expected', expectedId + ')'); }
  programs[d.id] = d;
}
// cross-file checks
for (const [pid,p] of Object.entries(programs)) {
  for (const m of p.modules) {
    if (!p.categories.some(c=>c.id===m.category)) { fail++; console.log('FAIL', pid, m.code, 'unknown category', m.category); }
    for (const mp of m.mappings||[]) {
      const fw = frameworks[mp.framework];
      if (!fw) { fail++; console.log('FAIL', pid, m.code, 'unknown framework', mp.framework); continue; }
      if (!fw.competencies.some(c=>c.code===mp.competency)) { fail++; console.log('FAIL', pid, m.code, 'unknown competency', mp.framework, mp.competency); }
      const comp = fw.competencies.find(c=>c.code===mp.competency);
      if (comp && !fw.phases.some(ph=>ph.id===comp.phase)) { fail++; console.log('FAIL framework', fw.id, 'competency', comp.code, 'bad phase'); }
    }
  }
}
// framework-internal: dimension rows match declared dimensions
for (const fw of Object.values(frameworks)) {
  const dimIds = new Set(fw.dimensions.map(d=>d.id));
  for (const c of fw.competencies) {
    for (const k of Object.keys(c)) {
      if (!['code','phase','title'].includes(k) && !dimIds.has(k)) { fail++; console.log('FAIL', fw.id, c.code, 'dimension row', k, 'not declared'); }
    }
  }
}
// Validate generated JSON-LD serializations (data/jsonld/) against the same
// schemas — they are JSON-LD *and* schema-valid JSON (the schemas declare
// @context/@id/@type as optional properties).
const jsonldDir = path.join(ROOT, 'data', 'jsonld');
if (fs.existsSync(jsonldDir)) {
  for (const kind of ['frameworks', 'programs']) {
    const dir = path.join(jsonldDir, kind);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonld')).sort()) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const kindKey = kind === 'frameworks' ? 'framework' : 'program';
      if (!validators[kindKey](d)) {
        fail++;
        console.log('FAIL jsonld', kind + '/' + f, JSON.stringify(validators[kindKey].errors, null, 1));
      } else {
        console.log('ok   jsonld  ', kind + '/' + f);
      }
      if (d['@context'] === undefined) { fail++; console.log('FAIL jsonld', kind + '/' + f, 'missing @context'); }
    }
  }
}

console.log(fail ? 'FAILURES: ' + fail : 'ALL OK');
