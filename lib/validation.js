/**
 * Configuration validation utilities for dir2txt
 * Provides comprehensive validation, sanitization, and error reporting
 */

/**
 * Validation error class for configuration issues
 */
export class ConfigValidationError extends Error {
  constructor(message, field = null, value = null) {
    super(message);
    this.name = 'ConfigValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Validates if a value is a non-empty array
 */
function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Validates if a value is a valid file extension
 */
function isValidExtension(ext) {
  if (typeof ext !== 'string') return false;
  if (ext.length === 0) return false;
  
  // Must start with a dot
  if (!ext.startsWith('.')) return false;
  
  // Must contain only valid characters (alphanumeric, dash, underscore)
  const validChars = /^\.[\w-]+$/;
  return validChars.test(ext);
}

/**
 * Validates if a value is a valid glob pattern
 */
function isValidGlobPattern(pattern) {
  if (typeof pattern !== 'string') return false;
  if (pattern.length === 0) return false;
  
  // Basic validation - no null bytes or control characters
  if (pattern.includes('\0') || /[\x00-\x1f]/.test(pattern)) return false;
  
  // Must not be just whitespace
  if (pattern.trim().length === 0) return false;
  
  return true;
}

/**
 * Validates if a value is a valid file size in bytes
 */
function isValidFileSize(size) {
  if (typeof size !== 'number') return false;
  if (!Number.isInteger(size)) return false;
  if (size < 0) return false;
  if (size > Number.MAX_SAFE_INTEGER) return false;
  
  // Reasonable limits: max 10GB
  const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024;
  return size <= MAX_FILE_SIZE;
}

/**
 * Validates ignore patterns array
 */
function validateIgnorePatterns(patterns, field = 'ignorePatterns') {
  const errors = [];
  
  if (patterns === undefined || patterns === null) {
    return { isValid: true, sanitized: [], errors: [] };
  }
  
  if (!Array.isArray(patterns)) {
    errors.push(new ConfigValidationError(`${field} must be an array`, field, patterns));
    return { isValid: false, sanitized: [], errors };
  }
  
  const sanitized = [];
  
  patterns.forEach((pattern, index) => {
    if (!isValidGlobPattern(pattern)) {
      errors.push(new ConfigValidationError(
        `Invalid glob pattern at index ${index}: "${pattern}"`, 
        `${field}[${index}]`, 
        pattern
      ));
    } else {
      // Sanitize by trimming whitespace
      const clean = pattern.trim();
      if (clean && !sanitized.includes(clean)) {
        sanitized.push(clean);
      }
    }
  });
  
  return {
    isValid: errors.length === 0,
    sanitized,
    errors
  };
}

/**
 * Validates include extensions array
 */
function validateIncludeExtensions(extensions, field = 'includeExtensions') {
  const errors = [];
  
  if (extensions === undefined || extensions === null) {
    return { isValid: true, sanitized: [], errors: [] };
  }
  
  if (!Array.isArray(extensions)) {
    errors.push(new ConfigValidationError(`${field} must be an array`, field, extensions));
    return { isValid: false, sanitized: [], errors };
  }
  
  const sanitized = [];
  
  extensions.forEach((ext, index) => {
    if (!isValidExtension(ext)) {
      errors.push(new ConfigValidationError(
        `Invalid file extension at index ${index}: "${ext}". Extensions must start with a dot and contain only alphanumeric characters, dashes, or underscores.`,
        `${field}[${index}]`,
        ext
      ));
    } else {
      // Sanitize by normalizing case and removing duplicates
      const clean = ext.toLowerCase().trim();
      if (!sanitized.includes(clean)) {
        sanitized.push(clean);
      }
    }
  });
  
  return {
    isValid: errors.length === 0,
    sanitized,
    errors
  };
}

/**
 * Validates max file size
 */
function validateMaxFileSize(size, field = 'maxFileSize') {
  const errors = [];
  
  if (size === undefined || size === null) {
    return { isValid: true, sanitized: null, errors: [] };
  }
  
  if (!isValidFileSize(size)) {
    let message = `Invalid ${field}: ${size}. `;
    if (typeof size !== 'number') {
      message += 'Must be a number.';
    } else if (!Number.isInteger(size)) {
      message += 'Must be an integer.';
    } else if (size < 0) {
      message += 'Must be non-negative.';
    } else {
      message += 'Must be within reasonable limits (max 10GB).';
    }
    
    errors.push(new ConfigValidationError(message, field, size));
    return { isValid: false, sanitized: null, errors };
  }
  
  return {
    isValid: true,
    sanitized: size,
    errors: []
  };
}

/**
 * Validates max directory depth
 */
function validateMaxDepth(depth, field = 'maxDepth') {
  const errors = [];
  
  if (depth === undefined || depth === null) {
    return { isValid: true, sanitized: null, errors: [] };
  }
  
  if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 1 || depth > 100) {
    errors.push(new ConfigValidationError(
      `Invalid ${field}: ${depth}. Must be an integer between 1 and 100.`,
      field,
      depth
    ));
    return { isValid: false, sanitized: null, errors };
  }
  
  return {
    isValid: true,
    sanitized: depth,
    errors: []
  };
}

/**
 * Validates concurrency setting
 */
function validateConcurrency(concurrency, field = 'concurrency') {
  const errors = [];
  
  if (concurrency === undefined || concurrency === null) {
    return { isValid: true, sanitized: null, errors: [] };
  }
  
  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) {
    errors.push(new ConfigValidationError(
      `Invalid ${field}: ${concurrency}. Must be an integer between 1 and 100.`,
      field,
      concurrency
    ));
    return { isValid: false, sanitized: null, errors };
  }
  
