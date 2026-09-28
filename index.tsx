import { render } from 'ink';
import Root from './src/ui/Root.js';

const resume = process.argv.includes('--resume') || process.argv.includes('-r');

render(<Root resume={resume} />);
