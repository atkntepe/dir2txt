import { createInterface } from 'readline';
import { promises as fs } from 'fs';
import path from 'path';
import { getFiles, getFileCount } from './traverse.js';
import { generateText, generatePreview } from './generate.js';
import { loadConfig, updateConfig } from './config.js';

/**
 * ANSI color codes for terminal styling
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bg: {
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m'
  }
};

/**
 * Simple readline interface wrapper
 */
class InteractivePrompt {
  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  close() {
    this.rl.close();
  }

  clearScreen() {
    console.clear();
  }

  showHeader() {
    console.log(`${colors.cyan}${colors.bright}
┌─────────────────────────────────────────────────────────────────────────────┐
│                       dir2txt Interactive Mode                              │
└─────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);
  }

  showDirectory() {
    const cwd = process.cwd();
    console.log(`${colors.blue}📁 Working Directory:${colors.reset} ${colors.dim}${cwd}${colors.reset}`);
  }

  async showProjectStats() {
    try {
      const fileCount = await getFileCount();
      const config = await loadConfig();
      
      console.log(`${colors.green}📊 Project Overview:${colors.reset}`);
      console.log(`   ${colors.dim}Total files: ${fileCount}${colors.reset}`);
      console.log(`   ${colors.dim}Configuration: ${Object.keys(config).length > 0 ? '.dir2txt.json found' : 'Using defaults'}${colors.reset}`);
      
      if (config.includeExtensions && config.includeExtensions.length > 0) {
        console.log(`   ${colors.dim}Extensions: ${config.includeExtensions.slice(0, 5).join(', ')}${config.includeExtensions.length > 5 ? '...' : ''}${colors.reset}`);
      }
      console.log('');
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Could not analyze project: ${error.message}${colors.reset}\n`);
    }
  }

  showMainMenu() {
    console.log(`${colors.yellow}❓ What would you like to do?${colors.reset}`);
    console.log(`   ${colors.green}1)${colors.reset} 📋 Generate and copy to clipboard`);
    console.log(`   ${colors.green}2)${colors.reset} 📄 Generate to file`);
    console.log(`   ${colors.green}3)${colors.reset} 👀 Preview first 10 files`);
    console.log(`   ${colors.green}4)${colors.reset} ⚙️  Configure filters and options`);
    console.log(`   ${colors.green}5)${colors.reset} 📊 View detailed project statistics`);
    console.log(`   ${colors.green}6)${colors.reset} 🔍 Browse and select files manually`);
    console.log(`   ${colors.green}7)${colors.reset} 📋 Quick templates (Node.js, Python, etc.)`);
    console.log(`   ${colors.green}8)${colors.reset} ❌ Exit`);
    console.log('');
  }

  async getMenuChoice() {
    const choice = await this.question(`${colors.cyan}➤ Enter your choice (1-8): ${colors.reset}`);
    return parseInt(choice.trim());
  }

  async getOutputFilename() {
    const filename = await this.question(`${colors.cyan}📄 Enter output filename (or press Enter for 'directory-output.txt'): ${colors.reset}`);
    return filename.trim() || 'directory-output.txt';
  }

  async getPreviewCount() {
    const count = await this.question(`${colors.cyan}👀 How many files to preview? (default: 10): ${colors.reset}`);
    const parsed = parseInt(count.trim());
    return isNaN(parsed) ? 10 : parsed;
  }

  async confirmAction(message) {
    const response = await this.question(`${colors.yellow}${message} (y/N): ${colors.reset}`);
    return response.toLowerCase().startsWith('y');
  }

  showSuccess(message) {
    console.log(`${colors.green}✅ ${message}${colors.reset}\n`);
  }

  showError(message) {
    console.log(`${colors.red}❌ ${message}${colors.reset}\n`);
  }

  showInfo(message) {
    console.log(`${colors.blue}ℹ️  ${message}${colors.reset}\n`);
  }
}

/**
 * Advanced file browser interface
 */
class FileBrowser {
  constructor(files) {
    this.files = files;
    this.selectedFiles = new Set(files); // All selected by default
    this.currentIndex = 0;
    this.viewOffset = 0;
    this.pageSize = 15;
  }

