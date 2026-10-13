import { describe, expect, it } from 'vitest';
import { assertAchievement, MAX_IMAGE_BYTES, readAchievementImage } from './achievements';

describe('achievements validation & helpers', () => {
  it('validates a complete achievement correctly', () => {
    const valid = {
      id: 'test-1',
      title: 'First 5R Setup',
      category: 'Trading Milestone',
      date: '2025-01-01',
      pnl: '+₹15,000',
      description: 'Solid breakout with volume confluence',
      imageData: 'data:image/svg+xml;utf8,<svg></svg>',
    };
    expect(() => assertAchievement(valid)).not.toThrow();
  });

  it('rejects an achievement missing a title or date', () => {
    expect(() => assertAchievement({ id: '1', title: '', date: '2025-01-01', description: '' })).toThrow(
      /title cannot be empty/i
    );
    expect(() => assertAchievement({ id: '1', title: 'Test', date: '', description: '' })).toThrow(
      /date is required/i
    );
  });

  it('verifies MAX_IMAGE_BYTES is 3 MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(3 * 1024 * 1024);
  });

  it('rejects invalid image file types in readAchievementImage', async () => {
    const fakeFile = {
      name: 'document.pdf',
      type: 'application/pdf',
      size: 1024,
    };
    await expect(readAchievementImage(fakeFile)).rejects.toThrow(/Unsupported file format/i);
  });

  it('rejects oversized image files exceeding 3 MB', async () => {
    const oversizedFile = {
      name: 'giant-screenshot.png',
      type: 'image/png',
      size: 4 * 1024 * 1024, // 4 MB
    };
    await expect(readAchievementImage(oversizedFile)).rejects.toThrow(/exceeds the 3 MB limit/i);
  });
});
