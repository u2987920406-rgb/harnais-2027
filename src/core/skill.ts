/**
 * SkillRegistry — Systeme de skills a la Hermes/Atlas.
 *
 * Un Skill = connaissance instructionnelle chargeable par un agent.
 * Stocke dans des fichiers .skill.md (frontmatter YAML + corps markdown).
 * Charges automatiquement au demarrage. Match par tag ou texte.
 *
 * Inspire d'Atlas core/skill.ts, adapte au harnais.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Skill {
  name: string;
  description: string;
  body: string;
  tags?: string[];
}

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private skillsDir: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir ?? join(__dirname, '..', '..', 'skills');
  }

  /**
   * Charge tous les .skill.md du repertoire.
   */
  load(): number {
    if (!existsSync(this.skillsDir)) return 0;
    const files = readdirSync(this.skillsDir).filter(f => f.endsWith('.skill.md'));
    let loaded = 0;
    for (const file of files) {
      try {
        const content = readFileSync(join(this.skillsDir, file), 'utf-8');
        const skill = this.parseSkillMd(content);
        if (skill) {
          this.skills.set(skill.name, skill);
          loaded++;
        }
      } catch (err) {
        console.warn(`[Skills] Erreur chargement ${file}:`, err);
      }
    }
    console.log(`[Skills] ${loaded} skill(s) charge(s) depuis ${this.skillsDir}`);
    return loaded;
  }

  /**
   * Parse un fichier .skill.md: frontmatter YAML + corps markdown.
   */
  private parseSkillMd(content: string): Skill | null {
    // Normalise les retours chariot Windows \r\n -> \n
    const normalized = content.replace(/\r\n/g, '\n');
    const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = match[1];
    const body = match[2].trim();

    // Parse YAML simple (pas de dependance)
    const name = this.extractYaml(frontmatter, 'name') ?? 'unnamed';
    const description = this.extractYaml(frontmatter, 'description') ?? '';
    const tagsStr = this.extractYaml(frontmatter, 'tags');
    const tags = tagsStr
      ? tagsStr.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean)
      : undefined;

    return { name, description, body, tags };
  }

  private extractYaml(yaml: string, key: string): string | undefined {
    const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return match?.[1]?.trim().replace(/^["']|["']$/g, '');
  }

  /**
   * Retourne les skills qui matchent au moins un des tags donnes.
   */
  byTags(tags: string[]): Skill[] {
    return Array.from(this.skills.values()).filter(s =>
      s.tags?.some(t => tags.includes(t))
    );
  }

  /**
   * Retourne les skills dont le nom ou la description contient le texte.
   */
  byText(text: string): Skill[] {
    const q = text.toLowerCase();
    return Array.from(this.skills.values()).filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    );
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Construit une section de prompt avec les skills donnes.
   */
  toPrompt(skills: Skill[]): string {
    if (skills.length === 0) return '';
    return skills.map(s => `## SKILL: ${s.name}\n${s.body}`).join('\n\n');
  }
}