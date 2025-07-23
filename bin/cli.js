#!/usr/bin/env node

/**
 * dir2txt CLI - Convert project directory structure and files to text for LLMs
 * 
 * Usage Examples:
 * 
 * Basic usage (generate text from current directory):
 *   dir2txt run
 * 
 * Generate with specific options:
 *   dir2txt run --dry                    # Only show file tree, no content
 *   dir2txt run --output project.txt     # Save to file
 *   dir2txt run --clipboard              # Copy to clipboard
 *   dir2txt run --max-size 512000        # Limit file size to 512KB
 *   dir2txt run --noconfig               # Ignore .dir2txt.json config
 *   dir2txt run --markdown               # Output in markdown format
 *   dir2txt run --ignore "*.test.js"     # Add extra ignore patterns
 * 
 * Config management:
 *   dir2txt config                       # Create default .dir2txt.json
 *   dir2txt update --add "*.test.js"     # Add ignore pattern
 *   dir2txt update --remove "dist/**"    # Remove ignore pattern
 *   dir2txt templates --list             # Show project templates
 *   dir2txt templates --apply node       # Apply Node.js template
 *   dir2txt delete                       # Delete config file
 * 
 * Help and version:
 *   dir2txt --help                       # Show help
 *   dir2txt --version                    # Show version
 */

import { Command } from 'commander';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

// Import our library modules
import { getFiles } from '../lib/traverse.js';
import { generateText, generatePreview } from '../lib/generate.js';
import { 
  loadConfig, 
  createDefaultConfig, 
  updateConfig, 
  deleteConfig,
  getDefaultConfig 
} from '../lib/config.js';

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packagePath = path.join(__dirname, '..', 'package.json');

let packageInfo;
try {
  const packageData = await fs.readFile(packagePath, 'utf8');
  packageInfo = JSON.parse(packageData);
} catch (error) {
  packageInfo = { version: '1.0.0', description: 'Convert directory structure to text' };
}

const program = new Command();

// Set up program info
program
  .name('dir2txt')
  .description(packageInfo.description || 'Convert project directory structure and files to text for LLMs')
  .version(packageInfo.version || '1.0.0');

/**
 * Main run command - generates text output from directory
 */
