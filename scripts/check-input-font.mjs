/**
 * Build-time check: fail if any <input> or <textarea> JSX element has
 * text-xs or text-sm in its className. iOS Safari zooms on inputs with
 * font-size < 16px — the global CSS rule enforces 16px, so these classes
 * are misleading dead weight at best and a zoom trap if the rule is removed.
 */
import { readFileSync } from 'fs';
import { globSync } from 'glob';

const clientDir = new URL('../client', import.meta.url).pathname;
const files = globSync('src/**/*.{tsx,jsx}', { cwd: clientDir });
let errors = 0;

for (const file of files) {
  const content = readFileSync(`${clientDir}/${file}`, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/<(input|textarea)[\s>\/]/.test(line)) continue;

    // Collect lines of this JSX element until self-close (/>) or open-close (>)
    // Stop when we've seen the closing of the tag (not its children)
    let block = '';
    let depth = 0;
    for (let j = i; j < Math.min(i + 20, lines.length); j++) {
      block += lines[j] + '\n';
      // Check if the tag has closed (self-closing />)
      // Use a simple heuristic: count unbalanced braces; when we see /> outside {}, we're done
      const noJsxExprs = lines[j].replace(/\{[^{}]*\}/g, '{}'); // collapse simple {expr}
      if (/\/>/.test(noJsxExprs) || (j > i && /^\s*>/.test(lines[j]))) break;
    }

    if (/\btext-(xs|sm)\b/.test(block)) {
      const match = line.match(/<(input|textarea)/);
      console.error(`client/${file}:${i + 1}: <${match[1]}> has text-xs/text-sm — iOS zooms on inputs with font-size < 16px`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} violation(s) found. Remove text-xs/text-sm from <input>/<textarea> elements.`);
  process.exit(1);
}
console.log('✓ No small-font inputs found');
