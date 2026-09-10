'use client';

import React, { memo, useMemo } from 'react';
import AppIcon from './AppIcon';
import AppImage from './AppImage';

interface AppLogoProps {
  src?: string; // Image source (optional)
  iconName?: string; // Icon name when no image
  size?: number; // Size for icon/image
  className?: string; // Additional classes
  heightClassName?: string; // Responsive height classes; replaces the fixed `size` height
  onClick?: () => void; // Click handler
}

const AppLogo = memo(function AppLogo({
  src = '/assets/images/app_logo.png',
  iconName = 'SparklesIcon',
  size = 64,
  className = '',
  heightClassName,
  onClick,
}: AppLogoProps) {
  // Memoize className calculation
  const containerClassName = useMemo(() => {
    const classes = ['flex items-center'];
    if (onClick) classes.push('cursor-pointer hover:opacity-80 transition-opacity');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [onClick, className]);

  return (
    <div className={containerClassName} onClick={onClick}>
      {/* Show image if src provided, otherwise show icon */}
      {src ? (
        <AppImage
          src={src}
          alt="My Lucky Dates"
          // Next sizes the served file from these, so they must carry the real
          // aspect ratio (614x220) — a square width here made it serve a ~40px
          // wide file stretched to ~110px, which is why the logo looked blurry.
          width={Math.round(size * (614 / 220))}
          height={size}
          // The artwork is a wide wordmark, not a square. `size` is the height
          // it should occupy; letting the width follow the aspect ratio keeps
          // it from being squeezed into a box it was never drawn for.
          // With heightClassName, `size` should be the largest height it takes,
          // so the served file is sharp at every breakpoint.
          className={`flex-shrink-0 w-auto ${heightClassName ?? ''}`}
          style={heightClassName ? undefined : { height: size }}
          priority={true}
          unoptimized={src.endsWith('.svg')}
        />
      ) : (
        <AppIcon name={iconName} size={size} className="flex-shrink-0" />
      )}
    </div>
  );
});

export default AppLogo;
