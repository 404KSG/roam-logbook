import { button, el } from './dom.js';
import { findStaleClocks } from './stats.js';
import { staleHours } from './settings.js';
import { formatElapsed, formatStarted } from './time.js';

export function runningSection({
    running,
    now,
    isDiscarding = () => false,
    onDiscard,
    onClockOut,
    headerRow,
    statusMark,
    taskLink,
}) {
    const stale = new Set(findStaleClocks(running, now, staleHours()).map(e => e.clockUid));
    const section = el('section', 'rlb-dashboard-section rlb-running rlb-dashboard-panel');
    section.setAttribute('aria-labelledby', 'roam-logbook-running-title');
    const heading = el('div', 'rlb-panel__header');
    heading.appendChild(el('h3', 'rlb-section__title', 'Timing'));
    heading.lastElementChild.id = 'roam-logbook-running-title';
    if (stale.size > 0) {
        heading.appendChild(
            el('span', 'bp3-tag bp3-minimal bp3-intent-warning rlb-panel__notice', `${stale.size} stale`)
        );
    }
    section.appendChild(heading);

    const table = el('table', 'rlb-table');
    table.appendChild(
        headerRow([
            'Task',
            'Started',
            { label: 'Elapsed', numeric: true },
            { label: 'Actions', visuallyHidden: true },
        ])
    );
    const tbody = el('tbody');
    for (const entry of running) {
        const row = el('tr');
        const task = el('td', 'rlb-cell');
        const mark = statusMark(entry.status);
        if (mark) task.appendChild(mark);
        task.appendChild(taskLink(entry));
        if (stale.has(entry.clockUid)) {
            task.appendChild(el('span', 'bp3-tag bp3-minimal bp3-intent-warning', 'stale'));
        }

        const actions = el('td', 'rlb-table__num');
        const discarding = isDiscarding(entry.clockUid);
        const discardTitle = discarding
            ? 'Confirm discard of this CLOCK entry'
            : 'Discard this CLOCK entry (cannot be undone)';
        const discard = button(
            `bp3-button bp3-minimal bp3-small bp3-icon-trash${discarding ? ' bp3-intent-danger' : ''}`,
            '',
            event => {
                event.stopPropagation();
                onDiscard(entry);
            },
            { title: discardTitle }
        );
        discard.dataset.action = 'discard';
        actions.append(
            button(
                'bp3-button bp3-minimal bp3-small bp3-icon-log-out rlb-running__checkout',
                '',
                event => {
                    event.stopPropagation();
                    void onClockOut(entry);
                },
                { title: 'Check Out' }
            ),
            discard
        );
        actions.firstElementChild.dataset.action = 'clock-out';

        const started = formatStarted(entry.start, now);
        const startedTime = el('time', 'rlb-started', '');
        startedTime.title = started.raw;
        startedTime.setAttribute('aria-label', started.raw);
        if (started.datetime) startedTime.dateTime = started.datetime;
        if (started.valid) {
            startedTime.append(
                el('span', 'rlb-started__date', started.dateLabel),
                el('span', 'rlb-started__time', started.timeLabel)
            );
        } else {
            startedTime.textContent = started.raw;
        }

        const startedCell = el('td', 'rlb-muted rlb-started-cell');
        startedCell.appendChild(startedTime);
        const elapsed = el(
            'td',
            'rlb-table__num rlb-running-elapsed',
            formatElapsed(now.getTime() - entry.start.getTime())
        );
        elapsed.dataset.runningElapsed = 'true';
        elapsed.dataset.clockUid = entry.clockUid;
        elapsed.dataset.startMs = String(entry.start.getTime());
        row.append(task, startedCell, elapsed, actions);
        tbody.appendChild(row);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
}