program
  .command('run')
  .description('Generate text from directory structure and files')
  .option('--dry', 'Only show file tree, no file contents')
  .option('--output <file>', 'Output to file instead of stdout')
  .option('--clipboard', 'Copy output to clipboard')
  .option('--max-size <bytes>', 'Maximum file size in bytes', parseInt)
  .option('--noconfig', 'Ignore .dir2txt.json config file')
  .option('--markdown', 'Output in markdown format')
  .option('--preview <count>', 'Show preview with first N files', parseInt)
  .option('--extensions <ext...>', 'Only include files with these extensions (e.g., .js .ts)')
  .option('--ignore <patterns...>', 'Additional ignore patterns (e.g., "*.test.js" "temp/**")')
  .option('--max-depth <depth>', 'Maximum directory depth to traverse', parseInt)
  .action(async (options) => {
    try {
      console.log('🔍 Starting dir2txt...');
      
      // Load configuration unless --noconfig is specified
      let config = {};
      if (!options.noconfig) {
        config = await loadConfig();
        if (Object.keys(config).length > 0) {
          console.log('📋 Using configuration from .dir2txt.json');
        }
      }
      
      // Build options for file traversal
      const traverseOptions = {
        includeExtensions: options.extensions || config.includeExtensions,
        maxDepth: options.maxDepth || config.maxDepth,
        maxFileSize: options.maxSize || config.maxFileSize,
        excludeLarge: true
      };
      
      // Add command-line ignore patterns if provided
      if (options.ignore && options.ignore.length > 0) {
        const baseIgnores = config.ignorePatterns || [];
        traverseOptions.ignorePatterns = [...baseIgnores, ...options.ignore];
      }
      
      // Get list of files
      console.log('📁 Scanning directory...');
      const files = await getFiles(traverseOptions);
      
      if (files.length === 0) {
        console.log('❌ No files found matching criteria');
        process.exit(1);
      }
      
      console.log(`✅ Found ${files.length} files`);
      
      // Generate output options
      const generateOptions = {
        dry: options.dry,
        outputFile: options.output,
        clipboard: options.clipboard,
        markdown: options.markdown,
        concurrency: 10
      };
      
      // Generate preview or full output
      if (options.preview) {
        await generatePreview(files, options.preview, generateOptions);
      } else {
        await generateText(files, generateOptions);
      }
      
      console.log('🎉 Generation complete!');
      
    } catch (error) {
      console.error('❌ Error during generation:', error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

/**
 * Config command - creates default configuration
 */
program
  .command('config')
  .description('Create default .dir2txt.json configuration file')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    try {
      if (options.show) {
        const config = await loadConfig();
        if (Object.keys(config).length === 0) {
          console.log('📋 No configuration file found. Default settings:');
          console.log(JSON.stringify(getDefaultConfig(), null, 2));
        } else {
          console.log('📋 Current configuration:');
          console.log(JSON.stringify(config, null, 2));
        }
        return;
      }
      
      await createDefaultConfig();
      console.log('✅ Created default configuration file');
      
    } catch (error) {
      console.error('❌ Error creating config:', error.message);
      process.exit(1);
    }
  });

/**
 * Update command - modifies existing configuration
 */
program
  .command('update')
  .description('Update configuration settings')
  .option('--add <pattern>', 'Add ignore pattern')
  .option('--remove <pattern>', 'Remove ignore pattern')
  .option('--max-size <bytes>', 'Set maximum file size', parseInt)
  .option('--add-ext <extension>', 'Add file extension to include')
  .option('--remove-ext <extension>', 'Remove file extension from include list')
  .action(async (options) => {
    try {
      const currentConfig = await loadConfig();
      const updates = {};
      
      // Handle ignore patterns
      if (options.add || options.remove) {
        const ignorePatterns = [...(currentConfig.ignorePatterns || [])];
        
        if (options.add) {
          if (!ignorePatterns.includes(options.add)) {
            ignorePatterns.push(options.add);
            console.log(`➕ Added ignore pattern: ${options.add}`);
          } else {
            console.log(`⚠️  Pattern already exists: ${options.add}`);
          }
        }
        
        if (options.remove) {
          const index = ignorePatterns.indexOf(options.remove);
          if (index !== -1) {
            ignorePatterns.splice(index, 1);
            console.log(`➖ Removed ignore pattern: ${options.remove}`);
          } else {
            console.log(`⚠️  Pattern not found: ${options.remove}`);
          }
        }
        
        updates.ignorePatterns = ignorePatterns;
      }
      
      // Handle file extensions
      if (options.addExt || options.removeExt) {
        const extensions = [...(currentConfig.includeExtensions || [])];
        
        if (options.addExt) {
          const ext = options.addExt.startsWith('.') ? options.addExt : '.' + options.addExt;
          if (!extensions.includes(ext)) {
            extensions.push(ext);
            console.log(`➕ Added extension: ${ext}`);
          } else {
            console.log(`⚠️  Extension already exists: ${ext}`);
          }
        }
        
        if (options.removeExt) {
          const ext = options.removeExt.startsWith('.') ? options.removeExt : '.' + options.removeExt;
          const index = extensions.indexOf(ext);
          if (index !== -1) {
            extensions.splice(index, 1);
            console.log(`➖ Removed extension: ${ext}`);
          } else {
            console.log(`⚠️  Extension not found: ${ext}`);
          }
        }
        
        updates.includeExtensions = extensions;
      }
      
      // Handle max file size
      if (options.maxSize !== undefined) {
        updates.maxFileSize = options.maxSize;
        console.log(`📏 Set max file size: ${options.maxSize} bytes`);
      }
      
      // Apply updates if any were made
      if (Object.keys(updates).length > 0) {
        await updateConfig(updates);
        console.log('✅ Configuration updated successfully');
      } else {
        console.log('ℹ️  No changes specified');
        console.log('Use --help to see available update options');
      }
      
    } catch (error) {
      console.error('❌ Error updating config:', error.message);
      process.exit(1);
    }
  });

/**
 * Delete command - removes configuration file
 */
program
  .command('delete')
  .description('Delete .dir2txt.json configuration file')
  .option('--force', 'Skip confirmation prompt')
  .action(async (options) => {
    try {
      if (!options.force) {
        // Simple confirmation (in a real app you might use inquirer)
        console.log('⚠️  This will delete the .dir2txt.json configuration file');
        console.log('Use --force to skip this confirmation');
        return;
      }
      
      await deleteConfig();
      console.log('✅ Configuration file deleted');
      
    } catch (error) {
      console.error('❌ Error deleting config:', error.message);
      process.exit(1);
    }
  });

/**
 * Templates command - shows or applies common project templates
 */
program
  .command('templates')
  .description('Show or apply common project ignore templates')
  .option('--list', 'List available templates')
  .option('--apply <template>', 'Apply a template to current config')
  .action(async (options) => {
    try {
      const templates = {
        node: {
          name: 'Node.js',
          ignorePatterns: ['node_modules/**', 'dist/**', 'build/**', '*.log', '.env*', 'coverage/**'],
          includeExtensions: ['.js', '.ts', '.jsx', '.tsx', '.json', '.md']
        },
        python: {
          name: 'Python',
          ignorePatterns: ['__pycache__/**', '*.pyc', '*.pyo', 'venv/**', '.venv/**', 'dist/**', '*.egg-info/**'],
          includeExtensions: ['.py', '.pyx', '.pyi', '.txt', '.md', '.yaml', '.yml', '.json']
        },
        java: {
          name: 'Java',
          ignorePatterns: ['target/**', 'build/**', '*.class', '*.jar', '*.war', '.gradle/**'],
          includeExtensions: ['.java', '.kt', '.scala', '.xml', '.properties', '.md']
        },
        web: {
          name: 'Web Frontend',
          ignorePatterns: ['node_modules/**', 'dist/**', 'build/**', '.next/**', '.nuxt/**', 'public/build/**'],
          includeExtensions: ['.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte', '.html', '.css', '.scss', '.json']
        },
        cpp: {
          name: 'C/C++',
          ignorePatterns: ['build/**', 'cmake-build-*/**', '*.o', '*.obj', '*.exe', '*.out', '*.a', '*.so'],
          includeExtensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.cmake', '.md']
        }
      };
      
      if (options.list) {
        console.log('📋 Available templates:');
        Object.entries(templates).forEach(([key, template]) => {
          console.log(`  ${key.padEnd(8)} - ${template.name}`);
        });
        console.log('\nUsage: dir2txt templates --apply <template>');
        return;
      }
      
      if (options.apply) {
        const template = templates[options.apply];
        if (!template) {
          console.error(`❌ Unknown template: ${options.apply}`);
          console.log('Use --list to see available templates');
          process.exit(1);
        }
        
        console.log(`📋 Applying ${template.name} template...`);
        await updateConfig({
          ignorePatterns: template.ignorePatterns,
          includeExtensions: template.includeExtensions
        });
        console.log(`✅ Applied ${template.name} template successfully`);
        return;
      }
      
      // Show help if no options
      console.log('📋 Project Templates');
      console.log('Use --list to see available templates');
      console.log('Use --apply <template> to apply a template');
      
    } catch (error) {
      console.error('❌ Error with templates:', error.message);
      process.exit(1);
    }
  });

/**
 * Status command - shows current directory info
 */
program
  .command('status')
  .description('Show current directory status and configuration')
  .action(async () => {
    try {
      console.log('📊 Directory Status:');
      console.log(`   Working Directory: ${process.cwd()}`);
      
      const config = await loadConfig();
      if (Object.keys(config).length > 0) {
        console.log('   Configuration: .dir2txt.json found');
        console.log(`   Ignore Patterns: ${config.ignorePatterns?.length || 0}`);
        console.log(`   Include Extensions: ${config.includeExtensions?.length || 0}`);
        console.log(`   Max File Size: ${config.maxFileSize || 'not set'}`);
      } else {
        console.log('   Configuration: Using defaults (.gitignore or built-in)');
      }
      
      // Quick file count
      const files = await getFiles({ excludeLarge: false });
      console.log(`   Total Files: ${files.length}`);
      
    } catch (error) {
      console.error('❌ Error getting status:', error.message);
      process.exit(1);
    }
  });

// Handle unknown commands
program.on('command:*', function (operands) {
  console.error(`❌ Unknown command: ${operands[0]}`);
  console.log('💡 Use --help to see available commands');
  process.exit(1);
});

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.DEBUG) {
    console.error(reason.stack);
  }
  process.exit(1);
});