  return {
    isValid: true,
    sanitized: concurrency,
    errors: []
  };
}

/**
 * Validates boolean configuration options
 */
function validateBoolean(value, field) {
  const errors = [];
  
  if (value === undefined || value === null) {
    return { isValid: true, sanitized: null, errors: [] };
  }
  
  if (typeof value !== 'boolean') {
    errors.push(new ConfigValidationError(
      `Invalid ${field}: ${value}. Must be true or false.`,
      field,
      value
    ));
    return { isValid: false, sanitized: null, errors };
  }
  
  return {
    isValid: true,
    sanitized: value,
    errors: []
  };
}

/**
 * Comprehensive configuration validation
 */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    return {
      isValid: false,
      sanitized: {},
      errors: [new ConfigValidationError('Configuration must be an object', 'config', config)]
    };
  }
  
  const allErrors = [];
  const sanitized = {};
  
  // Validate each field
  const ignoreResult = validateIgnorePatterns(config.ignorePatterns);
  const extensionsResult = validateIncludeExtensions(config.includeExtensions);
  const sizeResult = validateMaxFileSize(config.maxFileSize);
  const depthResult = validateMaxDepth(config.maxDepth);
  const concurrencyResult = validateConcurrency(config.concurrency);
  const excludeLargeResult = validateBoolean(config.excludeLarge, 'excludeLarge');
  const followSymlinksResult = validateBoolean(config.followSymlinks, 'followSymlinks');
  
  // Collect all errors
  allErrors.push(...ignoreResult.errors);
  allErrors.push(...extensionsResult.errors);
  allErrors.push(...sizeResult.errors);
  allErrors.push(...depthResult.errors);
  allErrors.push(...concurrencyResult.errors);
  allErrors.push(...excludeLargeResult.errors);
  allErrors.push(...followSymlinksResult.errors);
  
  // Build sanitized config
  if (ignoreResult.sanitized.length > 0) {
    sanitized.ignorePatterns = ignoreResult.sanitized;
  }
  if (extensionsResult.sanitized.length > 0) {
    sanitized.includeExtensions = extensionsResult.sanitized;
  }
  if (sizeResult.sanitized !== null) {
    sanitized.maxFileSize = sizeResult.sanitized;
  }
  if (depthResult.sanitized !== null) {
    sanitized.maxDepth = depthResult.sanitized;
  }
  if (concurrencyResult.sanitized !== null) {
    sanitized.concurrency = concurrencyResult.sanitized;
  }
  if (excludeLargeResult.sanitized !== null) {
    sanitized.excludeLarge = excludeLargeResult.sanitized;
  }
  if (followSymlinksResult.sanitized !== null) {
    sanitized.followSymlinks = followSymlinksResult.sanitized;
  }
  
  // Check for unknown fields
  const knownFields = new Set([
    'ignorePatterns', 'includeExtensions', 'maxFileSize', 'maxDepth', 
    'concurrency', 'excludeLarge', 'followSymlinks'
  ]);
  
  Object.keys(config).forEach(field => {
    if (!knownFields.has(field)) {
      allErrors.push(new ConfigValidationError(
        `Unknown configuration field: "${field}". This field will be ignored.`,
        field,
        config[field]
      ));
    }
  });
  
  return {
    isValid: allErrors.length === 0,
    sanitized,
    errors: allErrors,
    warnings: allErrors.filter(e => e.message.includes('Unknown configuration field'))
  };
}

/**
 * Formats validation errors for user display
 */
export function formatValidationErrors(errors, warnings = []) {
  if (errors.length === 0 && warnings.length === 0) {
    return '';
  }
  
  let output = '';
  
  if (errors.length > 0) {
    output += '❌ Configuration Errors:\n';
    errors.forEach((error, index) => {
      output += `   ${index + 1}. ${error.message}\n`;
      if (error.field) {
        output += `      Field: ${error.field}\n`;
      }
      if (error.value !== null && error.value !== undefined) {
        output += `      Value: ${JSON.stringify(error.value)}\n`;
      }
    });
    output += '\n';
  }
  
  if (warnings.length > 0) {
    output += '⚠️  Configuration Warnings:\n';
    warnings.forEach((warning, index) => {
      output += `   ${index + 1}. ${warning.message}\n`;
    });
    output += '\n';
  }
  
  return output;
}

/**
 * Validates configuration and provides helpful suggestions
 */
export function validateConfigWithSuggestions(config) {
  const result = validateConfig(config);
  const suggestions = [];
  
  // Add helpful suggestions based on common issues
  if (result.errors.some(e => e.field?.includes('ignorePatterns'))) {
    suggestions.push('💡 Common ignore patterns: "node_modules/**", "*.log", ".git/**", "dist/**"');
  }
  
  if (result.errors.some(e => e.field?.includes('includeExtensions'))) {
    suggestions.push('💡 Extensions must start with a dot: ".js", ".ts", ".md", ".json"');
  }
  
  if (result.errors.some(e => e.field?.includes('maxFileSize'))) {
    suggestions.push('💡 File size in bytes. Examples: 1048576 (1MB), 5242880 (5MB)');
  }
  
  return {
    ...result,
    suggestions
  };
}

/**
 * Quick validation for common config operations
 */
export const validators = {
  extension: isValidExtension,
  globPattern: isValidGlobPattern,
  fileSize: isValidFileSize,
  isArray: isNonEmptyArray
};