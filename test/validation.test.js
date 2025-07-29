import { jest } from '@jest/globals';
import { 
  validateConfig, 
  ConfigValidationError, 
  formatValidationErrors,
  validators 
} from '../lib/validation.js';

// Mock console methods to avoid cluttering test output
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => {
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

describe('Validation Module', () => {
  describe('validators', () => {
    describe('extension', () => {
      test('should validate correct extensions', () => {
        expect(validators.extension('.js')).toBe(true);
        expect(validators.extension('.ts')).toBe(true);
        expect(validators.extension('.md')).toBe(true);
        expect(validators.extension('.json')).toBe(true);
      });

      test('should reject invalid extensions', () => {
        expect(validators.extension('js')).toBe(false); // Missing dot
        expect(validators.extension('')).toBe(false); // Empty string
        expect(validators.extension('.')).toBe(false); // Just dot
        expect(validators.extension('.js.exe')).toBe(false); // Multiple dots
        expect(validators.extension(123)).toBe(false); // Not string
      });
    });

    describe('globPattern', () => {
      test('should validate correct glob patterns', () => {
        expect(validators.globPattern('node_modules/**')).toBe(true);
        expect(validators.globPattern('*.js')).toBe(true);
        expect(validators.globPattern('src/**/*.ts')).toBe(true);
        expect(validators.globPattern('!exclude.js')).toBe(true);
      });

      test('should reject invalid glob patterns', () => {
        expect(validators.globPattern('')).toBe(false); // Empty string
        expect(validators.globPattern('   ')).toBe(false); // Just whitespace
        expect(validators.globPattern('test\0null')).toBe(false); // Null byte
        expect(validators.globPattern(123)).toBe(false); // Not string
      });
    });

    describe('fileSize', () => {
      test('should validate correct file sizes', () => {
        expect(validators.fileSize(0)).toBe(true);
        expect(validators.fileSize(1024)).toBe(true);
        expect(validators.fileSize(1048576)).toBe(true); // 1MB
        expect(validators.fileSize(1073741824)).toBe(true); // 1GB
      });

      test('should reject invalid file sizes', () => {
        expect(validators.fileSize(-1)).toBe(false); // Negative
        expect(validators.fileSize(1.5)).toBe(false); // Not integer
        expect(validators.fileSize('1024')).toBe(false); // String
        expect(validators.fileSize(Number.MAX_SAFE_INTEGER + 1)).toBe(false); // Too large
      });
    });
  });

  describe('validateConfig', () => {
    test('should validate correct configuration', () => {
      const config = {
        ignorePatterns: ['node_modules/**', '*.log'],
        includeExtensions: ['.js', '.ts'],
        maxFileSize: 1048576,
        concurrency: 5
      };

      const result = validateConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized).toEqual(config);
    });

    test('should handle empty/null config', () => {
      const result1 = validateConfig({});
      expect(result1.isValid).toBe(true);
      
      const result2 = validateConfig(null);
      expect(result2.isValid).toBe(false);
      expect(result2.errors[0]).toBeInstanceOf(ConfigValidationError);
    });

    test('should sanitize invalid extensions', () => {
      const config = {
        includeExtensions: ['js', '.ts', '', '.md'] // 'js' missing dot, '' empty
      };

      const result = validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.sanitized.includeExtensions).toEqual(['.ts', '.md']);
    });

    test('should sanitize invalid ignore patterns', () => {
      const config = {
        ignorePatterns: ['node_modules/**', '', '   ', 'valid/**'] // Empty and whitespace-only
      };

      const result = validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.sanitized.ignorePatterns).toEqual(['node_modules/**', 'valid/**']);
    });

    test('should validate file size limits', () => {
      const config = {
        maxFileSize: -1
      };

      const result = validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'maxFileSize')).toBe(true);
    });

    test('should detect unknown fields', () => {
      const config = {
        ignorePatterns: ['node_modules/**'],
        unknownField: 'value',
        anotherUnknown: 123
      };

      const result = validateConfig(config);
      
      expect(result.errors.some(e => e.field === 'unknownField')).toBe(true);
      expect(result.errors.some(e => e.field === 'anotherUnknown')).toBe(true);
    });
  });

  describe('formatValidationErrors', () => {
    test('should format errors correctly', () => {
      const errors = [
        new ConfigValidationError('Invalid extension', 'includeExtensions[0]', 'js'),
        new ConfigValidationError('Invalid file size', 'maxFileSize', -1)
      ];

      const formatted = formatValidationErrors(errors);
      
      expect(formatted).toContain('❌ Configuration Errors:');
      expect(formatted).toContain('Invalid extension');
      expect(formatted).toContain('Invalid file size');
      expect(formatted).toContain('Field: includeExtensions[0]');
      expect(formatted).toContain('Value: "js"');
    });

    test('should handle empty errors', () => {
      const formatted = formatValidationErrors([]);
      expect(formatted).toBe('');
    });

    test('should format warnings separately', () => {
      const warnings = [
        new ConfigValidationError('Unknown field warning', 'unknownField', 'value')
      ];

      const formatted = formatValidationErrors([], warnings);
      
      expect(formatted).toContain('⚠️  Configuration Warnings:');
      expect(formatted).toContain('Unknown field warning');
    });
  });

  describe('ConfigValidationError', () => {
    test('should create error with field and value', () => {
      const error = new ConfigValidationError('Test error', 'testField', 'testValue');
      
      expect(error.name).toBe('ConfigValidationError');
      expect(error.message).toBe('Test error');
      expect(error.field).toBe('testField');
      expect(error.value).toBe('testValue');
      expect(error instanceof Error).toBe(true);
    });

    test('should create error without field and value', () => {
      const error = new ConfigValidationError('Test error');
      
      expect(error.field).toBe(null);
      expect(error.value).toBe(null);
    });
  });
});