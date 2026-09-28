import { render } from 'ink';
import Root from './src/ui/Root.js';
import { config, globalConfigPath, initConfigFile } from './src/config.js';
import { cli } from './src/cli.js';

if (cli.init) {
  const path = globalConfigPath(process.env);
  console.log(initConfigFile(path) ? `Created ${path} — edit it to customize leaffocus.` : `${path} already exists; left unchanged.`);
  process.exit(0);
}

render(<Root resume={cli.resume} />, { alternateScreen: config.fullscreen });
