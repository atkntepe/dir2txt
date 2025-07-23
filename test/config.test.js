import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { 
  loadConfig, 
  createDefaultConfig, 
  updateConfig, 
  deleteConfig,
  getDefaultConfig 
} from '../lib/config.js';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

// Mock console methods to avoid cluttering test output
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

// Mock process.cwd
const originalCwd = process.cwd;
const mockCwd = jest.fn().mockReturnValue('/mock/project');

beforeAll(() => {
  process.cwd = mockCwd;
});

afterAll(() => {
  process.cwd = originalCwd;
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Config Module', () => {
  describe('loadConfig', () => {
    test('should return empty object when no config file exists', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      
      const config = await loadConfig();
      
      expect(config).toEqual({});
      expect(fs.readFile).toHaveBeenCalledWith('/mock/project/.dir2txt.json', 'utf8');
    });

    test('should parse and return valid config file', async () => {
      const mockConfig = {
        ignorePatterns: ['node_modules/**', '*.log'],
        includeExtensions: ['.js', '.ts'],
        maxFileSize: 1048576
      };
      
      fs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
      
      const config = await loadConfig();
      
      expect(config).toEqual(mockConfig);
    });

    test('should handle invalid JSON gracefully', async () => {
      fs.readFile.mockResolvedValue('invalid json {');
      
      const config = await loadConfig();
      
      expect(config).toEqual({});
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON in .dir2txt.json')
      );
    });

    test('should merge with defaults for missing properties', async () => {
      const partialConfig = {
        ignorePatterns: ['custom/**']
      };
      
      fs.readFile.mockResolvedValue(JSON.stringify(partialConfig));
      
      const config = await loadConfig();
      const defaultConfig = getDefaultConfig();
      
      expect(config.ignorePatterns).toEqual(['custom/**']);
      expect(config.includeExtensions).toEqual(defaultConfig.includeExtensions);
      expect(config.maxFileSize).toEqual(defaultConfig.maxFileSize);
    });
  });

  describe('createDefaultConfig', () => {
    test('should create default config file', async () => {
      fs.writeFile.mockResolvedValue();
      
      await createDefaultConfig();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/mock/project/.dir2txt.json',
        expect.stringContaining('ignorePatterns'),
        'utf8'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Created default configuration file: .dir2txt.json'
      );
    });

    test('should handle write errors', async () => {
      const writeError = new Error('Permission denied');
      fs.writeFile.mockRejectedValue(writeError);
      
      await expect(createDefaultConfig()).rejects.toThrow('Permission denied');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error creating default config file: Permission denied'
      );
    });
  });

  describe('updateConfig', () => {
    test('should update existing config with new values', async () => {
      const existingConfig = {
        ignorePatterns: ['node_modules/**'],
        includeExtensions: ['.js'],
        maxFileSize: 1048576
      };
      
      fs.readFile.mockResolvedValue(JSON.stringify(existingConfig));
      fs.writeFile.mockResolvedValue();
      
      const updates = {
        maxFileSize: 2097152,
        ignorePatterns: ['dist/**', 'build/**']
      };
      
      await updateConfig(updates);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/mock/project/.dir2txt.json',
        expect.stringContaining('"maxFileSize": 2097152'),
        'utf8'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Updated configuration file: .dir2txt.json'
      );
    });

    test('should handle array updates properly', async () => {
      fs.readFile.mockResolvedValue('{}');
      fs.writeFile.mockResolvedValue();
      
      const updates = {
        ignorePatterns: ['*.test.js'],
        includeExtensions: ['.ts', '.tsx']
      };
      
      await updateConfig(updates);
      
      const writeCall = fs.writeFile.mock.calls[0];
      const writtenConfig = JSON.parse(writeCall[1]);
      
      expect(writtenConfig.ignorePatterns).toEqual(['*.test.js']);
      expect(writtenConfig.includeExtensions).toEqual(['.ts', '.tsx']);
    });
  });

  describe('deleteConfig', () => {
    test('should delete config file when it exists', async () => {
      fs.unlink.mockResolvedValue();
      
      await deleteConfig();
      
      expect(fs.unlink).toHaveBeenCalledWith('/mock/project/.dir2txt.json');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Deleted configuration file: .dir2txt.json'
      );
    });

    test('should handle file not found gracefully', async () => {
      fs.unlink.mockRejectedValue({ code: 'ENOENT' });
      
      await deleteConfig();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Configuration file .dir2txt.json does not exist.'
      );
    });

    test('should handle other deletion errors', async () => {
      const deleteError = new Error('Permission denied');
      fs.unlink.mockRejectedValue(deleteError);
      
      await expect(deleteConfig()).rejects.toThrow('Permission denied');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error deleting config file: Permission denied'
      );
    });
  });

  describe('getDefaultConfig', () => {
    test('should return default configuration object', () => {
      const defaultConfig = getDefaultConfig();
      
      expect(defaultConfig).toHaveProperty('ignorePatterns');
      expect(defaultConfig).toHaveProperty('includeExtensions');
      expect(defaultConfig).toHaveProperty('maxFileSize');
      expect(Array.isArray(defaultConfig.ignorePatterns)).toBe(true);
      expect(Array.isArray(defaultConfig.includeExtensions)).toBe(true);
      expect(typeof defaultConfig.maxFileSize).toBe('number');
    });

    test('should return a copy, not reference', () => {
      const config1 = getDefaultConfig();
      const config2 = getDefaultConfig();
      
      config1.ignorePatterns.push('test');
      
      expect(config2.ignorePatterns).not.toContain('test');
    });
  });
});