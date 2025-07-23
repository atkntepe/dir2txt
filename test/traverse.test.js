import { jest } from '@jest/globals';
import fg from 'fast-glob';
import { promises as fs } from 'fs';
import { getFiles, getFilesWithGitignore, getFileCount } from '../lib/traverse.js';
import * as config from '../lib/config.js';

// Mock dependencies
jest.mock('fast-glob');
const glob = fg;
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    stat: jest.fn(),
    open: jest.fn()
  }
}));
jest.mock('../lib/config.js');

// Mock console to avoid cluttering test output
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

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
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Traverse Module', () => {
  describe('getFiles', () => {
    test('should return files using config ignore patterns', async () => {
      const mockConfig = {
        ignorePatterns: ['node_modules/**', '*.log'],
        includeExtensions: ['.js', '.ts'],
        maxFileSize: 1048576
      };
      
      config.loadConfig.mockResolvedValue(mockConfig);
      glob.mockResolvedValue(['src/index.js', 'src/utils.ts', 'README.md']);
      
      const files = await getFiles();
      
      expect(glob).toHaveBeenCalledWith('**/*', {
        ignore: expect.arrayContaining(['node_modules/**', '*.log']),
        dot: true,
        onlyFiles: true,
        absolute: false,
        stats: false
      });
      
      // Should filter by extensions from config
      expect(files).toEqual(['README.md', 'src/index.js', 'src/utils.ts']);
    });

    test('should fall back to .gitignore when no config', async () => {
      config.loadConfig.mockResolvedValue({});
      fs.readFile.mockResolvedValue('node_modules/\n*.log\ndist/');
      glob.mockResolvedValue(['src/index.js', 'lib/utils.js']);
      
      const files = await getFiles();
      
      expect(fs.readFile).toHaveBeenCalledWith('/mock/project/.gitignore', 'utf8');
      expect(glob).toHaveBeenCalledWith('**/*', {
        ignore: expect.arrayContaining(['node_modules/**', '*.log', 'dist/**']),
        dot: true,
        onlyFiles: true,
        absolute: false,
        stats: false
      });
    });

    test('should filter by file extensions', async () => {
      config.loadConfig.mockResolvedValue({});
      fs.readFile.mockRejectedValue({ code: 'ENOENT' }); // No .gitignore
      glob.mockResolvedValue([
        'src/index.js',
        'src/utils.ts', 
        'package.json',
        'README.md',
        'image.png'
      ]);
      
      const files = await getFiles({
        includeExtensions: ['.js', '.ts']
      });
      
      expect(files).toEqual(['src/index.js', 'src/utils.ts']);
    });

    test('should filter by file size when excludeLarge is true', async () => {
      config.loadConfig.mockResolvedValue({ maxFileSize: 1000 });
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      glob.mockResolvedValue(['small.js', 'large.js', 'medium.js']);
      
      // Mock file stats
      const mockStats = (size) => ({ isFile: () => true, size });
      fs.stat
        .mockResolvedValueOnce(mockStats(500))   // small.js
        .mockResolvedValueOnce(mockStats(2000))  // large.js (too big)
        .mockResolvedValueOnce(mockStats(800));  // medium.js
      
      const files = await getFiles({ excludeLarge: true });
      
      expect(files).toEqual(['medium.js', 'small.js']);
    });

    test('should respect maxDepth option', async () => {
      config.loadConfig.mockResolvedValue({});
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      glob.mockResolvedValue(['file.js']);
      
      await getFiles({ maxDepth: 2 });
      
      expect(glob).toHaveBeenCalledWith('**/*', {
        ignore: expect.any(Array),
        dot: true,
        onlyFiles: true,
        absolute: false,
        stats: false,
        deep: 2
      });
    });

    test('should use custom ignore patterns when provided', async () => {
      config.loadConfig.mockResolvedValue({});
      glob.mockResolvedValue(['test.js']);
      
      const customPatterns = ['*.test.js', 'coverage/**'];
      await getFiles({ ignorePatterns: customPatterns });
      
      expect(glob).toHaveBeenCalledWith('**/*', {
        ignore: expect.arrayContaining(customPatterns),
        dot: true,
        onlyFiles: true,
        absolute: false,
        stats: false
      });
    });

    test('should handle empty directory gracefully', async () => {
      config.loadConfig.mockResolvedValue({});
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      glob.mockResolvedValue([]);
      
      const files = await getFiles();
      
      expect(files).toEqual([]);
    });

    test('should handle glob errors', async () => {
      config.loadConfig.mockResolvedValue({});
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      glob.mockRejectedValue(new Error('Glob error'));
      
      await expect(getFiles()).rejects.toThrow('Glob error');
    });
  });

  describe('getFilesWithGitignore', () => {
    test('should use .gitignore patterns specifically', async () => {
      fs.readFile.mockResolvedValue('node_modules/\n*.log');
      glob.mockResolvedValue(['src/index.js']);
      
      const files = await getFilesWithGitignore();
      
      expect(fs.readFile).toHaveBeenCalledWith('/mock/project/.gitignore', 'utf8');
      expect(files).toEqual(['src/index.js']);
    });

    test('should handle missing .gitignore', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      glob.mockResolvedValue(['src/index.js']);
      
      const files = await getFilesWithGitignore();
      
      expect(files).toEqual(['src/index.js']);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('getFileCount', () => {
    test('should return count of files', async () => {
      config.loadConfig.mockResolvedValue({
        ignorePatterns: ['node_modules/**']
      });
      glob.mockResolvedValue(['file1.js', 'file2.js', 'file3.ts']);
      
      const count = await getFileCount();
      
      expect(count).toBe(3);
    });

    test('should filter by extensions when counting', async () => {
      config.loadConfig.mockResolvedValue({});
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      glob.mockResolvedValue(['file1.js', 'file2.ts', 'file3.md']);
      
      const count = await getFileCount({
        includeExtensions: ['.js', '.ts']
      });
      
      expect(count).toBe(2);
    });

    test('should return 0 on error', async () => {
      config.loadConfig.mockRejectedValue(new Error('Config error'));
      
      const count = await getFileCount();
      
      expect(count).toBe(0);
    });
  });

  describe('gitignore parsing', () => {
    test('should parse gitignore patterns correctly', async () => {
      const gitignoreContent = `
# Comments should be ignored
node_modules/
*.log
dist
/build
temp/
      `.trim();
      
      config.loadConfig.mockResolvedValue({});
      fs.readFile.mockResolvedValue(gitignoreContent);
      glob.mockResolvedValue(['test.js']);
      
      await getFiles();
      
      expect(glob).toHaveBeenCalledWith('**/*', {
        ignore: expect.arrayContaining([
          'node_modules/**',
          '**/*.log',
          '**/dist',
          '/build',
          'temp/**'
        ]),
        dot: true,
        onlyFiles: true,
        absolute: false,
        stats: false
      });
    });

    test('should handle gitignore read errors', async () => {
      config.loadConfig.mockResolvedValue({});
      fs.readFile.mockRejectedValue(new Error('Read error'));
      glob.mockResolvedValue(['test.js']);
      
      const files = await getFiles();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error reading .gitignore')
      );
      expect(files).toEqual(['test.js']);
    });
  });
});