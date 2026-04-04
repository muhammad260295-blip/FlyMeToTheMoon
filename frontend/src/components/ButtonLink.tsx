import type { ReactNode } from "react";
import { Link } from "react-router";

type Props = {
  to: string;
  children: ReactNode;
};

export function ButtonLink({ to, children }: Props) {
  return (
    <Link className="button button--primary" to={to}>
      {children}
    </Link>
  );
}
