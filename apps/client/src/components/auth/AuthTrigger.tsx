import { cloneElement, type MouseEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';

interface AuthTriggerProps {
  mode: 'sign-in' | 'sign-up';
  children: ReactElement<{ onClick?: (event: MouseEvent<HTMLElement>) => void }>;
}

/** Opens SketchFlow's custom auth flow while preserving the caller's button styling. */
export function AuthTrigger({ mode, children }: AuthTriggerProps) {
  const navigate = useNavigate();

  return cloneElement(children, {
    onClick: (event: MouseEvent<HTMLElement>) => {
      children.props.onClick?.(event);
      if (!event.defaultPrevented) navigate(`/auth/${mode}`);
    },
  });
}
