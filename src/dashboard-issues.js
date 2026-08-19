import { el } from './dom.js';

export const issueRow = issue => ({
    title: issue.title || issue.parentUid || issue.affectedUid || 'Unresolved graph data',
    rawClock: issue.rawClock || (issue.source ? `(graph ${issue.source} read)` : '(hierarchy query)'),
    issues: [issue],
});

export const dataIssuesSection = issues => {
    const details = el('details', 'rlb-data-issues rlb-dashboard__inline-status');
    const issueGroups = issues.map(entry => (entry.issues || [entry.issue]).filter(Boolean));
    const graphReadCount = issueGroups.filter(group =>
        group.some(issue => issue.kind === 'graph-read')
    ).length;
    const timingCount = issueGroups.length - graphReadCount;
    const summaryParts = [];
    if (timingCount > 0) {
        summaryParts.push(
            `${timingCount} timing record${timingCount === 1 ? '' : 's'} ${
                timingCount === 1 ? 'needs' : 'need'
            } review`
        );
    }
    if (graphReadCount > 0) {
        summaryParts.push(
            `${graphReadCount} graph read issue${graphReadCount === 1 ? '' : 's'} ${
                graphReadCount === 1 ? 'needs' : 'need'
            } review`
        );
    }
    details.appendChild(el('summary', 'rlb-data-issues__summary', summaryParts.join(' · ')));
    const list = el('div', 'rlb-data-issues__list');
    for (const entry of issues) {
        const entryIssues = (entry.issues || [entry.issue]).filter(Boolean);
        const issueText = entryIssues
            .map(issue => `${issue.source ? `${issue.source}: ` : ''}${issue.message}`)
            .join(' ');
        const raw = entry.rawClock || '(CLOCK text unavailable)';
        const label = `Task: ${entry.title} · CLOCK: ${raw} · Issue: ${issueText}`;
        const item = el('div', 'rlb-data-issues__item', label);
        item.title = label;
        item.setAttribute('aria-label', label);
        list.appendChild(item);
    }
    details.appendChild(list);
    return details;
};
