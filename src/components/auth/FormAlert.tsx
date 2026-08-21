'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

export default function FormAlert({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: React.ReactNode;
}) {
  const error = tone === 'error';
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
        error ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
      }`}
    >
      <Icon
        name={error ? 'ExclamationTriangleIcon' : 'CheckCircleIcon'}
        size={16}
        className={`mt-0.5 shrink-0 ${error ? 'text-red-600' : 'text-green-700'}`}
      />
      <p className={`text-sm leading-relaxed ${error ? 'text-red-700' : 'text-green-800'}`}>
        {children}
      </p>
    </div>
  );
}
