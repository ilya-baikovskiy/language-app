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

// \u0428\u0438\u0440\u0438\u043D\u0430 \u0432 \u0441\u0438\u043C\u0432\u043E\u043B\u0430\u0445 (ch), \u0430 \u043D\u0435 CSS-grid mirror-\u0442\u0440\u044E\u043A (span \u043F\u043E\u0432\u0435\u0440\u0445 span \u043E\u0434\u043D\u043E\u0439
// grid-area) \u2014 \u043D\u0430 \u0434\u0435\u043B\u0435 \u0432 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \u043E\u043D \u043D\u0435 \u0441\u0436\u0438\u043C\u0430\u043B\u0441\u044F \u0434\u043E \u043A\u043E\u043D\u0442\u0435\u043D\u0442\u0430 \u0434\u043B\u044F
// \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0445 \u0441\u043B\u043E\u0432, \u0438\u043D\u043F\u0443\u0442 \u0440\u0430\u0441\u043F\u043E\u043B\u0437\u0430\u043B\u0441\u044F \u043F\u043E\u0447\u0442\u0438 \u043D\u0430 \u0432\u0441\u044E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443. Ch-\u0448\u0438\u0440\u0438\u043D\u0430, \u043E\u0442\u043C\u0435\u0440\u0435\u043D\u043D\u0430\u044F
// \u043E\u0442 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E, \u0432\u0435\u0434\u0451\u0442 \u0441\u0435\u0431\u044F \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0443\u0435\u043C\u043E \u0432 \u043B\u044E\u0431\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435.
const AUTO_SIZE_MIN_CH = 3;
const AUTO_SIZE_PADDING_CH = 1.5;

export function TextInput({
  autoSize = false,
  measureValue,
  shellClassName,
  className,
  value,
  ...props
}: TextInputProps) {
  const measured = measureValue || String(value ?? '');
  const widthCh = autoSize
    ? Math.max(AUTO_SIZE_MIN_CH, Array.from(measured).length + AUTO_SIZE_PADDING_CH)
    : undefined;
  return (
    <span
      className={classes('ui-text-input-shell', shellClassName)}
      style={widthCh ? { width: `${widthCh}ch` } : undefined}
    >
      <input
        {...props}
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
