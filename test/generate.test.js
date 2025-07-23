import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { generateText, generatePreview } from '../lib/generate.js';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    appendFile: jest.fn(),
    open: jest.fn()
  }
}));

// Mock console methods
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

// Mock process.stdout.write
const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  stdoutSpy.mockRestore();
});

describe('Generate Module', () => {
  describe('generateText', () => {
    test('should generate file tree and content to stdout', async () => {
      const mockFiles = ['src/index.js', 'src/utils.js', 'package.json'];
      
      // Mock file contents
      fs.readFile
        .mockResolvedValueOnce('console.log("Hello");')  // src/index.js
        .mockResolvedValueOnce('export const util = () => {};')  // src/utils.js
        .mockResolvedValueOnce('{"name": "test"}');  // package.json
      
      // Mock file handle for binary detection
      const mockFileHandle = {
        read: jest.fn().mockResolvedValue({ bytesRead: 100 }),
        close: jest.fn()
      };
      fs.open.mockResolvedValue(mockFileHandle);
      
      await generateText(mockFiles);
      
      // Should write tree structure
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('Project Structure:')
      );
      
      // Should write file contents with delimiters
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('--- src/index.js ---')
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('console.log("Hello");')
      );
    });

    test('should write to file when outputFile option is provided', async () => {
      const mockFiles = ['test.js'];
      
      fs.readFile.mockResolvedValue('const test = true;');
      fs.writeFile.mockResolvedValue(); // Clear file
      fs.appendFile.mockResolvedValue(); // Append content
      
      const mockFileHandle = {
        read: jest.fn().mockResolvedValue({ bytesRead: 100 }),
        close: jest.fn()
      };
      fs.open.mockResolvedValue(mockFileHandle);
      
      await generateText(mockFiles, { outputFile: 'output.txt' });
      
      expect(fs.writeFile).toHaveBeenCalledWith('output.txt', '', 'utf8');
      expect(fs.appendFile).toHaveBeenCalledWith(
        'output.txt',
        expect.stringContaining('Project Structure:'),
        'utf8'
      );
    });

    test('should only generate tree when dry option is true', async () => {
      const mockFiles = ['src/index.js'];
      
      await generateText(mockFiles, { dry: true });
      
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('Project Structure:')
      );
      
      // Should not read any files
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Dry run complete')
      );
    });

    test('should generate markdown format when markdown option is true', async () => {
      const mockFiles = ['test.js'];
      
      fs.readFile.mockResolvedValue('const test = true;');
      
      const mockFileHandle = {
        read: jest.fn().mockResolvedValue({ bytesRead: 100 }),
        close: jest.fn()
      };
      fs.open.mockResolvedValue(mockFileHandle);
      
      await generateText(mockFiles, { markdown: true });
      
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('# Project Structure')
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('```javascript')
      );
    });

    test('should skip binary files by extension', async () => {
      const mockFiles = ['image.png', 'script.js', 'document.pdf'];
      
      fs.readFile.mockResolvedValue('console.log("test");');
      
      const mockFileHandle = {
        read: jest.fn().mockResolvedValue({ bytesRead: 100 }),
        close: jest.fn()
      };
      fs.open.mockResolvedValue(mockFileHandle);
      
      await generateText(mockFiles);
      
      expect(consoleSpy).toHaveBeenCalledWith('Skipping binary file: image.png');
      expect(consoleSpy).toHaveBeenCalledWith('Skipping binary file: document.pdf');
      
      // Should only read the JS file
      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    test('should skip files with binary content', async () => {
      const mockFiles = ['test.js'];
      
      // Mock binary content detection
      const mockFileHandle = {
        read: jest.fn().mockResolvedValue({ 
          bytesRead: 10 
        }),
        close: jest.fn()
      };
      fs.open.mockResolvedValue(mockFileHandle);
      
      // Create buffer with null byte (binary indicator)
      const binaryBuffer = Buffer.from([72, 101, 108, 108, 111, 0, 87, 111, 114, 108]); // "Hello\0Worl"
      mockFileHandle.read.mockImplementation((buffer) => {
        binaryBuffer.copy(buffer);
        return Promise.resolve({ bytesRead: 10 });
      });
      
      await generateText(mockFiles);
      
      expect(consoleSpy).toHaveBeenCalledWith('Skipping binary content: test.js');
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    test('should handle file read errors gracefully', async () => {
      const mockFiles = ['error.js'];
      
      const mockFileHandle = {
        read: jest.fn().mockResolvedValue({ bytesRead: 100 }),
        close: jest.fn()
      };
      fs.open.mockResolvedValue(mockFileHandle);
      
      fs.readFile.mockRejectedValue(new Error('Permission denied'));
      
      await generateText(mockFiles);
      
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Error: Permission denied]')
      );
    });

    test('should handle empty file list', async () => {
      await generateText([]);
      
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('No files found.')
      );
    });
  });

  describe('generatePreview', () => {
    test('should generate preview with limited files', async () => {
      const mockFiles = ['file1.js', 'file2.js', 'file3.js', 'file4.js', 'file5.js'];
      
      fs.readFile.mockResolvedValue('const test = true;');
      
      const mockFileHandle = {
        read: jest.fn().mockResolvedValue({ bytesRead: 100 }),
        close: jest.fn()
      };
      fs.open.mockResolvedValue(mockFileHandle);
      
      await generatePreview(mockFiles, 2);
      
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preview - Project Structure:')
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('PREVIEW (First 2 files)')
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('and 3 more files')
      );
      
      // Should only read first 2 files
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    test('should not show "more files" message when preview includes all', async () => {
      const mockFiles = ['file1.js', 'file2.js'];
      
      fs.readFile.mockResolvedValue('const test = true;');
      
      const mockFileHandle = {
        read: jest.fn().mockResolvedValue({ bytesRead: 100 }),
        close: jest.fn()
      };
      fs.open.mockResolvedValue(mockFileHandle);
      
      await generatePreview(mockFiles, 5);
      
      expect(stdoutSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('more files')
      );
    });
  });

  describe('file tree generation', () => {
    test('should generate proper ASCII tree structure', async () => {
      const mockFiles = ['src/index.js', 'src/utils/helper.js', 'package.json'];
      
      await generateText(mockFiles, { dry: true });
      
      const treeOutput = stdoutSpy.mock.calls
        .map(call => call[0])
        .join('')
        .toString();
      
      expect(treeOutput).toContain('├──');
      expect(treeOutput).toContain('└──');
      expect(treeOutput).toContain('│');
      expect(treeOutput).toContain('src');
      expect(treeOutput).toContain('package.json');
    });
  });

  describe('language detection', () => {
    test('should detect language from file extension for markdown', async () => {
      const mockFiles = ['test.py', 'script.js', 'style.css'];
      
      fs.readFile.mockResolvedValue('content');
      
      const mockFileHandle = {
        read: jest.fn().mockResolvedValue({ bytesRead: 100 }),
        close: jest.fn()
      };
      fs.open.mockResolvedValue(mockFileHandle);
      
      await generateText(mockFiles, { markdown: true });
      
      const markdownOutput = stdoutSpy.mock.calls
        .map(call => call[0])
        .join('')
        .toString();
      
      expect(markdownOutput).toContain('```python');
      expect(markdownOutput).toContain('```javascript');
      expect(markdownOutput).toContain('```css');
    });
  });
});