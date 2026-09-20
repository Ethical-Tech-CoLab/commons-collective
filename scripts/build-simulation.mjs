import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function buildSimulation(root, header) {
  const moduleFiles = (await readdir(new URL('simulation/', root))).filter(name => name.endsWith('.mjs')).sort();
  const modules = [];
  for (const name of moduleFiles) modules.push([name, await readFile(new URL(`simulation/${name}`, root), 'utf8')]);
  const app = await readFile(new URL('site/simulation.mjs', root), 'utf8');
  const css = await readFile(new URL('site/simulation.css', root), 'utf8');
  const startupApp = await readFile(new URL('site/startup-ui.mjs', root), 'utf8');
  const startupCss = await readFile(new URL('site/startup.css', root), 'utf8');
  const startupHtml = await readFile(new URL('site/startup.html', root), 'utf8');
  const moneyView = await readFile(new URL('site/money-view.mjs', root), 'utf8');
  // Finance projections are a separate method; adding them must not invalidate operating-run replay.
  const operatingModules = modules.filter(([name]) => !name.startsWith('startup') && !name.startsWith('money'));
  const engineId = createHash('sha256').update(operatingModules.map(([name, text]) => `${name}\n${text.replace(/\r\n/g, '\n')}`).join('\n')).digest('hex').slice(0, 16);
  const revision = createHash('sha256').update(`${modules.map(([, text]) => text).join('\n')}\n${app}\n${css}\n${startupApp}\n${startupCss}\n${startupHtml}\n${moneyView}`).digest('hex').slice(0, 12);
  const versionModules = text => text.replace(/(['"])(\.\/[a-z-]+\.mjs)\1/g, (_match, quote, name) => `${quote}${name}?v=${revision}${quote}`);
  const destination = new URL('dist/simulation/', root);
  await mkdir(destination, { recursive: true });
  for (const [name, text] of modules) {
    const content = name === 'config.mjs' ? text.replace("BUILD_ID = 'development'", `BUILD_ID = '${engineId}'`) : text;
    await writeFile(new URL(name, destination), versionModules(content));
  }
  await writeFile(new URL('app.mjs', destination), versionModules(app));
  await writeFile(new URL('simulation.css', destination), css);
  await writeFile(new URL('startup-ui.mjs', destination), versionModules(startupApp));
  await writeFile(new URL('money-view.mjs', destination), versionModules(moneyView));
  await writeFile(new URL('startup.css', destination), startupCss);
  const page = (await readFile(new URL('site/simulation.html', root), 'utf8'))
    .replace('{{HEADER}}', header.replaceAll('href="./', 'href="../').replaceAll('src="./', 'src="../'))
    .replace('{{STARTUP}}', startupHtml)
    .replace('href="./startup.css"', `href="./startup.css?v=${revision}"`)
    .replace('href="./simulation.css"', `href="./simulation.css?v=${revision}"`)
    .replace('src="./app.mjs"', `src="./app.mjs?v=${revision}"`);
  if (/\{\{[A-Z_]+\}\}/.test(page)) throw new Error('Unresolved simulator template placeholder');
  await writeFile(new URL('index.html', destination), page);
  return { engineId, revision };
}
