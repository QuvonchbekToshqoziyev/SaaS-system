'use client';

import { useEffect, useRef, useState } from 'react';

type ActionButtonsProps = {
  cancelLabel: string;
  confirmLabel: string;
  busyLabel?: string;
  onCancel: () => void;
  onConfirm?: () => void;
  canConfirm?: boolean;
  busy?: boolean;
  danger?: boolean;
  className?: string;
};

export default function ActionButtons({
  cancelLabel,
  confirmLabel,
  busyLabel,
  onCancel,
  onConfirm,
  canConfirm = true,
  busy = false,
  danger = false,
  className = '',
}: ActionButtonsProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [nativeValid, setNativeValid] = useState(false);

  useEffect(() => {
    const form = confirmRef.current?.form;
    const update = () => setNativeValid(form?.checkValidity() ?? true);
    update();
    form?.addEventListener('input', update);
    form?.addEventListener('change', update);
    return () => {
      form?.removeEventListener('input', update);
      form?.removeEventListener('change', update);
    };
  });

  return (
    <div className={`action-buttons ${className}`.trim()}>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="action-button action-button--secondary"
      >
        {cancelLabel}
      </button>
      <button
        ref={confirmRef}
        type={onConfirm ? 'button' : 'submit'}
        onClick={onConfirm}
        disabled={busy || !nativeValid || !canConfirm}
        className={`action-button ${danger ? 'action-button--danger' : 'action-button--primary'}`}
      >
        {busy ? (busyLabel || confirmLabel) : confirmLabel}
      </button>
    </div>
  );
}
