#!/usr/bin/env node
/*
 * Rasterize the SVG logo into a multi-size favicon.
 *
 *   node scripts/svg-to-favicon.js
 *   SRC=assets/logo.svg OUT=assets/favicon.ico node scripts/svg-to-favicon.js
 *
 * The ICO bundles 16/32/48 px frames as embedded PNGs (supported by all
 * current browsers). Rendering uses @resvg/resvg-js, so no system image
 * tooling (librsvg/ImageMagick) is required.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, process.env.SRC || 'assets/logo.svg');
const OUT = path.join(ROOT, process.env.OUT || 'assets/favicon.ico');
const SIZES = [16, 32, 48];

const renderPng = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

// Build a PNG-embedding .ico from a list of PNG buffers.
// https://en.wikipedia.org/wiki/ICO_(file_format)
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type: icon
  header.writeUInt16LE(frames.length, 4);  // image count

  const directory = Buffer.alloc(16 * frames.length);
  let offset = header.length + directory.length;

  frames.forEach((f, i) => {
    const d = 16 * i;
    directory.writeUInt8(f.size >= 256 ? 0 : f.size, d + 0); // width
    directory.writeUInt8(f.size >= 256 ? 0 : f.size, d + 1); // height
    directory.writeUInt8(0, d + 2);          // palette count
    directory.writeUInt8(0, d + 3);          // reserved
    directory.writeUInt16LE(1, d + 4);       // color planes
    directory.writeUInt16LE(32, d + 6);      // bits per pixel
    directory.writeUInt32LE(f.png.length, d + 8);
    directory.writeUInt32LE(offset, d + 12);
    offset += f.png.length;
  });

  return Buffer.concat([header, directory, ...frames.map((f) => f.png)]);
}

function main() {
  const svg = fs.readFileSync(SRC, 'utf8');
  const frames = SIZES.map((size) => ({ size, png: renderPng(svg, size) }));
  fs.writeFileSync(OUT, buildIco(frames));
  console.log(
    `Wrote ${path.relative(ROOT, OUT)} (${SIZES.join('/')} px) from ${path.relative(ROOT, SRC)}`
  );
}

main();
