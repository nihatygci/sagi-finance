#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════
//  update-readme-version.js — SAGI Finance web repo sürüm senkronu
//
//  NE YAPAR:
//  Aynı klasördeki version.js'i okur (SAGI_VERSION.app), README.md'nin
//  en üstündeki "**vX.X.X**" satırını o değerle günceller.
//
//  version.js zaten bu repo'nun içinde olduğu için internetten bir şey
//  çekmez — Android tarafındaki sync-version.js'ten farklı olarak
//  doğrudan yerel dosyayı okur.
//
//  NASIL ÇALIŞTIRILIR:
//  Web repo'nun kökünde (version.js, README.md ile aynı klasör):
//
//      node update-readme-version.js
//
//  Bunu her git push'tan ÖNCE çalıştırma alışkanlığı haline getir —
//  ya da package.json'a "prepush" script'i olarak bağlarsın (istersen
//  onu da ayrıca kurarız).
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const VERSION_JS_PATH = path.join(__dirname, 'version.js');
const README_PATH = path.join(__dirname, 'README.md');

function extractAppVersion(versionJsText) {
  const m = versionJsText.match(/app\s*:\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('version.js içinde "app:" alanı bulunamadı.');
  return m[1];
}

function updateReadme(filePath, newVersion) {
  let content = fs.readFileSync(filePath, 'utf8');
  const versionLineRe = /^\*\*v[^\*]+\*\*(.*)$/m;
  if (!versionLineRe.test(content)) {
    throw new Error('README.md içinde "**vX.X.X** ..." formatında bir satır bulunamadı.');
  }
  content = content.replace(versionLineRe, (full, rest) => `**v${newVersion}**${rest}`);
  fs.writeFileSync(filePath, content, 'utf8');
}

try {
  if (!fs.existsSync(VERSION_JS_PATH)) {
    throw new Error(`version.js bulunamadı: ${VERSION_JS_PATH}\nBu scripti web repo kökünde çalıştırdığından emin ol.`);
  }
  if (!fs.existsSync(README_PATH)) {
    throw new Error(`README.md bulunamadı: ${README_PATH}`);
  }

  const versionJsText = fs.readFileSync(VERSION_JS_PATH, 'utf8');
  const appVersion = extractAppVersion(versionJsText);
  updateReadme(README_PATH, appVersion);

  console.log('✓ README.md güncellendi → v' + appVersion);
} catch (err) {
  console.error('✗ HATA:', err.message);
  process.exit(1);
}