import { promises as fs } from 'fs';
import path from 'path';

/**
 * Advanced search and content analysis module for dir2txt
 * Provides content-based filtering, pattern matching, and file analysis
 */

/**
 * Search for patterns within file contents
 * @param {string[]} files - Array of file paths to search
 * @param {string} pattern - Search pattern (regex or string)
 * @param {Object} options - Search options
 * @param {boolean} [options.regex=false] - Treat pattern as regex
 * @param {boolean} [options.caseSensitive=false] - Case sensitive search
 * @param {number} [options.contextLines=0] - Number of context lines before/after match
 * @param {boolean} [options.highlightMatches=false] - Add highlighting to matches
 * @param {number} [options.maxMatches=100] - Maximum matches per file
 * @returns {Promise<Object[]>} Array of search results
 */
export async function searchInFiles(files, pattern, options = {}) {
  const {
    regex = false,
    caseSensitive = false,
    contextLines = 0,
    highlightMatches = false,
    maxMatches = 100
  } = options;

  const results = [];
  let searchRegex;

  try {
    // Prepare regex pattern
    if (regex) {
      const flags = caseSensitive ? 'g' : 'gi';
      searchRegex = new RegExp(pattern, flags);
    } else {
      // Escape special regex characters for literal search
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = caseSensitive ? 'g' : 'gi';
      searchRegex = new RegExp(escapedPattern, flags);
    }
  } catch (error) {
    throw new Error(`Invalid search pattern: ${error.message}`);
  }

  // Process files in batches for better performance
  const batchSize = 10;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        const matches = [];

        // Search each line for matches
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex];
          let match;
          
          // Reset regex lastIndex for global searches
          searchRegex.lastIndex = 0;
          
          while ((match = searchRegex.exec(line)) !== null && matches.length < maxMatches) {
            const matchResult = {
              lineNumber: lineIndex + 1,
              columnNumber: match.index + 1,
              matchText: match[0],
              line: highlightMatches ? highlightMatch(line, match) : line
            };

            // Add context lines if requested
            if (contextLines > 0) {
              matchResult.context = {
                before: lines.slice(
                  Math.max(0, lineIndex - contextLines),
                  lineIndex
                ),
                after: lines.slice(
                  lineIndex + 1,
                  Math.min(lines.length, lineIndex + contextLines + 1)
                )
              };
            }

            matches.push(matchResult);
            
            // Break if not global search
            if (!searchRegex.global) break;
          }
        }

        if (matches.length > 0) {
          return {
            filePath,
            matchCount: matches.length,
            matches,
            truncated: matches.length >= maxMatches
          };
        }

      } catch (error) {
        console.warn(`Warning: Could not search in file ${filePath}: ${error.message}`);
      }

      return null;
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(result => result !== null));
  }

  return results;
}

/**
 * Highlight matches in a line with ANSI color codes
 * @param {string} line - The line containing the match
 * @param {RegExpExecArray} match - The regex match result
 * @returns {string} Line with highlighted match
 */
function highlightMatch(line, match) {
  const before = line.substring(0, match.index);
  const matchText = match[0];
  const after = line.substring(match.index + matchText.length);
  
  // Use ANSI color codes for highlighting
  const highlight = `\x1b[43m\x1b[30m${matchText}\x1b[0m`; // Yellow background, black text
  
  return before + highlight + after;
}

/**
 * Filter files by modification date
 * @param {string[]} files - Array of file paths
 * @param {Object} options - Date filtering options
 * @param {Date|string} [options.since] - Include files modified since this date
 * @param {Date|string} [options.before] - Include files modified before this date
 * @returns {Promise<string[]>} Filtered array of files
 */
export async function filterByDate(files, options = {}) {
  const { since, before } = options;

  if (!since && !before) {
    return files;
  }

  const filteredFiles = [];
  const sinceDate = since ? new Date(since) : null;
  const beforeDate = before ? new Date(before) : null;

  // Validate dates
  if (sinceDate && isNaN(sinceDate.getTime())) {
    throw new Error(`Invalid 'since' date: ${since}`);
  }
  if (beforeDate && isNaN(beforeDate.getTime())) {
    throw new Error(`Invalid 'before' date: ${before}`);
  }

  // Process files in batches
  const batchSize = 50;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (filePath) => {
      try {
        const stats = await fs.stat(filePath);
        const modifiedDate = stats.mtime;

        let includeFile = true;

        if (sinceDate && modifiedDate < sinceDate) {
          includeFile = false;
        }

        if (beforeDate && modifiedDate > beforeDate) {
          includeFile = false;
        }

        return includeFile ? filePath : null;

      } catch (error) {
        console.warn(`Warning: Could not check date for file ${filePath}: ${error.message}`);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    filteredFiles.push(...batchResults.filter(file => file !== null));
  }

  return filteredFiles;
}

/**
 * Generate search statistics and summary
 * @param {Object[]} searchResults - Results from searchInFiles
 * @param {string} pattern - The search pattern used
 * @returns {Object} Search statistics
 */
export function generateSearchStats(searchResults, pattern) {
  const totalFiles = searchResults.length;
  const totalMatches = searchResults.reduce((sum, result) => sum + result.matchCount, 0);
  
  // Group by file extension
  const extensionStats = {};
  searchResults.forEach(result => {
    const ext = path.extname(result.filePath) || '(no extension)';
    if (!extensionStats[ext]) {
      extensionStats[ext] = { files: 0, matches: 0 };
    }
    extensionStats[ext].files++;
    extensionStats[ext].matches += result.matchCount;
  });

  // Find files with most matches
  const topFiles = searchResults
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 5)
    .map(result => ({
      file: result.filePath,
      matches: result.matchCount
    }));

  return {
    pattern,
    totalFiles,
    totalMatches,
    averageMatchesPerFile: totalFiles > 0 ? (totalMatches / totalFiles).toFixed(2) : '0',
    extensionStats,
    topFiles
  };
}

