/**
 * File Relationship Analysis Module
 * Detects imports, exports, dependencies, and file relationships
 */

import path from 'path';
import { promises as fs } from 'fs';

/**
 * Language-specific import/export patterns
 */
const IMPORT_PATTERNS = {
  javascript: [
    // ES6 imports
    /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"`]([^'"`]+)['"`]/g,
    // CommonJS require
    /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    // Dynamic imports
    /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g
  ],
  typescript: [
    // Same as JavaScript plus TypeScript-specific
    /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"`]([^'"`]+)['"`]/g,
    /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    // TypeScript imports
    /import\s+type\s+(?:\{[^}]*\}|\w+)\s+from\s+['"`]([^'"`]+)['"`]/g
  ],
  python: [
    // Python imports
    /^from\s+([^\s]+)\s+import/gm,
    /^import\s+([^\s,]+)/gm,
    /^import\s+([^,]+)/gm
  ],
  java: [
    // Java imports
    /^import\s+(?:static\s+)?([^;]+);/gm
  ],
  cpp: [
    // C/C++ includes
    /^#include\s*[<"]([^>"]+)[">]/gm
  ],
  csharp: [
    // C# using statements
    /^using\s+([^;]+);/gm
  ],
  go: [
    // Go imports
    /^import\s+"([^"]+)"/gm,
    /^import\s+\(\s*([^)]+)\s*\)/gms
  ],
  rust: [
    // Rust use statements
    /^use\s+([^;]+);/gm
  ]
};

/**
 * Export patterns for different languages
 */
const EXPORT_PATTERNS = {
  javascript: [
    /export\s+(?:default\s+)?(?:const|let|var|function|class)\s+(\w+)/g,
    /export\s+\{([^}]+)\}/g,
    /export\s+\*\s+from\s+['"`]([^'"`]+)['"`]/g,
    /module\.exports\s*=\s*(\w+)/g
  ],
  typescript: [
    /export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g,
    /export\s+\{([^}]+)\}/g,
    /export\s+\*\s+from\s+['"`]([^'"`]+)['"`]/g
  ],
  python: [
    /^def\s+(\w+)\(/gm,
    /^class\s+(\w+)/gm,
    /^(\w+)\s*=/gm
  ],
  java: [
    /public\s+(?:static\s+)?(?:class|interface|enum)\s+(\w+)/g,
    /public\s+(?:static\s+)?[^(]+\s+(\w+)\s*\(/g
  ]
};


/**
 * Detect the language of a file based on extension and content
 */
function detectLanguage(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  
  const languageMap = {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'cpp',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.vue': 'vue',
    '.php': 'php'
  };

  return languageMap[ext] || 'unknown';
}

/**
 * Extract imports from file content based on language
 */
function extractImports(content, language, filePath) {
  const imports = [];
  const patterns = IMPORT_PATTERNS[language] || [];
  
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    
    while ((match = regex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath) {
        imports.push({
          path: importPath,
          line: content.substr(0, match.index).split('\n').length,
          raw: match[0],
          resolved: resolveImportPath(importPath, filePath)
        });
      }
    }
  }
  
  return imports;
}

/**
 * Extract exports from file content based on language
 */
function extractExports(content, language) {
  const exports = [];
  const patterns = EXPORT_PATTERNS[language] || [];
  
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    
    while ((match = regex.exec(content)) !== null) {
      const exportName = match[1];
      if (exportName) {
        exports.push({
          name: exportName.trim(),
          line: content.substr(0, match.index).split('\n').length,
          raw: match[0]
        });
      }
    }
  }
  
  return exports;
}

/**
 * Resolve relative import paths to absolute paths
 */
function resolveImportPath(importPath, fromFile) {
  if (importPath.startsWith('.')) {
    const fromDir = path.dirname(fromFile);
    return path.resolve(fromDir, importPath);
  }
  return importPath; // External module or absolute path
}


/**
 * Generate a brief summary of file purpose based on content analysis
 */
function generateFileSummary(content, filePath, language, imports, exports) {
  const fileName = path.basename(filePath);
  const fileDir = path.dirname(filePath);
  
  // Analyze content patterns
  const patterns = {
    isTest: /test|spec|\.test\.|\.spec\./i.test(fileName),
    isConfig: /config|setup|webpack|babel|jest|\.config\./i.test(fileName),
    isComponent: /component|\.component\./i.test(fileName),
    isService: /service|api|client|\.service\./i.test(fileName),
    isUtil: /util|helper|common|shared/i.test(fileName),
    isModel: /model|entity|schema|\.model\./i.test(fileName),
    isRoute: /route|router|controller|\.route\./i.test(fileName),
    isMiddleware: /middleware|auth|guard/i.test(fileName),
    hasClass: /class\s+\w+/g.test(content),
    hasFunction: /function\s+\w+|const\s+\w+\s*=\s*\(|def\s+\w+/g.test(content)
  };
  
  // Generate summary based on patterns
  let summary = '';
  
  if (patterns.isTest) {
    summary = `Test file for ${fileName.replace(/\.(test|spec)\.[^.]+$/, '')}`;
  } else if (patterns.isConfig) {
    summary = `Configuration file for project setup`;
  } else if (patterns.isComponent) {
    summary = `Component module - ${fileName.replace(/\.[^.]+$/, '')}`;
  } else if (patterns.isService) {
    summary = `Service module for application logic`;
  } else if (patterns.isRoute) {
    summary = `Route handler for API endpoints`;
  } else if (patterns.isMiddleware) {
    summary = `Middleware for request processing`;
  } else if (patterns.isModel) {
    summary = `Data model definition`;
  } else if (patterns.isUtil) {
    summary = `Utility functions and helpers`;
  } else if (patterns.hasClass && patterns.hasFunction) {
    summary = `Class-based module with utility functions`;
  } else if (patterns.hasClass) {
    summary = `Class definition for ${fileName.replace(/\.[^.]+$/, '')}`;
  } else if (patterns.hasFunction) {
    summary = `Function definitions and utilities`;
  } else if (exports.length > 0) {
    summary = `Module exporting ${exports.length} item${exports.length > 1 ? 's' : ''}`;
  } else {
    summary = `${language} source file`;
  }
  
  return summary;
}

/**
 * Analyze relationships for a single file
 */
export async function analyzeFileRelationships(filePath, content) {
  try {
    const language = detectLanguage(filePath, content);
    const imports = extractImports(content, language, filePath);
    const exports = extractExports(content, language);
    const summary = generateFileSummary(content, filePath, language, imports, exports);
    
    return {
      filePath,
      language,
      summary,
      imports,
      exports,
      stats: {
        importCount: imports.length,
        exportCount: exports.length
      }
    };
  } catch (error) {
    return {
      filePath,
      language: 'unknown',
      summary: 'Unable to analyze file',
      imports: [],
      exports: [],
      stats: { importCount: 0, exportCount: 0 },
      error: error.message
    };
  }
}

/**
 * Analyze relationships for multiple files
 */
export async function analyzeProjectRelationships(files) {
  const relationships = new Map();
  const dependencyGraph = new Map();
  
  // First pass: analyze each file
  for (const file of files) {
    // Handle both string paths and objects with path property
    const filePath = typeof file === 'string' ? file : file.path;
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const analysis = await analyzeFileRelationships(filePath, content);
      relationships.set(filePath, analysis);
    } catch (error) {
      relationships.set(filePath, {
        filePath: filePath,
        language: 'unknown',
        summary: 'Unable to read file',
        imports: [],
        exports: [],
        stats: { importCount: 0, exportCount: 0 },
        error: error.message
      });
    }
  }
  
  // Second pass: resolve dependencies and build graph
  for (const [filePath, analysis] of relationships) {
    const dependencies = [];
    const dependents = [];
    
    // Find files this one depends on
    for (const importInfo of analysis.imports) {
      // Check both the original path and resolved path
      const originalPath = importInfo.path;
      const resolvedPath = importInfo.resolved;
      
      // Look for exact matches first
      for (const [candidatePath] of relationships) {
        if (candidatePath === resolvedPath || 
            candidatePath === originalPath ||
            candidatePath.endsWith(originalPath) ||
            (originalPath.startsWith('./') && candidatePath.endsWith(originalPath.substring(2)))) {
          if (!dependencies.includes(candidatePath)) {
            dependencies.push(candidatePath);
          }
        }
      }
    }
    
    // Find files that depend on this one
    for (const [otherPath, otherAnalysis] of relationships) {
      if (otherPath !== filePath) {
        for (const importInfo of otherAnalysis.imports) {
          const originalPath = importInfo.path;
          const resolvedPath = importInfo.resolved;
          
          if (filePath === resolvedPath || 
              filePath === originalPath ||
              filePath.endsWith(originalPath) ||
              (originalPath.startsWith('./') && filePath.endsWith(originalPath.substring(2)))) {
            if (!dependents.includes(otherPath)) {
              dependents.push(otherPath);
            }
          }
        }
      }
    }
    
    dependencyGraph.set(filePath, {
      dependencies,
      dependents,
      isLeaf: dependencies.length === 0,
      isRoot: dependents.length === 0
    });
  }
  
  return {
    relationships,
    dependencyGraph,
    stats: {
      totalFiles: files.length,
      analyzedFiles: relationships.size,
      totalImports: Array.from(relationships.values()).reduce((sum, r) => sum + r.stats.importCount, 0),
      totalExports: Array.from(relationships.values()).reduce((sum, r) => sum + r.stats.exportCount, 0)
    }
  };
}

/**
 * Group files by functionality based on their relationships and content
 */
export function groupFilesByFunction(relationships, dependencyGraph) {
  const groups = new Map();
  
  // Group by file patterns and directory structure
  for (const [filePath] of relationships) {
    const parts = filePath.split(path.sep);
    const category = parts[parts.length - 2] || 'root'; // Parent directory
    
    if (!groups.has(category)) {
      groups.set(category, new Set());
    }
    groups.get(category).add(filePath);
  }
  
  return groups;
}

/**
 * Generate a text-based dependency graph
 */
export function generateDependencyGraph(relationships, dependencyGraph, maxDepth = 3) {
  const graph = [];
  const visited = new Set();
  
  // Find root files (files with no dependents or few dependents)
  const rootFiles = Array.from(dependencyGraph.entries())
    .filter(([_, info]) => info.dependents.length <= 2)
    .map(([path]) => path)
    .slice(0, 10); // Limit to prevent overwhelming output
  
  function buildTree(filePath, depth = 0, prefix = '') {
    if (depth > maxDepth || visited.has(filePath)) {
      return;
    }
    
    visited.add(filePath);
    const analysis = relationships.get(filePath);
    const deps = dependencyGraph.get(filePath);
    
    if (!analysis || !deps) return;
    
    const fileName = path.basename(filePath);
    const indent = '  '.repeat(depth);
    
    graph.push(`${indent}${prefix}${fileName} (${analysis.language})`);
    
    if (deps.dependencies.length > 0) {
      for (let i = 0; i < Math.min(deps.dependencies.length, 5); i++) {
        const depPath = deps.dependencies[i];
        const isLast = i === Math.min(deps.dependencies.length, 5) - 1;
        const newPrefix = isLast ? '└── ' : '├── ';
        buildTree(depPath, depth + 1, newPrefix);
      }
      
      if (deps.dependencies.length > 5) {
        graph.push(`${indent}  └── ... and ${deps.dependencies.length - 5} more`);
      }
    }
  }
  
  for (const rootFile of rootFiles) {
    buildTree(rootFile);
    graph.push(''); // Empty line between trees
  }
  
  return graph.join('\n');
}