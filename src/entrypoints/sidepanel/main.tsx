import { render } from 'preact';
import '@/styles/design-tokens.css';
import { SidePanelApp } from './SidePanelApp';

render(<SidePanelApp />, document.getElementById('app')!);
