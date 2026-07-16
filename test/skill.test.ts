import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SkillRegistry } from '../src/core/skill.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');

test('load: charge les .skill.md reels du repertoire skills/', () => {
  const reg = new SkillRegistry(SKILLS_DIR);
  const n = reg.load();
  assert.ok(n >= 30, `attendu >=30 skills, obtenu ${n}`);
  assert.equal(reg.list().length, n);
});

test('parse: chaque skill a un nom et une description non vides', () => {
  const reg = new SkillRegistry(SKILLS_DIR);
  reg.load();
  for (const s of reg.list()) {
    assert.ok(s.name && s.name !== 'unnamed', `skill sans nom: ${JSON.stringify(s).slice(0, 80)}`);
    assert.ok(s.body.length > 0, `skill ${s.name} sans corps`);
  }
});

test('get: recupere un skill connu par nom', () => {
  const reg = new SkillRegistry(SKILLS_DIR);
  reg.load();
  const s = reg.get('reasoning-strategy');
  assert.ok(s, 'reasoning-strategy introuvable');
  assert.match(s!.description, /strategie/i);
  assert.ok(s!.tags && s!.tags.length > 0);
});

test('byTags: filtre par tag', () => {
  const reg = new SkillRegistry(SKILLS_DIR);
  reg.load();
  const verify = reg.byTags(['verify']);
  assert.ok(verify.length >= 1, 'aucun skill avec tag verify');
  assert.ok(verify.every(s => s.tags?.includes('verify')));
});

test('byText: recherche plein texte sur nom/description', () => {
  const reg = new SkillRegistry(SKILLS_DIR);
  reg.load();
  const hits = reg.byText('raison');
  assert.ok(hits.length >= 1);
});

test('toPrompt: assemble une section de prompt avec les corps', () => {
  const reg = new SkillRegistry(SKILLS_DIR);
  reg.load();
  const s = reg.get('reasoning-strategy')!;
  const prompt = reg.toPrompt([s]);
  assert.match(prompt, /## SKILL: reasoning-strategy/);
  assert.ok(prompt.length > s.description.length);
});

test('load: repertoire inexistant -> 0 sans crash', () => {
  const reg = new SkillRegistry(join(__dirname, 'nexiste-pas-xyz'));
  assert.equal(reg.load(), 0);
});
