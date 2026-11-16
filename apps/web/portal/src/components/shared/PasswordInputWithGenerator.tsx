import { generateStrongInitialPassword } from '@diagnostic/shared';

export interface PasswordInputWithGeneratorProps {
  value: string;
  onChange: (nextValue: string) => void;
  showPassword: boolean;
  onToggleShow: () => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  generatedLength?: number;
  disabled?: boolean;
  onGenerate?: (pwd: string) => void;
}

export function PasswordInputWithGenerator({
  value,
  onChange,
  showPassword,
  onToggleShow,
  placeholder = 'Min 6 chars — leave blank for Email OTP / Google',
  required = false,
  minLength,
  generatedLength = 12,
  disabled = false,
  onGenerate,
}: PasswordInputWithGeneratorProps) {
  function handleGenerate() {
    const pwd = generateStrongInitialPassword(generatedLength);
    onChange(pwd);
    if (!showPassword) {
      onToggleShow();
    }
    onGenerate?.(pwd);
  }

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        type={showPassword ? 'text' : 'password'}
        className="form-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        disabled={disabled}
        style={{ flex: 1, minWidth: '180px' }}
      />
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled}
        onClick={onToggleShow}
        style={{ padding: '7px 10px', fontSize: '0.78rem' }}
      >
        {showPassword ? 'Hide' : 'Show'}
      </button>
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled}
        onClick={handleGenerate}
        style={{ padding: '7px 10px', fontSize: '0.78rem' }}
      >
        🎲 Generate
      </button>
    </div>
  );
}

