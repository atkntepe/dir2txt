import { jest } from '@jest/globals';
import { getDefaultConfig } from '../lib/config.js';

// Mock console methods to avoid cluttering test output
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => {
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

describe('Config Module', () => {
  describe('getDefaultConfig', () => {
    test('should return default configuration object', () => {
      const config = getDefaultConfig();
      
      expect(config).toHaveProperty('ignorePatterns');
      expect(config).toHaveProperty('includeExtensions');
      expect(config).toHaveProperty('maxFileSize');
      expect(Array.isArray(config.ignorePatterns)).toBe(true);
      expect(Array.isArray(config.includeExtensions)).toBe(true);
      expect(typeof config.maxFileSize).toBe('number');
    });

    test('should return a copy, not reference', () => {
      const config1 = getDefaultConfig();
      const config2 = getDefaultConfig();
      
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
      expect(config1.ignorePatterns).not.toBe(config2.ignorePatterns); // Arrays should be different references
    });

    test('should have expected default values', () => {
      const config = getDefaultConfig();
      
      expect(config.ignorePatterns).toContain('node_modules/**');
      expect(config.ignorePatterns).toContain('.git/**');
      expect(config.includeExtensions).toContain('.js');
      expect(config.includeExtensions).toContain('.ts');
      expect(config.maxFileSize).toBe(1048576); // 1MB
      expect(config.concurrency).toBe(10);
      expect(config.excludeLarge).toBe(true);
      expect(config.followSymlinks).toBe(false);
    });
  });
});