/**
 * Search for common code patterns (TODOs, FIXMEs, etc.)
 * @param {string[]} files - Array of file paths to search
 * @param {Object} options - Search options
 * @param {number} [options.contextLines=2] - Context lines around matches
 * @returns {Promise<Object>} Results grouped by pattern type
 */
export async function findCodePatterns(files, options = {}) {
  const { contextLines = 2 } = options;

  const patterns = {
    todo: {
      regex: /\b(TODO|@todo)\b.*/gi,
      description: 'TODO comments and tasks'
    },
    fixme: {
      regex: /\b(FIXME|@fixme|BUG)\b.*/gi,
      description: 'FIXME and bug comments'
    },
    hack: {
      regex: /\b(HACK|@hack|WORKAROUND)\b.*/gi,
      description: 'Hack and workaround comments'
    },
    deprecated: {
      regex: /\b(DEPRECATED|@deprecated)\b.*/gi,
      description: 'Deprecated code markers'
    },
    review: {
      regex: /\b(REVIEW|@review|XXX)\b.*/gi,
      description: 'Code review markers'
    }
  };

  const results = {};

  for (const [patternName, patternConfig] of Object.entries(patterns)) {
    const searchResults = await searchInFiles(files, patternConfig.regex.source, {
      regex: true,
      caseSensitive: false,
      contextLines,
      highlightMatches: true
    });

    results[patternName] = {
      description: patternConfig.description,
      results: searchResults,
      stats: generateSearchStats(searchResults, patternConfig.regex.source)
    };
  }

  return results;
}

/**
 * Search for function definitions and async patterns
 * @param {string[]} files - Array of file paths to search
 * @param {Object} options - Search options
 * @returns {Promise<Object[]>} Array of function search results
 */
export async function findFunctionPatterns(files, options = {}) {
  const patterns = [
    {
      name: 'async_functions',
      regex: /(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{|(?:async\s+)?\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
      description: 'Function declarations and async functions'
    },
    {
      name: 'class_definitions',
      regex: /class\s+\w+(?:\s+extends\s+\w+)?\s*\{/g,
      description: 'Class definitions'
    },
    {
      name: 'arrow_functions',
      regex: /(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
      description: 'Arrow function assignments'
    }
  ];

  const results = [];

  for (const pattern of patterns) {
    const searchResults = await searchInFiles(files, pattern.regex.source, {
      regex: true,
      caseSensitive: false,
      contextLines: 1,
      maxMatches: 50
    });

    results.push({
      name: pattern.name,
      description: pattern.description,
      results: searchResults,
      stats: generateSearchStats(searchResults, pattern.regex.source)
    });
  }

  return results;
}

/**
 * Advanced content filtering based on file content patterns
 * @param {string[]} files - Array of file paths
 * @param {string} contentFilter - Pattern to match in file content
 * @param {Object} options - Filter options
 * @param {boolean} [options.regex=false] - Treat pattern as regex
 * @param {boolean} [options.caseSensitive=false] - Case sensitive matching
 * @returns {Promise<string[]>} Files that contain the pattern
 */
export async function filterByContent(files, contentFilter, options = {}) {
  const { regex = false, caseSensitive = false } = options;

  const matchingFiles = [];
  let searchRegex;

  try {
    if (regex) {
      const flags = caseSensitive ? '' : 'i';
      searchRegex = new RegExp(contentFilter, flags);
    } else {
      const escapedPattern = contentFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = caseSensitive ? '' : 'i';
      searchRegex = new RegExp(escapedPattern, flags);
    }
  } catch (error) {
    throw new Error(`Invalid content filter pattern: ${error.message}`);
  }

  // Process files in batches
  const batchSize = 20;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        
        if (searchRegex.test(content)) {
          return filePath;
        }
      } catch (error) {
        console.warn(`Warning: Could not read file for content filtering ${filePath}: ${error.message}`);
      }

      return null;
    });

    const batchResults = await Promise.all(batchPromises);
    matchingFiles.push(...batchResults.filter(file => file !== null));
  }

  return matchingFiles;
}