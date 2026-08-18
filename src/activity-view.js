import { el } from './dom.js';
import { refreshActivityBucket, refreshActivityBuckets } from './activity.js';

const BAR_MAX_HEIGHT = 96;

const activityDateText = bucket =>
    bucket.monthLabel ? `${bucket.monthLabel} ${bucket.dateLabel}` : bucket.dateLabel;

const barHeight = (bucket, maxMinutes) => {
    if (bucket.minutes <= 0 || maxMinutes <= 0) return 2;
    return Math.max(4, Math.round((bucket.minutes / maxMinutes) * BAR_MAX_HEIGHT));
};

const activityRangeLabel = rangeId => ({
    today: 'Today',
    week: 'Last 7 days',
    month: 'Last 30 days',
    all: 'All time',
}[rangeId] || 'selected range');

const updateBucketNode = (node, bucket, maxMinutes) => {
    node.dataset.activityDuration = bucket.durationLabel;
    node.dataset.activityMinutes = String(bucket.minutes);
    node.dataset.activitySessions = String(bucket.sessionCount);
    node.title = bucket.ariaLabel;
    node.setAttribute('aria-label', bucket.ariaLabel);
    node.classList.toggle('rlb-activity__bucket--empty', bucket.minutes <= 0);
    node.querySelector('.rlb-activity__duration').textContent = bucket.durationLabel;
    node.querySelector('.rlb-activity__bar').style.height = `${barHeight(bucket, maxMinutes)}px`;
};

/** Render one compact, accessible Activity panel. */
export function renderActivity(activity) {
    if (!activity?.buckets?.length) return null;

    const titleId = 'roam-logbook-activity-title';
    const section = el('section', 'rlb-dashboard-section rlb-dashboard-panel rlb-activity');
    section.setAttribute('aria-labelledby', titleId);
    section.dataset.activityPanel = 'true';

    const heading = el('div', 'rlb-panel__header');
    heading.appendChild(el('h3', 'rlb-section__title', 'Activity'));
    heading.querySelector('.rlb-section__title').id = titleId;
    if (activity.durationFormat === 'hours') {
        heading.appendChild(el('span', 'rlb-activity__unit', 'HOURS'));
    }
    section.appendChild(heading);

    const chart = el('div', 'rlb-activity__chart');
    chart.setAttribute('role', 'group');
    chart.setAttribute('aria-label', `Activity for ${activityRangeLabel(activity.rangeId)}`);
    chart.dataset.activityRange = activity.rangeId;
    chart.dataset.activityUnit = activity.unit;
    chart.dataset.activityDensity = activity.density.id;
    chart.dataset.activityBucketCount = String(activity.buckets.length);

    const plot = el('div', 'rlb-activity__plot');
    plot.style.setProperty('--rlb-activity-columns', String(activity.buckets.length));
    plot.style.setProperty('--rlb-activity-bar-width', `${activity.density.barWidthPx}px`);
    plot.dataset.activityDensity = activity.density.id;
    const maxMinutes = activity.maxMinutes;
    for (const bucket of activity.buckets) {
        const column = el('div', 'rlb-activity__bucket');
        column.dataset.activityBucket = bucket.id;
        column.dataset.activityDuration = bucket.durationLabel;
        column.dataset.activityMinutes = String(bucket.minutes);
        column.dataset.activitySessions = String(bucket.sessionCount);
        column.dataset.activityUnit = bucket.unit;
        column.tabIndex = 0;
        column.setAttribute('role', 'img');
        column.title = bucket.ariaLabel;
        column.setAttribute('aria-label', bucket.ariaLabel);

        column.appendChild(el('span', 'rlb-activity__duration', bucket.durationLabel));
        const barWrap = el('span', 'rlb-activity__bar-wrap');
        const bar = el('span', 'rlb-activity__bar');
        bar.setAttribute('aria-hidden', 'true');
        bar.style.height = `${barHeight(bucket, maxMinutes)}px`;
        barWrap.appendChild(bar);
        column.appendChild(barWrap);
        column.appendChild(el('time', 'rlb-activity__date', activityDateText(bucket)));
        if (bucket.minutes <= 0) column.classList.add('rlb-activity__bucket--empty');
        plot.appendChild(column);
    }
    chart.appendChild(plot);
    section.appendChild(chart);
    return section;
}

/** Patch live totals and bar heights without replacing the chart or querying Roam. */
export function syncActivityView(section, activity, now) {
    if (!section || !activity?.buckets?.length) return;
    if (activity.unit === 'hour') {
        refreshActivityBuckets(activity, now);
    } else {
        for (const bucket of activity.buckets) refreshActivityBucket(bucket, now);
    }
    activity.totalMinutes = activity.buckets.reduce((sum, bucket) => sum + bucket.minutes, 0);
    activity.maxMinutes = activity.buckets.reduce(
        (max, bucket) => Math.max(max, bucket.minutes),
        0
    );
    const nodes = new Map(
        [...section.querySelectorAll('[data-activity-bucket]')].map(node => [
            node.dataset.activityBucket,
            node,
        ])
    );
    for (const bucket of activity.buckets) {
        const node = nodes.get(bucket.id);
        if (node) updateBucketNode(node, bucket, activity.maxMinutes);
    }
}
