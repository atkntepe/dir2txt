import { promises as fs } from 'fs';
import path from 'path';

const CONFIG_FILE = '.dir2txt.json';

/**
 * Default configuration object with sensible defaults
 */
const DEFAULT_CONFIG = {
  ignorePatterns: [
    'node_modules/**',
    'dist/**',
    'build/**',
    '*.log',
    '.git/**',
    '.env*',
    'coverage/**',
    '.nyc_output/**'
  ],
  includeExtensions: [
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.json',
    '.md',
    '.txt',
    '.py',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.css',
    '.html',
    '.xml',
    '.yaml',
    '.yml'
  ],
  maxFileSize: 1048576 // 1MB in bytes
};

/**
 * Loads configuration from .dir2txt.json in the current working directory
 * @returns {Promise<Object>} Configuration object or empty object if no config exists
 */
export async function loadConfig() {
  try {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    // Validate and merge with defaults to ensure all required properties exist
    return {
      ignorePatterns: config.ignorePatterns || DEFAULT_CONFIG.ignorePatterns,
      includeExtensions: config.includeExtensions || DEFAULT_CONFIG.includeExtensions,
      maxFileSize: config.maxFileSize || DEFAULT_CONFIG.maxFileSize
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Config file doesn't exist, return empty object
      return {};
    }
    
    if (error instanceof SyntaxError) {
      console.warn(`Warning: Invalid JSON in ${CONFIG_FILE}. Using default configuration.`);
      return {};
    }
    
    console.warn(`Warning: Error reading config file: ${error.message}`);
    return {};
  }
}

/**
 * Creates a default .dir2txt.json configuration file in the current working directory
 * @returns {Promise<void>}
 */
export async function createDefaultConfig() {
  try {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const configData = JSON.stringify(DEFAULT_CONFIG, null, 2);
    await fs.writeFile(configPath, configData, 'utf8');
    console.log(`Created default configuration file: ${CONFIG_FILE}`);
  } catch (error) {
    console.error(`Error creating default config file: ${error.message}`);
    throw error;
  }
}

/**
 * Updates the existing configuration by merging with provided updates
 * @param {Object} updates - Configuration updates to merge
 * @returns {Promise<void>}
 */
export async function updateConfig(updates) {
  try {
    const currentConfig = await loadConfig();
    
    // Deep merge the updates with current config
    const updatedConfig = {
      ...currentConfig,
      ...updates
    };
    
    // Handle array merging for ignorePatterns and includeExtensions
    if (updates.ignorePatterns) {
      updatedConfig.ignorePatterns = Array.isArray(updates.ignorePatterns) 
        ? updates.ignorePatterns 
        : currentConfig.ignorePatterns || DEFAULT_CONFIG.ignorePatterns;
    }
    
    if (updates.includeExtensions) {
      updatedConfig.includeExtensions = Array.isArray(updates.includeExtensions)
        ? updates.includeExtensions
        : currentConfig.includeExtensions || DEFAULT_CONFIG.includeExtensions;
    }
    
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const configData = JSON.stringify(updatedConfig, null, 2);
    await fs.writeFile(configPath, configData, 'utf8');
    
    console.log(`Updated configuration file: ${CONFIG_FILE}`);
  } catch (error) {
    console.error(`Error updating config file: ${error.message}`);
    throw error;
  }
}

/**
 * Deletes the .dir2txt.json configuration file from the current working directory
 * @returns {Promise<void>}
 */
export async function deleteConfig() {
  try {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    await fs.unlink(configPath);
    console.log(`Deleted configuration file: ${CONFIG_FILE}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Configuration file ${CONFIG_FILE} does not exist.`);
      return;
    }
    
    console.error(`Error deleting config file: ${error.message}`);
    throw error;
  }
}

/**
 * Gets the default configuration object
 * @returns {Object} Default configuration
 */
export function getDefaultConfig() {
  return { ...DEFAULT_CONFIG };
}