/**
 * Beautiful welcome screen for new users
 */
function showWelcome() {
  console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ██████╗ ██╗██████╗ ██████╗ ████████╗██╗  ██╗████████╗                    │
│   ██╔══██╗██║██╔══██╗╚════██╗╚══██╔══╝╚██╗██╔╝╚══██╔══╝                    │
│   ██║  ██║██║██████╔╝ █████╔╝   ██║    ╚███╔╝    ██║                       │
│   ██║  ██║██║██╔══██╗██╔═══╝    ██║    ██╔██╗    ██║                       │
│   ██████╔╝██║██║  ██║███████╗   ██║   ██╔╝ ██╗   ██║                       │
│   ╚═════╝ ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝                       │
│                                                                             │
│                  Convert directories to LLM-friendly text                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

📚 QUICK START:

  Basic usage:
    dir2txt run                     # Generate text from current directory
    dir2txt run --clipboard         # Copy output to clipboard
    dir2txt run --dry               # Show file tree only
    dir2txt run --markdown          # Output in markdown format

  Configuration:
    dir2txt config                  # Create default configuration
    dir2txt templates --list        # Show project templates
    dir2txt templates --apply node  # Apply Node.js template

  Examples:
    dir2txt run --extensions .js .ts --output code.txt
    dir2txt run --ignore "*.test.js" --clipboard
    dir2txt run --preview 5 --markdown

📖 COMMON USE CASES:

  🤖 For AI Analysis:    dir2txt run --clipboard --extensions .js .ts
  📝 For Documentation:  dir2txt run --markdown --output docs/code.md
  🔍 Quick Preview:      dir2txt run --dry --preview 10
  📋 Copy to ChatGPT:    dir2txt run --clipboard --ignore "test/**"

💡 HELP:

    dir2txt --help          # Show all commands
    dir2txt <command> --help # Show command-specific help
    dir2txt status          # Show current directory status

🚀 Get started with: dir2txt run --dry
`);
}

// If no command provided, show welcome screen
if (process.argv.length <= 2) {
  showWelcome();
} else {
  // Parse command line arguments
  program.parse();
}