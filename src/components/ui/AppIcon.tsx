import React from 'react';
import { outlineIcons, solidIcons, type IconComponent } from './icon-registry';

// Deliberately not a client component: it holds no state, so server pages can
// render it directly. Client components that pass onClick still work, because
// importing it from a client module pulls it into that module's bundle.

type IconVariant = 'outline' | 'solid';

interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'onClick' | 'name'> {
  /** Heroicon name, e.g. "TruckIcon". Must be listed in icon-registry.ts. */
  name: string;
  variant?: IconVariant;
  size?: number;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function Icon({
  name,
  variant = 'outline',
  size = 24,
  className = '',
  onClick,
  disabled = false,
  ...props
}: IconProps) {
  const registry = variant === 'solid' ? solidIcons : outlineIcons;
  const IconComponent: IconComponent =
    registry[name] ?? outlineIcons.QuestionMarkCircleIcon;
  const unknown = !registry[name];

  if (unknown && process.env.NODE_ENV !== 'production') {
    console.warn(`[AppIcon] Unknown icon "${name}" — add it to icon-registry.ts.`);
  }

  const stateClasses = disabled
    ? 'opacity-50 cursor-not-allowed'
    : onClick
      ? 'cursor-pointer hover:opacity-80'
      : '';

  return (
    <IconComponent
      width={size}
      height={size}
      aria-hidden={props['aria-label'] ? undefined : true}
      className={`${unknown ? 'text-gray-400 ' : ''}${stateClasses} ${className}`}
      onClick={disabled ? undefined : onClick}
      {...props}
    />
  );
}

export default Icon;
