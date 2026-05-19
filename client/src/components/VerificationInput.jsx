import { useState, useRef, useEffect } from 'react';

/**
 * 6 位验证码输入组件
 * @param {object} props
 * @param {function} props.onComplete - 输入完成回调 (code: string) => void
 * @param {function} props.onChange - 值变化回调 (code: string) => void
 * @param {string} props.value - 受控值
 * @param {boolean} props.disabled - 是否禁用
 */
export default function VerificationInput({ onComplete, onChange, value = '', disabled = false }) {
  const [digits, setDigits] = useState(Array(6).fill(''));
  const inputRefs = useRef([]);

  useEffect(() => {
    if (value !== undefined && value !== digits.join('')) {
      const arr = value.split('').concat(Array(6).fill('')).slice(0, 6);
      setDigits(arr);
    }
  }, [value]);

  const handleChange = (index, val) => {
    if (disabled) return;
    // 只允许数字
    if (val && !/^\d$/.test(val)) return;

    const newDigits = [...digits];
    newDigits[index] = val;
    setDigits(newDigits);

    const code = newDigits.join('');
    onChange?.(code);

    // 自动跳到下一个
    if (val && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // 输入完成
    if (newDigits.every(d => d !== '')) {
      onComplete?.(code);
    }
  };

  const handleKeyDown = (index, e) => {
    if (disabled) return;
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        onChange?.(newDigits.join(''));
      }
    }
  };

  const handlePaste = (e) => {
    if (disabled) return;
    e.preventDefault();
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    const newDigits = Array(6).fill('');
    for (let i = 0; i < text.length; i++) newDigits[i] = text[i];
    setDigits(newDigits);
    const code = newDigits.join('');
    onChange?.(code);
    // 焦点到最后一个填了值的格子
    const focusIdx = Math.min(text.length, 5);
    inputRefs.current[focusIdx]?.focus();
    if (text.length === 6) onComplete?.(code);
  };

  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => inputRefs.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          style={{
            width: '48px', height: '56px',
            textAlign: 'center', fontSize: '24px', fontWeight: 700,
            fontFamily: 'monospace',
            border: d ? '2px solid var(--primary)' : '2px solid var(--border)',
            borderRadius: '12px',
            background: 'var(--input-bg)',
            color: 'var(--text)',
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'var(--primary)';
            e.target.style.boxShadow = '0 0 0 3px rgba(var(--primary-rgb, 99,102,241), 0.15)';
          }}
          onBlur={e => {
            e.target.style.borderColor = d ? 'var(--primary)' : 'var(--border)';
            e.target.style.boxShadow = 'none';
          }}
        />
      ))}
    </div>
  );
}
