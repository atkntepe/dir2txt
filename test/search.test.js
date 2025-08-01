import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { 
  searchInFiles, 
  filterByDate, 
  filterByContent, 
  findCodePatterns,
  findFunctionPatterns,
  generateSearchStats 
} from '../lib/search.js';

describe('Search Module', () => {
  const testDir = path.join(process.cwd(), 'test-temp');
  const testFiles = [
    'test1.js',
    'test2.js', 
    'test3.py',
    'test4.txt'
  ];

  beforeEach(async () => {
    // Create test directory and files
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test files with different content
    await fs.writeFile(path.join(testDir, 'test1.js'), `
// TODO: Fix this function
function calculateTotal(items) {
  // FIXME: Handle edge case
  return items.reduce((sum, item) => sum + item.price, 0);
}

async function processData() {
  const data = await fetchData();
  return data;
}
`);

    await fs.writeFile(path.join(testDir, 'test2.js'), `
class UserManager {
  constructor() {
    this.users = [];
  }
  
  // HACK: Temporary workaround
  async findUser(id) {
    return this.users.find(u => u.id === id);
  }
}
`);

    await fs.writeFile(path.join(testDir, 'test3.py'), `
def calculate_sum(numbers):
    # TODO: Add validation
    return sum(numbers)

class DataProcessor:
    def __init__(self):
        pass
        
    async def process(self):
        # DEPRECATED: Use new method
        pass
`);

    await fs.writeFile(path.join(testDir, 'test4.txt'), `
This is a regular text file.
It contains some TODO items for documentation.
No code patterns here.
`);
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('searchInFiles', () => {
    test('should find simple text matches', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const results = await searchInFiles(files, 'TODO');
      
      expect(results).toHaveLength(3); // Found in test1.js, test3.py, test4.txt
      expect(results[0].matchCount).toBeGreaterThan(0);
      expect(results[0].matches[0]).toHaveProperty('lineNumber');
      expect(results[0].matches[0]).toHaveProperty('matchText');
    });

    test('should handle regex patterns', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const results = await searchInFiles(files, 'TODO|FIXME', { regex: true });
      
      expect(results.length).toBeGreaterThan(0);
      
      // Should find both TODO and FIXME
      const allMatches = results.flatMap(r => r.matches);
      const todoMatches = allMatches.filter(m => m.matchText.includes('TODO'));
      const fixmeMatches = allMatches.filter(m => m.matchText.includes('FIXME'));
      
      expect(todoMatches.length).toBeGreaterThan(0);
      expect(fixmeMatches.length).toBeGreaterThan(0);
    });

    test('should provide context lines when requested', async () => {
      const files = [path.join(testDir, 'test1.js')];
      const results = await searchInFiles(files, 'TODO', { contextLines: 2 });
      
      expect(results).toHaveLength(1);
      expect(results[0].matches[0]).toHaveProperty('context');
      expect(results[0].matches[0].context).toHaveProperty('before');
      expect(results[0].matches[0].context).toHaveProperty('after');
    });

    test('should respect case sensitivity', async () => {
      const files = [path.join(testDir, 'test1.js')];
      
      // Case insensitive (default)
      const insensitiveResults = await searchInFiles(files, 'todo');
      expect(insensitiveResults.length).toBeGreaterThan(0);
      
      // Case sensitive
      const sensitiveResults = await searchInFiles(files, 'todo', { caseSensitive: true });
      expect(sensitiveResults).toHaveLength(0);
    });

    test('should limit matches per file', async () => {
      const files = [path.join(testDir, 'test1.js')];
      const results = await searchInFiles(files, '.', { maxMatches: 2 });
      
      if (results.length > 0) {
        expect(results[0].matches.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('filterByDate', () => {
    test('should filter files by modification date', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // All files should be newer than yesterday
      const recentFiles = await filterByDate(files, { since: yesterday });
      expect(recentFiles).toHaveLength(files.length);
      
      // No files should be older than tomorrow
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const oldFiles = await filterByDate(files, { before: yesterday });
      expect(oldFiles).toHaveLength(0);
    });

    test('should handle invalid dates', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      
      await expect(filterByDate(files, { since: 'invalid-date' }))
        .rejects.toThrow('Invalid \'since\' date');
    });
  });

  describe('filterByContent', () => {
    test('should filter files by content', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      
      // Should find JavaScript files with 'function'
      const functionFiles = await filterByContent(files, 'function');
      expect(functionFiles.length).toBeGreaterThan(0);
      expect(functionFiles.some(f => f.endsWith('.js'))).toBe(true);
      
      // Should not find files with non-existent content
      const emptyResults = await filterByContent(files, 'nonexistent-pattern');
      expect(emptyResults).toHaveLength(0);
    });

    test('should support regex in content filtering', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      
      const asyncFiles = await filterByContent(files, 'async\\s+function', { regex: true });
      expect(asyncFiles.length).toBeGreaterThan(0);
    });
  });

  describe('findCodePatterns', () => {
    test('should find TODO patterns', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const results = await findCodePatterns(files);
      
      expect(results).toHaveProperty('todo');
      expect(results.todo.results.length).toBeGreaterThan(0);
      expect(results.todo.stats.totalMatches).toBeGreaterThan(0);
    });

    test('should find FIXME patterns', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const results = await findCodePatterns(files);
      
      expect(results).toHaveProperty('fixme');
      expect(results.fixme.results.length).toBeGreaterThan(0);
    });

    test('should find HACK patterns', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const results = await findCodePatterns(files);
      
      expect(results).toHaveProperty('hack');
      expect(results.hack.results.length).toBeGreaterThan(0);
    });

    test('should find DEPRECATED patterns', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const results = await findCodePatterns(files);
      
      expect(results).toHaveProperty('deprecated');
      expect(results.deprecated.results.length).toBeGreaterThan(0);
    });
  });

  describe('findFunctionPatterns', () => {
    test('should find async functions', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const results = await findFunctionPatterns(files);
      
      const asyncResults = results.find(r => r.name === 'async_functions');
      expect(asyncResults).toBeDefined();
      expect(asyncResults.results.length).toBeGreaterThan(0);
    });

    test('should find class definitions', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const results = await findFunctionPatterns(files);
      
      const classResults = results.find(r => r.name === 'class_definitions');
      expect(classResults).toBeDefined();
      expect(classResults.results.length).toBeGreaterThan(0);
    });
  });

  describe('generateSearchStats', () => {
    test('should generate comprehensive statistics', async () => {
      const files = testFiles.map(f => path.join(testDir, f));
      const searchResults = await searchInFiles(files, 'TODO');
      const stats = generateSearchStats(searchResults, 'TODO');
      
      expect(stats).toHaveProperty('pattern', 'TODO');
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('totalMatches');
      expect(stats).toHaveProperty('averageMatchesPerFile');
      expect(stats).toHaveProperty('extensionStats');
      expect(stats).toHaveProperty('topFiles');
      
      expect(stats.totalFiles).toBe(searchResults.length);
      expect(Object.keys(stats.extensionStats).length).toBeGreaterThan(0);
    });

    test('should handle empty search results', () => {
      const stats = generateSearchStats([], 'nonexistent');
      
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalMatches).toBe(0);
      expect(stats.averageMatchesPerFile).toBe('0');
      expect(Object.keys(stats.extensionStats)).toHaveLength(0);
      expect(stats.topFiles).toHaveLength(0);
    });
  });
});