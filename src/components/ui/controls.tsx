import { useLayoutEffect, useRef } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { SpeakerIcon } from './icons';

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  fullWidth?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={classes(
        'ui-button',
        `ui-button-${variant}`,
        `ui-button-${size}`,
        fullWidth && 'ui-button-full',
        className,
      )}
    />
  );
}
type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: 'sm' | 'md';
};

export function IconButton({
  label,
  size = 'md',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      className={classes('ui-icon-button', `ui-icon-button-${size}`, className)}
    />
  );
}

type SpeakerButtonProps = Omit<IconButtonProps, 'children'> & {
  loading?: boolean;
};

export function SpeakerButton({
  loading = false,
  disabled,
  ...props
}: SpeakerButtonProps) {
  return (
    <IconButton
      {...props}
      disabled={disabled || loading}
      aria-busy={loading}
      className={classes(loading && 'is-loading', props.className)}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : <SpeakerIcon />}
    </IconButton>
  );
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  autoSize?: boolean;
  measureValue?: string;
  shellClassName?: string;
};

// Ширина меряется настоящим canvas.measureText по реально отрендеренному
// шрифту инпута, а не приблизительным "ch" — шрифт статьи (Iowan Old Style и
// т.п.) пропорциональный, не моноширинный, и ширина конкретных букв (особенно
// заглавных/с диакритикой в греческом) заметно отличается от ширины "0", на
// которой основана "ch". На практике это реально резало текст в рамке для
// таких слов, как «όπου»/«διάσημο» — оценка по ch давала бокс уже, чем
// реальный отрендеренный текст.
const AUTO_SIZE_HORIZONTAL_PADDING_PX = 11 * 2 + 1 * 2 + 4; // .ui-text-input padding + border + запас под курсор
const AUTO_SIZE_MIN_CHARS = '000'; // нижний предел ширины — примерно 3 символа текущего шрифта

let measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return 0;
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function TextInput({
  autoSize = false,
  measureValue,
  shellClassName,
  className,
  value,
  ...props
}: TextInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLSpanElement>(null);
  const measured = measureValue || String(value ?? '');

  useLayoutEffect(() => {
    if (!autoSize) return;
    const input = inputRef.current;
    const shell = shellRef.current;
    if (!input || !shell) return;
    // Реальный вычисленный шрифт инпута — учитывает font-family/-size/-weight,
    // унаследованные от .training-cloze (24px на широких экранах, 22px в
    // узкой media query) без необходимости дублировать эти значения здесь.
    const font = window.getComputedStyle(input).font;
    const floor = measureTextWidth(AUTO_SIZE_MIN_CHARS, font);
    const content = measureTextWidth(measured || ' ', font);
    shell.style.width = `${Math.max(floor, content) + AUTO_SIZE_HORIZONTAL_PADDING_PX}px`;
  }, [autoSize, measured]);

  return (
    <span
      ref={shellRef}
      className={classes('ui-text-input-shell', shellClassName)}
    >
      <input
        {...props}
        ref={inputRef}
        value={value}
        className={classes('ui-text-input', className)}
      />
    </span>
  );
}

type FeedbackPanelProps = {
  tone: 'success' | 'warning' | 'error' | 'neutral';
  title: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function FeedbackPanel({ tone, title, children, className }: FeedbackPanelProps) {
  return (
    <section className={classes('ui-feedback-panel', `ui-feedback-${tone}`, className)} role="status">
      <h3 className="ui-feedback-title">{title}</h3>
      {children && <div className="ui-feedback-body">{children}</div>}
    </section>
  );
}
