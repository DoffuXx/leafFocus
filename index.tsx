import { render } from 'ink';
import Root from './src/ui/Root.js';
import { config } from './src/config.js';
import { cli } from './src/cli.js';

render(<Root resume={cli.resume} />, { alternateScreen: config.fullscreen });
