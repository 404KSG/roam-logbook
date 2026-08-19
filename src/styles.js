/**
 * Styles for the topbar widget and dashboard.
 *
 * Layout and spacing only — colour comes from Blueprint's own variables so the
 * extension follows Roam's light/dark theme without a second set of rules.
 */

import { TOKENS } from './styles/tokens.js';
import { TOPBAR } from './styles/topbar.js';
import { SURFACE } from './styles/surface.js';
import { DASHBOARD } from './styles/dashboard.js';
import { ACTIVITY } from './styles/activity.js';
import { TASKS } from './styles/tasks.js';
import { RESPONSIVE } from './styles/responsive.js';

export const STYLE_ID = 'roam-logbook-styles';

export const STYLES = [TOKENS, TOPBAR, SURFACE, DASHBOARD, ACTIVITY, TASKS, RESPONSIVE].join('\n');
