import type { ButtonHTMLAttributes } from 'react';
import styles from './ActionButton.module.css';

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};
export function ActionButton({
  variant = 'primary',
  type = 'button',
  className = '',
  ...props
}: ActionButtonProps) {
  return (
    <button type={type} className={`${styles.button} ${styles[variant]} ${className}`} {...props} />
  );
}
