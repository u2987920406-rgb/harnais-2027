import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SkillRegistry } from '../src/core/skill.js';

test('addSkill: ecrit le .skill.md et l enregistre en memoire', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-skill-'));
  const reg = new SkillRegistry(dir);
  assert.equal(reg.list().length, 0);
  const file = reg.addSkill('test-secu', 'audit secu', 'Verifie les injections.', ['secu', 'audit']);
  assert.ok(existsSync(file));
  assert.ok(file.endsWith('test-secu.skill.md'));
  const created = reg.get('test-secu');
  assert.ok(created);
  assert.equal(created!.description, 'audit secu');
  assert.deepEqual(created!.tags, ['secu', 'audit']);
  assert.match(created!.body, /injections/);
  rmSync(dir, { recursive: true, force: true });
});

test('addSkill: nom non-alphanumerique est securise (slug)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-skill-'));
  const reg = new SkillRegistry(dir);
  const file = reg.addSkill('Mon Super Skill!', 'desc', 'corps');
  // espaces et ! deviennent des tirets, tout en minuscules
  assert.ok(file.toLowerCase().includes('mon-super-skill'));
  assert.ok(existsSync(file));
  rmSync(dir, { recursive: true, force: true });
});

test('reload: recharge depuis le disque (persistance)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-skill-'));
  const reg = new SkillRegistry(dir);
  reg.addSkill('persist-1', 'd1', 'c1', ['x']);
  // nouvelle instance pointe vers le meme dossier
  const reg2 = new SkillRegistry(dir);
  const count = reg2.reload();
  assert.equal(count, 1);
  assert.ok(reg2.get('persist-1'));
  rmSync(dir, { recursive: true, force: true });
});

test('addSkill avec mode strict: marque la skill et strictSkills() la retrouve', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-skill-'));
  const reg = new SkillRegistry(dir);
  reg.addSkill('regle-dure', 'doit toujours', 'Repond en francais.', ['lang'], 'strict');
  const created = reg.get('regle-dure');
  assert.equal(created!.mode, 'strict');
  const strict = reg.strictSkills();
  assert.equal(strict.length, 1);
  assert.equal(strict[0].name, 'regle-dure');
  // une skill soft normale ne doit pas apparaitre dans strictSkills
  reg.addSkill('souple', 'suggestion', 'Optionnel.', [], 'soft');
  assert.equal(reg.strictSkills().length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('parseSkillMd: mode strict dans le frontmatter est lu', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-skill-'));
  const reg = new SkillRegistry(dir);
  const file = reg.addSkill('x', 'd', 'c', ['t'], 'strict');
  // nouvelle instance recharge depuis le disque
  const reg2 = new SkillRegistry(dir);
  reg2.reload();
  assert.equal(reg2.get('x')!.mode, 'strict');
  rmSync(dir, { recursive: true, force: true });
});
test('addSkill puis reload: le total reste stable (pas de doublon)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-skill-'));
  const reg = new SkillRegistry(dir);
  reg.addSkill('dup', 'd', 'c');
  const c1 = reg.list().length;
  reg.reload();
  const c2 = reg.list().length;
  assert.equal(c1, 1);
  assert.equal(c2, 1);
  rmSync(dir, { recursive: true, force: true });
});