  async browse() {
    return new Promise((resolve) => {
      process.stdin.setRawMode(true);
      process.stdin.setEncoding('utf8');
      
      const handleKey = (key) => {
        switch (key) {
          case '\u0003': // Ctrl+C
            process.exit();
            break;
          case '\r': // Enter
            process.stdin.setRawMode(false);
            process.stdin.removeListener('data', handleKey);
            resolve(Array.from(this.selectedFiles));
            break;
          case 'q':
          case 'Q':
            process.stdin.setRawMode(false);
            process.stdin.removeListener('data', handleKey);
            resolve([]);
            break;
          case ' ': // Space - toggle selection
            this.toggleSelection();
            this.render();
            break;
          case '\u001b[A': // Up arrow
            this.moveUp();
            this.render();
            break;
          case '\u001b[B': // Down arrow
            this.moveDown();
            this.render();
            break;
          case 'a': // Select all
            this.selectAll();
            this.render();
            break;
          case 'n': // Select none
            this.selectNone();
            this.render();
            break;
        }
      };

      process.stdin.on('data', handleKey);
      this.render();
    });
  }

  toggleSelection() {
    const file = this.files[this.currentIndex];
    if (this.selectedFiles.has(file)) {
      this.selectedFiles.delete(file);
    } else {
      this.selectedFiles.add(file);
    }
  }

  selectAll() {
    this.files.forEach(file => this.selectedFiles.add(file));
  }

  selectNone() {
    this.selectedFiles.clear();
  }

  moveUp() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      if (this.currentIndex < this.viewOffset) {
        this.viewOffset = this.currentIndex;
      }
    }
  }

  moveDown() {
    if (this.currentIndex < this.files.length - 1) {
      this.currentIndex++;
      if (this.currentIndex >= this.viewOffset + this.pageSize) {
        this.viewOffset = this.currentIndex - this.pageSize + 1;
      }
    }
  }

  render() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}
┌─ File Browser ────────────────────────────────────────────────────────────────┐
│ Select files to include in output                                            │
└───────────────────────────────────────────────────────────────────────────────┘${colors.reset}

${colors.dim}Controls: ↑↓ Navigate | Space Toggle | A Select All | N Select None | Enter Apply | Q Quit${colors.reset}

${colors.green}Selected: ${this.selectedFiles.size}/${this.files.length} files${colors.reset}
`);

    const visibleFiles = this.files.slice(this.viewOffset, this.viewOffset + this.pageSize);
    
    visibleFiles.forEach((file, index) => {
      const actualIndex = this.viewOffset + index;
      const isSelected = this.selectedFiles.has(file);
      const isCurrent = actualIndex === this.currentIndex;
      
      let line = '';
      
      // Cursor indicator
      line += isCurrent ? `${colors.cyan}➤ ${colors.reset}` : '  ';
      
      // Selection checkbox
      line += isSelected ? `${colors.green}✅ ${colors.reset}` : `${colors.red}❌ ${colors.reset}`;
      
      // File path with syntax highlighting
      const ext = path.extname(file).toLowerCase();
      let color = colors.white;
      if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) color = colors.yellow;
      else if (['.json', '.yaml', '.yml'].includes(ext)) color = colors.blue;
      else if (['.md', '.txt'].includes(ext)) color = colors.cyan;
      else if (['.css', '.scss', '.sass'].includes(ext)) color = colors.magenta;
      
      line += isCurrent ? `${colors.bright}${color}${file}${colors.reset}` : `${color}${file}${colors.reset}`;
      
      console.log(line);
    });

    // Show scroll indicator if needed
    if (this.files.length > this.pageSize) {
      const scrollPercent = Math.round((this.viewOffset / (this.files.length - this.pageSize)) * 100);
      console.log(`\n${colors.dim}Showing ${this.viewOffset + 1}-${Math.min(this.viewOffset + this.pageSize, this.files.length)} of ${this.files.length} (${scrollPercent}%)${colors.reset}`);
    }
  }
}

/**
 * Configuration wizard
 */
class ConfigWizard {
  constructor(prompt) {
    this.prompt = prompt;
  }

  async run() {
    this.prompt.clearScreen();
    console.log(`${colors.cyan}${colors.bright}
