/** Tiny DOM helpers so the view code stays readable. */

export function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

export function button(className, text, onClick, { title, ariaLabel } = {}) {
    const node = el('button', className, text);
    node.type = 'button';
    // Keep the visual tooltip: `title` also supplies the accessible name for an
    // icon-only button, so adding an identical aria-label would only make
    // assistive tech announce the same string twice.
    if (title) node.title = title;
    if (ariaLabel && ariaLabel !== title) node.setAttribute('aria-label', ariaLabel);
    node.addEventListener('click', onClick);
    return node;
}

export function injectStyles(id, css) {
    const matches = [...document.querySelectorAll('style')].filter(style => style.id === id);
    const style = matches.shift() ?? el('style');
    if (!style.isConnected) {
        style.id = id;
        document.head.appendChild(style);
    }
    style.textContent = css;
    for (const duplicate of matches) duplicate.remove();
}

export function removeStyles(id) {
    for (const style of document.querySelectorAll('style')) {
        if (style.id === id) style.remove();
    }
}
