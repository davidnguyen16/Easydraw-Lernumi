// Vite alias target for `next/link` in the Lernumi build: a plain anchor whose
// click becomes an in-app screen change.
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useLernumiApp } from '../app-store';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  children?: ReactNode;
};

export default function Link({ href, onClick, children, ...rest }: Props) {
  const navigate = useLernumiApp((s) => s.navigate);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