┌─ Configuration Wizard ────────────────────────────────────────────────────────┐
│ Customize your dir2txt settings                                              │
└───────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);

    const config = await loadConfig();
    const updates = {};

    // File extensions
    console.log(`${colors.yellow}📎 File Extensions${colors.reset}`);
    console.log(`Current: ${config.includeExtensions ? config.includeExtensions.join(', ') : 'Using defaults'}`);
    const newExtensions = await this.prompt.question(`Enter new extensions (comma-separated, or press Enter to keep current): `);
    
    if (newExtensions.trim()) {
      updates.includeExtensions = newExtensions.split(',').map(ext => ext.trim().startsWith('.') ? ext.trim() : '.' + ext.trim());
    }

    // Max file size
    console.log(`\n${colors.yellow}📏 Maximum File Size${colors.reset}`);
    console.log(`Current: ${config.maxFileSize ? (config.maxFileSize / 1024 / 1024).toFixed(1) + 'MB' : 'Not set'}`);
    const newSize = await this.prompt.question(`Enter max size in MB (or press Enter to keep current): `);
    
    if (newSize.trim()) {
      const sizeInBytes = parseFloat(newSize) * 1024 * 1024;
      if (!isNaN(sizeInBytes)) {
        updates.maxFileSize = Math.round(sizeInBytes);
      }
    }

    // Ignore patterns
    console.log(`\n${colors.yellow}🚫 Ignore Patterns${colors.reset}`);
    console.log(`Current patterns: ${config.ignorePatterns ? config.ignorePatterns.length : 0}`);
    const addIgnore = await this.prompt.question(`Add new ignore pattern (or press Enter to skip): `);
    
    if (addIgnore.trim()) {
      updates.ignorePatterns = [...(config.ignorePatterns || []), addIgnore.trim()];
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await updateConfig(updates);
      this.prompt.showSuccess('Configuration updated successfully!');
    } else {
      this.prompt.showInfo('No changes made to configuration.');
    }

    await this.prompt.question('Press Enter to continue...');
  }
}

/**
 * Template selector
 */
