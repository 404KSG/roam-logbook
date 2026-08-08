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
    if (document.getElementById(id)) return;
    const style = el('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
}

export function removeStyles(id) {
    document.getElementById(id)?.remove();
}
