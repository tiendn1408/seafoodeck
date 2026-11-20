import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

export function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(createElement('div', null, node)));
  return host;
}
export function unmountAll() {
  for (const r of roots.splice(0)) act(() => r.unmount());
  document.body.innerHTML = '';
}
export function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
export function field(host: HTMLElement, label: string) {
  const l = [...host.querySelectorAll('label')].find((x) => x.textContent?.startsWith(label));
  if (!l) throw new Error('no label ' + label);
  return l.querySelector('input') as HTMLInputElement;
}
export function button(host: HTMLElement, text: string) {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error('no button ' + text);
  return b as HTMLButtonElement;
}
export async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
    await new Promise((r) => setTimeout(r, 0));
  });
}
export async function submit(host: HTMLElement) {
  await act(async () => {
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}