class TemplateSelector {
  constructor(prompt) {
    this.prompt = prompt;
    this.templates = {
      'node': {
        name: 'Node.js Project',
        description: 'JavaScript/TypeScript with npm packages',
        extensions: ['.js', '.ts', '.jsx', '.tsx', '.json', '.md'],
        ignorePatterns: ['node_modules/**', 'dist/**', 'build/**', '*.log', '.env*']
      },
      'python': {
        name: 'Python Project',
        description: 'Python with virtual environments',
        extensions: ['.py', '.pyx', '.pyi', '.txt', '.md', '.yaml', '.yml', '.json'],
        ignorePatterns: ['__pycache__/**', '*.pyc', '*.pyo', 'venv/**', '.venv/**', 'dist/**']
      },
      'web': {
        name: 'Web Frontend',
        description: 'HTML, CSS, JavaScript frontend project',
        extensions: ['.html', '.css', '.scss', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte'],
        ignorePatterns: ['node_modules/**', 'dist/**', 'build/**', '.next/**', '.nuxt/**']
      },
      'java': {
        name: 'Java Project',
        description: 'Java with Maven/Gradle',
        extensions: ['.java', '.kt', '.scala', '.xml', '.properties', '.md'],
        ignorePatterns: ['target/**', 'build/**', '*.class', '*.jar', '*.war', '.gradle/**']
      },
      'cpp': {
        name: 'C/C++ Project',
        description: 'C/C++ with build artifacts',
        extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.cmake', '.md'],
        ignorePatterns: ['build/**', 'cmake-build-*/**', '*.o', '*.obj', '*.exe', '*.out']
      }
    };
  }

  async run() {
    this.prompt.clearScreen();
    console.log(`${colors.cyan}${colors.bright}
┌─ Project Templates ───────────────────────────────────────────────────────────┐
│ Quick setup for common project types                                         │
└───────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);

    console.log(`${colors.yellow}Available Templates:${colors.reset}`);
    Object.entries(this.templates).forEach(([key, template], index) => {
      console.log(`   ${colors.green}${index + 1})${colors.reset} ${colors.bright}${template.name}${colors.reset}`);
      console.log(`      ${colors.dim}${template.description}${colors.reset}`);
    });
    console.log(`   ${colors.green}${Object.keys(this.templates).length + 1})${colors.reset} ${colors.dim}Skip template selection${colors.reset}\n`);

    const choice = await this.prompt.question(`${colors.cyan}Select template (1-${Object.keys(this.templates).length + 1}): ${colors.reset}`);
    const templateIndex = parseInt(choice) - 1;
    const templateKeys = Object.keys(this.templates);

    if (templateIndex >= 0 && templateIndex < templateKeys.length) {
      const templateKey = templateKeys[templateIndex];
      const template = this.templates[templateKey];
      
      console.log(`\n${colors.yellow}Applying ${template.name} template...${colors.reset}`);
      
      await updateConfig({
        includeExtensions: template.extensions,
        ignorePatterns: template.ignorePatterns
      });
      
      this.prompt.showSuccess(`${template.name} template applied successfully!`);
    } else {
      this.prompt.showInfo('No template selected.');
    }

    await this.prompt.question('Press Enter to continue...');
  }
}

/**
 * Main interactive mode controller
 */
export class InteractiveMode {
  constructor() {
    this.prompt = new InteractivePrompt();
  }

  async start() {
    try {
      while (true) {
        this.prompt.clearScreen();
        this.prompt.showHeader();
        this.prompt.showDirectory();
        await this.prompt.showProjectStats();
        this.prompt.showMainMenu();

        const choice = await this.prompt.getMenuChoice();
        
        switch (choice) {
          case 1:
            await this.generateToClipboard();
            break;
          case 2:
            await this.generateToFile();
            break;
          case 3:
            await this.showPreview();
            break;
          case 4:
            await this.configureOptions();
            break;
          case 5:
            await this.showDetailedStats();
            break;
          case 6:
            await this.browseFiles();
            break;
          case 7:
            await this.selectTemplate();
            break;
          case 8:
            this.prompt.showInfo('Thanks for using dir2txt! 👋');
            return;
          default:
            this.prompt.showError('Invalid choice. Please enter a number between 1-8.');
            await this.prompt.question('Press Enter to continue...');
        }
      }
    } catch (error) {
      this.prompt.showError(`An error occurred: ${error.message}`);
    } finally {
      this.prompt.close();
    }
  }

  async generateToClipboard() {
    try {
      console.log(`\n${colors.yellow}📋 Generating and copying to clipboard...${colors.reset}`);
      const files = await getFiles();
      
      if (files.length === 0) {
        this.prompt.showError('No files found to process.');
        await this.prompt.question('Press Enter to continue...');
        return;
      }

      await generateText(files, { clipboard: true });
      this.prompt.showSuccess(`Generated text for ${files.length} files and copied to clipboard!`);
    } catch (error) {
      this.prompt.showError(`Failed to generate: ${error.message}`);
    }
    
    await this.prompt.question('Press Enter to continue...');
  }

  async generateToFile() {
    try {
      const filename = await this.prompt.getOutputFilename();
      console.log(`\n${colors.yellow}📄 Generating to file: ${filename}${colors.reset}`);
      
      const files = await getFiles();
      if (files.length === 0) {
        this.prompt.showError('No files found to process.');
        await this.prompt.question('Press Enter to continue...');
        return;
      }

      await generateText(files, { outputFile: filename });
      this.prompt.showSuccess(`Generated text for ${files.length} files and saved to ${filename}!`);
    } catch (error) {
      this.prompt.showError(`Failed to generate: ${error.message}`);
    }
    
    await this.prompt.question('Press Enter to continue...');
  }

  async showPreview() {
    try {
      const count = await this.prompt.getPreviewCount();
      console.log(`\n${colors.yellow}👀 Generating preview of first ${count} files...${colors.reset}`);
      
      const files = await getFiles();
      if (files.length === 0) {
        this.prompt.showError('No files found to process.');
        await this.prompt.question('Press Enter to continue...');
        return;
      }

      await generatePreview(files, count);
      this.prompt.showSuccess(`Preview generated for ${Math.min(count, files.length)} files!`);
    } catch (error) {
      this.prompt.showError(`Failed to generate preview: ${error.message}`);
    }
    
    await this.prompt.question('Press Enter to continue...');
  }

  async configureOptions() {
    const wizard = new ConfigWizard(this.prompt);
    await wizard.run();
  }

  async showDetailedStats() {
    try {
      this.prompt.clearScreen();
      console.log(`${colors.cyan}${colors.bright}
┌─ Project Statistics ──────────────────────────────────────────────────────────┐
│ Detailed analysis of your project                                            │
└───────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);

