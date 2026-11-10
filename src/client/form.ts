/** Form controls for the inspector and the panels, on the kit's ``.field`` / ``.seg`` / ``.switch`` styles. Numeric fields validate on commit (change or
 *  Enter), clamp to their range and say so, and never fire a recompute for text that is not a number. */
import { h, nextId } from './kit.js';

export interface NumberField { el: HTMLElement; input: HTMLInputElement; set(value: number): void }

export function numberField(options: {
  label: string; value: number; min?: number; max?: number; step?: number; unit?: string; hint?: string; integer?: boolean; wide?: boolean;
  onCommit: (value: number) => void;
}): NumberField {
  const id = nextId('num');
  const input = h('input', { type: 'number', id, value: String(options.value), step: String(options.step ?? (options.integer ? 1 : 'any')) });
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  const message = h('span', { class: 'error', attrs: { id: `${id}-msg`, role: 'alert' } });
  message.hidden = true;
  const hint = options.hint ? h('span', { class: 'hint', text: options.hint, attrs: { id: `${id}-hint` } }) : null;
  let last = options.value;
  const show = (text: string | null): void => { message.hidden = !text; message.textContent = text ?? ''; input.setAttribute('aria-invalid', String(!!text)); };
  const commit = (): void => {
    let v = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(v)) { show('Enter a number.'); input.value = String(last); return; }
    if (options.integer && !Number.isInteger(v)) v = Math.round(v);
    const lo = options.min ?? -Infinity, hi = options.max ?? Infinity;
    if (v < lo || v > hi) { const clamped = Math.min(hi, Math.max(lo, v)); show(`Limited to ${clamped} (allowed ${Number.isFinite(lo) ? lo : '−∞'} to ${Number.isFinite(hi) ? hi : '∞'}).`); v = clamped; } else show(null);
    input.value = String(v);
    if (v !== last) { last = v; options.onCommit(v); }
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
  const label = h('label', { attrs: { for: id } }, options.label, options.unit ? h('span', { class: 'unit', text: ` ${options.unit}` }) : null);
  const el = h('div', { class: `field${options.wide ? ' wide' : ''}` }, label, input, hint, message);
  return { el, input, set(value) { last = value; if (document.activeElement !== input) input.value = String(value); show(null); } };
}

export interface SelectField { el: HTMLElement; select: HTMLSelectElement; set(value: string): void }

export function selectField(label: string, options: Array<[string, string]>, value: string, onChange: (value: string) => void, hint?: string): SelectField {
  const id = nextId('sel');
  const select = h('select', { id, on: { change: () => onChange(select.value) } }, options.map(([v, text]) => h('option', { value: v, text })));
  select.value = value;
  const el = h('div', { class: 'field' }, h('label', { attrs: { for: id }, text: label }), select, hint ? h('span', { class: 'hint', text: hint }) : null);
  return { el, select, set(v) { select.value = v; } };
}

export interface Switch { el: HTMLElement; input: HTMLInputElement; set(checked: boolean): void }

export function switchField(label: string, checked: boolean, onChange: (checked: boolean) => void): Switch {
  const input = h('input', { type: 'checkbox', checked, on: { change: () => onChange(input.checked) } });
  return { el: h('label', { class: 'switch' }, input, h('span', { text: label })), input, set(v) { input.checked = v; } };
}

export interface Segmented<T extends string> { el: HTMLElement; set(value: T): void }

export function segmented<T extends string>(label: string, options: Array<[T, string]>, value: T, onChange: (value: T) => void): Segmented<T> {
  const buttons = options.map(([v, text]) => h('button', { type: 'button', text, attrs: { 'aria-pressed': String(v === value) }, on: { click: () => { set(v); onChange(v); } } }));
  const set = (next: T): void => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i]?.[0] === next)));
  return { el: h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': label } }, buttons), set };
}

export function sliderField(options: { label: string; value: number; min: number; max: number; step: number; format?: (v: number) => string; onInput: (v: number) => void }): { el: HTMLElement; set(v: number): void } {
  const id = nextId('rng');
  const fmt = options.format ?? ((v: number) => String(v));
  const out = h('output', { class: 'muted', text: fmt(options.value), attrs: { for: id } });
  const input = h('input', { type: 'range', id, min: String(options.min), max: String(options.max), step: String(options.step), value: String(options.value),
    on: { input: () => { out.textContent = fmt(Number(input.value)); options.onInput(Number(input.value)); } } });
  return { el: h('div', { class: 'field' }, h('label', { attrs: { for: id }, text: options.label }), h('div', { class: 'row nowrap' }, h('div', { class: 'grow' }, input), out)),
    set(v) { input.value = String(v); out.textContent = fmt(v); } };
}

export const metricCard = (label: string, value: string, tone: '' | 'good' | 'warn' | 'bad' = '', hint?: string): HTMLElement =>
  h('div', { class: `metric ${tone}`, attrs: hint ? { title: hint } : {} }, h('small', { text: label }), h('strong', { text: value }));

export const note = (text: string): HTMLElement => h('p', { class: 'note', text });
export const heading = (text: string): HTMLElement => h('h3', { class: 'panel-heading', text });
export const pre = (text = ''): HTMLPreElement => h('pre', { class: 'result', text });
