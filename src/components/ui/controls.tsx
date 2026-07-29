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

export function TextInput({
  autoSize = false,
  measureValue,
  shellClassName,
  className,
  value,
  ...props
}: TextInputProps) {
  return (
    <span className={classes('ui-text-input-shell', autoSize && 'is-auto-size', shellClassName)}>
      {autoSize && (
        <span className={classes('ui-text-input', 'ui-text-input-mirror', className)} aria-hidden="true">
          {measureValue || String(value ?? '') || '\u00A0'}
        </span>
      )}
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