      console.log(`${colors.yellow}📊 Analyzing project...${colors.reset}`);
      const files = await getFiles({ excludeLarge: false });
      
      // Group by extension
      const extStats = {};
      let totalSize = 0;
      
      for (const file of files) {
        const ext = path.extname(file).toLowerCase() || 'no extension';
        if (!extStats[ext]) {
          extStats[ext] = { count: 0, size: 0 };
        }
        extStats[ext].count++;
        
        try {
          const stats = await fs.stat(file);
          const size = stats.size;
          extStats[ext].size += size;
          totalSize += size;
        } catch (error) {
          // File might be inaccessible
        }
      }

      // Sort by file count
      const sortedExts = Object.entries(extStats)
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, 10);

      console.log(`\n${colors.green}📈 File Type Distribution:${colors.reset}`);
      sortedExts.forEach(([ext, stats]) => {
        const sizeStr = (stats.size / 1024).toFixed(1) + 'KB';
        console.log(`   ${ext.padEnd(12)} ${colors.dim}${stats.count.toString().padStart(4)} files  ${sizeStr.padStart(8)}${colors.reset}`);
      });

      console.log(`\n${colors.green}📊 Summary:${colors.reset}`);
      console.log(`   Total Files: ${files.length}`);
      console.log(`   Total Size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Average Size: ${files.length > 0 ? (totalSize / files.length / 1024).toFixed(1) : 0}KB per file`);
      console.log(`   File Types: ${Object.keys(extStats).length}`);

    } catch (error) {
      this.prompt.showError(`Failed to analyze project: ${error.message}`);
    }
    
    await this.prompt.question('\nPress Enter to continue...');
  }

  async browseFiles() {
    try {
      console.log(`\n${colors.yellow}🔍 Loading files for browsing...${colors.reset}`);
      const files = await getFiles();
      
      if (files.length === 0) {
        this.prompt.showError('No files found to browse.');
        await this.prompt.question('Press Enter to continue...');
        return;
      }

      const browser = new FileBrowser(files);
      const selectedFiles = await browser.browse();
      
      if (selectedFiles.length === 0) {
        this.prompt.showInfo('No files selected.');
        await this.prompt.question('Press Enter to continue...');
        return;
      }

      this.prompt.clearScreen();
      console.log(`${colors.green}✅ Selected ${selectedFiles.length} files${colors.reset}\n`);
      console.log(`${colors.yellow}What would you like to do with selected files?${colors.reset}`);
      console.log(`   ${colors.green}1)${colors.reset} 📋 Copy to clipboard`);
      console.log(`   ${colors.green}2)${colors.reset} 📄 Save to file`);
      console.log(`   ${colors.green}3)${colors.reset} 👀 Preview`);
      console.log(`   ${colors.green}4)${colors.reset} ❌ Cancel`);

      const action = await this.prompt.getMenuChoice();
      
      switch (action) {
        case 1:
          await generateText(selectedFiles, { clipboard: true });
          this.prompt.showSuccess('Selected files copied to clipboard!');
          break;
        case 2:
          const filename = await this.prompt.getOutputFilename();
          await generateText(selectedFiles, { outputFile: filename });
          this.prompt.showSuccess(`Selected files saved to ${filename}!`);
          break;
        case 3:
          const count = await this.prompt.getPreviewCount();
          await generatePreview(selectedFiles, count);
          this.prompt.showSuccess('Preview generated!');
          break;
        default:
          this.prompt.showInfo('Operation cancelled.');
      }

    } catch (error) {
      this.prompt.showError(`Failed to browse files: ${error.message}`);
    }
    
    await this.prompt.question('Press Enter to continue...');
  }

  async selectTemplate() {
    const selector = new TemplateSelector(this.prompt);
    await selector.run();
  }
}

/**
 * Start interactive mode
 */
export async function startInteractiveMode() {
  const interactive = new InteractiveMode();
  await interactive.start();
}