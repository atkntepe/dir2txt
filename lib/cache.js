/**
 * Incremental Processing & Caching Module
 * Handles file change detection, caching, and incremental updates
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default cache directory
 */
const DEFAULT_CACHE_DIR = '.dir2txt-cache';

/**
 * Cache file names
 */
const CACHE_FILES = {
  metadata: 'metadata.json',
  snapshot: 'snapshot.json',
  relationships: 'relationships.json',
  config: 'cache-config.json'
};

/**
 * Cache system for incremental processing
 */
export class CacheManager {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
    this.workingDir = options.workingDir || process.cwd();
    this.cachePath = path.resolve(this.workingDir, this.cacheDir);
    this.metadata = new Map();
    this.snapshot = new Map();
    this.relationships = new Map();
    this.enabled = options.enabled !== false;
  }

  /**
   * Initialize cache directory and load existing data
   */
  async initialize() {
    if (!this.enabled) return;

    try {
      // Create cache directory if it doesn't exist
      await fs.mkdir(this.cachePath, { recursive: true });
      
      // Load existing cache data
      await this.loadMetadata();
      await this.loadSnapshot();
      await this.loadRelationships();
      
      console.log(`📦 Cache initialized at: ${this.cacheDir}`);
    } catch (error) {
      console.warn(`⚠️  Cache initialization failed: ${error.message}`);
      this.enabled = false;
    }
  }

  /**
   * Get file hash for change detection
   */
  async getFileHash(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Create hash from content + mtime for faster comparison
      const hash = crypto
        .createHash('sha256')
        .update(content + stats.mtime.toISOString())
        .digest('hex');
      
      return {
        hash,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        content
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if file has changed since last cache
   */
  async hasFileChanged(filePath) {
    if (!this.enabled) return true;

    const cached = this.metadata.get(filePath);
    if (!cached) return true;

    try {
      const stats = await fs.stat(filePath);
      const cachedMtime = new Date(cached.mtime);
      
      // Quick check: compare modification times
      if (stats.mtime > cachedMtime) return true;
      
      // If mtime is the same, assume unchanged (optimization)
      return false;
    } catch (error) {
      return true; // File doesn't exist or error occurred
    }
  }

  /**
   * Get changed files since last run
   */
  async getChangedFiles(allFiles) {
    if (!this.enabled) return { changed: allFiles, new: allFiles, deleted: [] };

    const changed = [];
    const newFiles = [];
    const existingFiles = new Set();

    // Check each file for changes
    for (const filePath of allFiles) {
      existingFiles.add(filePath);
      
      if (await this.hasFileChanged(filePath)) {
        changed.push(filePath);
        
        if (!this.metadata.has(filePath)) {
          newFiles.push(filePath);
        }
      }
    }

    // Find deleted files
    const deleted = [];
    for (const cachedFile of this.metadata.keys()) {
      if (!existingFiles.has(cachedFile)) {
        deleted.push(cachedFile);
      }
    }

    return { changed, new: newFiles, deleted };
  }

  /**
   * Update cache with file data
   */
  async updateFileCache(filePath, data) {
    if (!this.enabled) return;

    const fileInfo = await this.getFileHash(filePath);
    if (!fileInfo) return;

    // Store metadata
    this.metadata.set(filePath, {
      hash: fileInfo.hash,
      size: fileInfo.size,
      mtime: fileInfo.mtime,
      lastProcessed: new Date().toISOString()
    });

    // Store snapshot data if provided
    if (data) {
      this.snapshot.set(filePath, {
        ...data,
        cachedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Update relationships cache
   */
  async updateRelationshipsCache(relationships) {
    if (!this.enabled || !relationships) return;

    this.relationships = relationships;
    await this.saveRelationships();
  }

  /**
   * Get cached file data
   */
  getCachedFile(filePath) {
    if (!this.enabled) return null;
    return this.snapshot.get(filePath);
  }

  /**
   * Get cached relationships
   */
  getCachedRelationships() {
    if (!this.enabled) return null;
    return this.relationships;
  }

  /**
   * Save metadata to disk
   */
  async saveMetadata() {
    if (!this.enabled) return;

    try {
      const metadataPath = path.join(this.cachePath, CACHE_FILES.metadata);
      const data = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        workingDir: this.workingDir,
        files: Object.fromEntries(this.metadata)
      };
      
      await fs.writeFile(metadataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn(`⚠️  Failed to save metadata: ${error.message}`);
    }
  }

  /**
   * Load metadata from disk
   */
  async loadMetadata() {
    try {
      const metadataPath = path.join(this.cachePath, CACHE_FILES.metadata);
      const data = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      
      if (data.files) {
        this.metadata = new Map(Object.entries(data.files));
      }
    } catch (error) {
      // Cache doesn't exist yet, start fresh
      this.metadata = new Map();
    }
  }

  /**
   * Save snapshot to disk
   */
  async saveSnapshot() {
    if (!this.enabled) return;

    try {
      const snapshotPath = path.join(this.cachePath, CACHE_FILES.snapshot);
      const data = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        files: Object.fromEntries(this.snapshot)
      };
      
      await fs.writeFile(snapshotPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn(`⚠️  Failed to save snapshot: ${error.message}`);
    }
  }

  /**
   * Load snapshot from disk
   */
  async loadSnapshot() {
    try {
      const snapshotPath = path.join(this.cachePath, CACHE_FILES.snapshot);
      const data = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
      
      if (data.files) {
        this.snapshot = new Map(Object.entries(data.files));
      }
    } catch (error) {
      this.snapshot = new Map();
    }
  }

  /**
   * Save relationships to disk
   */
  async saveRelationships() {
    if (!this.enabled) return;

    try {
      const relationshipsPath = path.join(this.cachePath, CACHE_FILES.relationships);
      const data = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        relationships: this.relationships
      };
      
      await fs.writeFile(relationshipsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn(`⚠️  Failed to save relationships: ${error.message}`);
    }
  }

  /**
   * Load relationships from disk
   */
  async loadRelationships() {
    try {
      const relationshipsPath = path.join(this.cachePath, CACHE_FILES.relationships);
      const data = JSON.parse(await fs.readFile(relationshipsPath, 'utf8'));
      
      if (data.relationships) {
        this.relationships = data.relationships;
      }
    } catch (error) {
      this.relationships = new Map();
    }
  }

  /**
   * Clean up deleted files from cache
   */
  async cleanup(deletedFiles) {
    if (!this.enabled || !deletedFiles.length) return;

    for (const filePath of deletedFiles) {
      this.metadata.delete(filePath);
      this.snapshot.delete(filePath);
    }

    await this.saveMetadata();
    await this.saveSnapshot();
    
    console.log(`🧹 Cleaned up ${deletedFiles.length} deleted files from cache`);
  }

  /**
   * Clear entire cache
   */
  async clear() {
    if (!this.enabled) return;

    try {
      // Remove cache directory
      await fs.rm(this.cachePath, { recursive: true, force: true });
      
      // Reset in-memory data
      this.metadata.clear();
      this.snapshot.clear();
      this.relationships = new Map();
      
      console.log(`🗑️  Cache cleared: ${this.cacheDir}`);
    } catch (error) {
      console.warn(`⚠️  Failed to clear cache: ${error.message}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      cacheDir: this.cacheDir,
      files: this.metadata.size,
      snapshots: this.snapshot.size,
      relationships: this.relationships.size || 0
    };
  }

  /**
   * Save all cache data
   */
  async save() {
    if (!this.enabled) return;

    await Promise.all([
      this.saveMetadata(),
      this.saveSnapshot(),
      this.saveRelationships()
    ]);
  }
}

/**
 * Create and initialize cache manager
 */
export async function createCache(options = {}) {
  const cache = new CacheManager(options);
  await cache.initialize();
  return cache;
}

/**
 * Process files incrementally using cache
 */
export async function processIncremental(files, cache, processor) {
  if (!cache.enabled) {
    // If cache is disabled, process all files normally
    return await processor(files);
  }

  const { changed, new: newFiles, deleted } = await cache.getChangedFiles(files);
  
  if (changed.length === 0 && deleted.length === 0) {
    console.log('✅ No changes detected, using cached data');
    return cache.getCachedRelationships() || await processor([]);
  }

  console.log(`📊 Processing changes: ${changed.length} changed, ${newFiles.length} new, ${deleted.length} deleted`);
  
  if (newFiles.length > 0) {
    console.log(`   📄 New files: ${newFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}${newFiles.length > 3 ? ` (+${newFiles.length - 3} more)` : ''}`);
  }
  
  if (deleted.length > 0) {
    console.log(`   🗑️  Deleted files: ${deleted.slice(0, 3).map(f => path.basename(f)).join(', ')}${deleted.length > 3 ? ` (+${deleted.length - 3} more)` : ''}`);
  }

  // Clean up deleted files from cache
  await cache.cleanup(deleted);

  // Process only changed files
  const result = await processor(changed);

  // Update cache with processed files
  for (const filePath of changed) {
    await cache.updateFileCache(filePath, { processed: true });
  }

  // Save cache
  await cache.save();

  return result;
}