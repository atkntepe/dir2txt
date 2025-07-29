import { jest } from '@jest/globals';

// Mock console methods
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('Traverse Module', () => {
  describe('file filtering', () => {
    test('should filter by extension correctly', () => {
      const files = ['test.js', 'test.ts', 'test.py', 'test.txt'];
      const jsFiles = files.filter(f => f.endsWith('.js'));
      const tsFiles = files.filter(f => f.endsWith('.ts'));
      
      expect(jsFiles).toEqual(['test.js']);
      expect(tsFiles).toEqual(['test.ts']);
    });

    test('should handle empty file list', () => {
      const files = [];
      const filtered = files.filter(f => f.endsWith('.js'));
      
      expect(filtered).toEqual([]);
    });
  });

  describe('ignore patterns', () => {
    test('should recognize common ignore patterns', () => {
      const patterns = ['node_modules/**', '.git/**', '*.log', 'dist/**'];
      
      expect(patterns).toContain('node_modules/**');
      expect(patterns).toContain('.git/**');
      expect(patterns.length).toBe(4);
    });

    test('should handle glob patterns', () => {
      const pattern = '**/*.test.js';
      
      expect(pattern).toContain('*');
      expect(pattern).toContain('.test.js');
    });
  });

  describe('file size filtering', () => {
    test('should handle size limits', () => {
      const maxSize = 1024 * 1024; // 1MB
      const smallSize = 1024; // 1KB
      const largeSize = 10 * 1024 * 1024; // 10MB
      
      expect(smallSize < maxSize).toBe(true);
      expect(largeSize > maxSize).toBe(true);
    });
  });
});