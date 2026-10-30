import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = process.cwd();
const names = fs.readdirSync(root);
const landingFiles = names.filter((n) => /^landing-data(?:\.[a-z]{2})?\.json$/.test(n)).sort();
const resumeFiles = names.filter((n) => /^resume-data(?:\.[a-z]{2})?\.json$/.test(n)).sort();

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file}: invalid JSON — ${error.message}`);
  }
}
function nonEmpty(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
}

for (const file of ['landing-data.json', 'landing-data.en.json', 'landing-data.zh.json']) {
  assert.ok(landingFiles.includes(file), `Missing file: ${file}`);
}
for (const file of ['resume-data.json', 'resume-data.en.json', 'resume-data.zh.json']) {
  assert.ok(resumeFiles.includes(file), `Missing file: ${file}`);
}

for (const file of landingFiles) {
  const data = readJson(file);
  nonEmpty(data.title, `${file}: title`);
  nonEmpty(data.hero?.name, `${file}: hero.name`);
  nonEmpty(data.hero?.desc, `${file}: hero.desc`);
  for (const key of ['nav']) assert.ok(Array.isArray(data[key]) && data[key].length, `${file}: ${key} must be a non-empty array`);
  for (const key of ['cards', 'roles']) assert.ok(Array.isArray(data.about?.[key]), `${file}: about.${key} must be an array`);
  assert.ok(Array.isArray(data.skills?.pillars), `${file}: skills.pillars must be an array`);
  assert.ok(Array.isArray(data.results), `${file}: results must be an array`);
  console.log(`OK ${file}`);
}

for (const file of resumeFiles) {
  const data = readJson(file);
  nonEmpty(data.person?.name, `${file}: person.name`);
  assert.ok(data.versions && typeof data.versions === 'object', `${file}: versions must be an object`);
  for (const variant of ['kam', 'pm', 'ai']) {
    const item = data.versions[variant];
    assert.ok(item && typeof item === 'object', `${file}: missing versions.${variant}`);
    nonEmpty(item.position, `${file}: versions.${variant}.position`);
    nonEmpty(item.headline, `${file}: versions.${variant}.headline`);
  }
  for (const key of ['items', 'jobs', 'early', 'tools', 'edu', 'dev', 'extra']) {
    assert.ok(Array.isArray(data[key]), `${file}: ${key} must be an array`);
  }
  console.log(`OK ${file}`);
}

const siteConfig = readJson('site-config.json');
assert.ok(Array.isArray(siteConfig.languages) && siteConfig.languages.length, 'site-config.json: languages must be a non-empty array');
console.log(`Validated ${landingFiles.length + resumeFiles.length + 1} JSON files.`);
