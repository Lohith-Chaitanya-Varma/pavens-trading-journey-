import { describe, expect, it } from 'vitest';
import { formatErrorMessage } from './market';

describe('formatErrorMessage prevents [object Object]', () => {
  it('returns empty string for nullish values', () => {
    expect(formatErrorMessage(null)).toBe('');
    expect(formatErrorMessage(undefined)).toBe('');
    expect(formatErrorMessage('')).toBe('');
  });

  it('handles standard string errors', () => {
    expect(formatErrorMessage('Custom error message')).toBe('Custom error message');
  });

  it('handles Error instances', () => {
    expect(formatErrorMessage(new Error('Network connection failed'))).toBe('Network connection failed');
  });

  it('handles Upstox API error structure with errors array', () => {
    const upstoxError = {
      status: 'error',
      errors: [
        {
          errorCode: 'UDAPI100057',
          message: 'Token expired or invalid',
        },
      ],
    };
    expect(formatErrorMessage(upstoxError)).toBe('Token expired or invalid');
  });

  it('handles nested error objects with message property', () => {
    const objError = {
      error: {
        message: 'Invalid instrument requested',
      },
    };
    expect(formatErrorMessage(objError)).toBe('Invalid instrument requested');
  });

  it('handles objects with direct message or error properties', () => {
    expect(formatErrorMessage({ message: 'Rate limit exceeded' })).toBe('Rate limit exceeded');
    expect(formatErrorMessage({ error: 'Internal server error' })).toBe('Internal server error');
  });

  it('handles unknown objects cleanly without returning [object Object]', () => {
    const result = formatErrorMessage({ code: 500, detail: 'Failed' });
    expect(result).not.toBe('[object Object]');
    expect(result).toContain('500');
  });
});
