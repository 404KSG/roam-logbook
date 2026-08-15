/** Tiny DOM helpers so the view code stays readable. */

export function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

export function button(className, text, onClick, { title } = {}) {
    const node = el('button', className, text);
    node.type = 'button';
    if (title) {
        node.title = title;
        node.setAttribute('aria-label', title);
    }
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
