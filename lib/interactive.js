import { createInterface } from 'readline';
import { promises as fs } from 'fs';
import path from 'path';
import { getFiles, getFileCount } from './traverse.js';
import { generateText, generatePreview } from './generate.js';
import { loadConfig, updateConfig } from './config.js';
import { 
  analyzeProjectRelationships, 
  groupFilesByFunction, 
  generateDependencyGraph 
} from './relationships.js';

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
    console.log(`\n${colors.cyan}🚀 GENERATE OUTPUT:${colors.reset}`);
    console.log(`   ${colors.green}1)${colors.reset} 📋 Quick copy to clipboard`);
    console.log(`   ${colors.green}2)${colors.reset} 📄 Generate to file`);
    console.log(`   ${colors.green}3)${colors.reset} 👀 Smart preview with relationships`);
    console.log(`   ${colors.green}4)${colors.reset} 🎯 Custom generation wizard`);
    
    console.log(`\n${colors.cyan}🔍 ANALYZE & EXPLORE:${colors.reset}`);
    console.log(`   ${colors.green}5)${colors.reset} 🕸️  Project relationship analysis`);
    console.log(`   ${colors.green}6)${colors.reset} 🔍 Interactive file browser`);
    console.log(`   ${colors.green}7)${colors.reset} 📊 Detailed project statistics`);
    console.log(`   ${colors.green}8)${colors.reset} 🔎 Live search and filter`);
    
    console.log(`\n${colors.cyan}⚙️  SETUP & CONFIG:${colors.reset}`);
    console.log(`   ${colors.green}9)${colors.reset} 🛠️  Configuration wizard`);
    console.log(`   ${colors.green}10)${colors.reset} 📋 Quick templates`);
    console.log(`   ${colors.green}11)${colors.reset} ❌ Exit`);
    console.log('');
  }

  async getMenuChoice() {
    const choice = await this.question(`${colors.cyan}➤ Enter your choice (1-11): ${colors.reset}`);
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
            await this.smartPreview();
            break;
          case 4:
            await this.customGenerationWizard();
            break;
          case 5:
            await this.showRelationshipAnalysis();
            break;
          case 6:
            await this.browseFiles();
            break;
          case 7:
            await this.showDetailedStats();
            break;
          case 8:
            await this.liveSearchAndFilter();
            break;
          case 9:
            await this.configureOptions();
            break;
          case 10:
            await this.selectTemplate();
            break;
          case 11:
            this.prompt.showInfo('Thanks for using dir2txt! 👋');
            return;
          default:
            this.prompt.showError('Invalid choice. Please enter a number between 1-11.');
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

  async smartPreview() {
    try {
      this.prompt.clearScreen();
      console.log(`${colors.cyan}${colors.bright}
┌─ Smart Preview with Relationships ────────────────────────────────────────────┐
│ Analyze all project files with contextual information and relationships      │
└───────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);

      const includeRelationships = await this.prompt.confirmAction('Include file relationships?');
      const includeSummaries = await this.prompt.confirmAction('Include file summaries?');
      
      console.log(`\n${colors.yellow}🔗 Analyzing all project files...${colors.reset}`);
      
      const files = await getFiles();
      if (files.length === 0) {
        this.prompt.showError('No files found to process.');
        await this.prompt.question('Press Enter to continue...');
        return;
      }

      // Analyze relationships if requested
      let projectAnalysis = null;
      if (includeRelationships || includeSummaries) {
        console.log(`${colors.cyan}🔗 Analyzing relationships...${colors.reset}`);
        projectAnalysis = await analyzeProjectRelationships(files);
      }

      const options = {
        includeRelationships,
        fileSummaries: includeSummaries,
        projectAnalysis
      };

      await generatePreview(files, files.length, options);
      this.prompt.showSuccess(`Smart preview generated for all ${files.length} files!`);
    } catch (error) {
      this.prompt.showError(`Failed to generate smart preview: ${error.message}`);
    }
    
    await this.prompt.question('Press Enter to continue...');
  }

  async customGenerationWizard() {
    try {
      this.prompt.clearScreen();
      console.log(`${colors.cyan}${colors.bright}
┌─ Custom Generation Wizard ────────────────────────────────────────────────────┐
│ Build your perfect output with step-by-step guidance                         │
└───────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);

      console.log(`${colors.yellow}🎯 Let's customize your generation options...${colors.reset}\n`);

      // Output destination
      console.log(`${colors.cyan}📤 Where do you want the output?${colors.reset}`);
      console.log(`   ${colors.green}1)${colors.reset} Clipboard (easy to paste)`);
      console.log(`   ${colors.green}2)${colors.reset} File (save to disk)`);
      const outputChoice = await this.prompt.question('Choice (1-2): ');
      
      let outputFile = null;
      let clipboard = false;
      if (outputChoice === '1') {
        clipboard = true;
      } else {
        outputFile = await this.prompt.getOutputFilename();
      }

      // Format selection
      const markdown = await this.prompt.confirmAction('Use markdown format?');

      // Relationship features
      console.log(`\n${colors.cyan}🔗 Smart relationship features:${colors.reset}`);
      const includeRelationships = await this.prompt.confirmAction('Show imports/exports between files?');
      const fileSummaries = await this.prompt.confirmAction('Add AI-generated file summaries?');
      const includeDependencies = await this.prompt.confirmAction('Include dependency graph?');
      const groupByFeature = await this.prompt.confirmAction('Group files by functionality?');

      // File filtering
      const filterFiles = await this.prompt.confirmAction('Filter files by specific criteria?');
      let extensions = null;
      let ignorePatterns = null;
      
      if (filterFiles) {
        const extInput = await this.prompt.question('File extensions (comma-separated, e.g., .js,.ts,.py): ');
        if (extInput.trim()) {
          extensions = extInput.split(',').map(ext => ext.trim().startsWith('.') ? ext.trim() : '.' + ext.trim());
        }
        
        const ignoreInput = await this.prompt.question('Additional ignore patterns (comma-separated): ');
        if (ignoreInput.trim()) {
          ignorePatterns = ignoreInput.split(',').map(pattern => pattern.trim());
        }
      }

      // Generate with custom options
      console.log(`\n${colors.yellow}🚀 Generating with your custom settings...${colors.reset}`);
      
      const files = await getFiles({ 
        includeExtensions: extensions,
        ignorePatterns: ignorePatterns
      });
      
      if (files.length === 0) {
        this.prompt.showError('No files found with your criteria.');
        await this.prompt.question('Press Enter to continue...');
        return;
      }

      // Analyze relationships if needed
      let projectAnalysis = null;
      if (includeRelationships || fileSummaries || includeDependencies || groupByFeature) {
        console.log(`${colors.cyan}🔗 Analyzing relationships...${colors.reset}`);
        projectAnalysis = await analyzeProjectRelationships(files);
      }

      const options = {
        clipboard,
        outputFile,
        markdown,
        includeRelationships,
        fileSummaries,
        includeDependencies,
        groupByFeature,
        projectAnalysis
      };

      await generateText(files, options);
      
      if (clipboard) {
        this.prompt.showSuccess(`Generated text for ${files.length} files and copied to clipboard!`);
      } else {
        this.prompt.showSuccess(`Generated text for ${files.length} files and saved to ${outputFile}!`);
      }

    } catch (error) {
      this.prompt.showError(`Failed to generate: ${error.message}`);
    }
    
    await this.prompt.question('Press Enter to continue...');
  }

  async showRelationshipAnalysis() {
    try {
      this.prompt.clearScreen();
      console.log(`${colors.cyan}${colors.bright}
┌─ Project Relationship Analysis ───────────────────────────────────────────────┐
│ Understand your codebase structure and dependencies                          │
└───────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);

      console.log(`${colors.yellow}🕸️  Analyzing project relationships...${colors.reset}`);
      
      const files = await getFiles();
      if (files.length === 0) {
        this.prompt.showError('No files found to analyze.');
        await this.prompt.question('Press Enter to continue...');
        return;
      }

      const analysis = await analyzeProjectRelationships(files);
      
      // Show summary
      console.log(`\n${colors.green}📊 Analysis Results:${colors.reset}`);
      console.log(`   Total Files: ${analysis.stats.totalFiles}`);
      console.log(`   Analyzed Files: ${analysis.stats.analyzedFiles}`);
      console.log(`   Total Imports: ${analysis.stats.totalImports}`);
      console.log(`   Total Exports: ${analysis.stats.totalExports}`);
      
      if (analysis.stats.detectedFrameworks.length > 0) {
        console.log(`   Detected Frameworks: ${analysis.stats.detectedFrameworks.join(', ')}`);
      }

      // Show dependency graph
      console.log(`\n${colors.cyan}🌳 Dependency Graph:${colors.reset}`);
      const depGraph = generateDependencyGraph(analysis.relationships, analysis.dependencyGraph, 2);
      console.log(depGraph);

      // Show framework grouping
      const groups = groupFilesByFunction(analysis.relationships, analysis.dependencyGraph);
      if (groups.size > 1) {
        console.log(`\n${colors.cyan}📂 File Groups by Functionality:${colors.reset}`);
        for (const [groupName, groupFiles] of groups) {
          console.log(`   ${colors.green}${groupName}:${colors.reset} ${groupFiles.size} files`);
          Array.from(groupFiles).slice(0, 3).forEach(file => {
            console.log(`     ${colors.dim}${path.basename(file)}${colors.reset}`);
          });
          if (groupFiles.size > 3) {
            console.log(`     ${colors.dim}... and ${groupFiles.size - 3} more${colors.reset}`);
          }
        }
      }

      // Show most connected files
      const mostConnected = Array.from(analysis.dependencyGraph.entries())
        .map(([file, deps]) => ({
          file,
          connections: deps.dependencies.length + deps.dependents.length
        }))
        .sort((a, b) => b.connections - a.connections)
        .slice(0, 5);

      if (mostConnected.length > 0) {
        console.log(`\n${colors.cyan}🔗 Most Connected Files:${colors.reset}`);
        mostConnected.forEach(({file, connections}) => {
          console.log(`   ${colors.green}${path.basename(file)}${colors.reset} (${connections} connections)`);
        });
      }

    } catch (error) {
      this.prompt.showError(`Failed to analyze relationships: ${error.message}`);
    }
    
    await this.prompt.question('Press Enter to continue...');
  }

  async liveSearchAndFilter() {
    try {
      this.prompt.clearScreen();
      console.log(`${colors.cyan}${colors.bright}
┌─ Live Search and Filter ──────────────────────────────────────────────────────┐
│ Real-time file filtering with instant results                                │
└───────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);

      console.log(`${colors.yellow}🔎 Loading files for search...${colors.reset}`);
      const allFiles = await getFiles();
      
      if (allFiles.length === 0) {
        this.prompt.showError('No files found to search.');
        await this.prompt.question('Press Enter to continue...');
        return;
      }

      let filteredFiles = [...allFiles];
      
      while (true) {
        this.prompt.clearScreen();
        console.log(`${colors.cyan}${colors.bright}🔍 Live Search Results${colors.reset}`);
        console.log(`${colors.green}Found ${filteredFiles.length} of ${allFiles.length} files${colors.reset}\n`);
        
        // Show first 10 results
        filteredFiles.slice(0, 10).forEach((file, index) => {
          const ext = path.extname(file).toLowerCase();
          let color = colors.white;
          if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) color = colors.yellow;
          else if (['.json', '.yaml', '.yml'].includes(ext)) color = colors.blue;
          else if (['.md', '.txt'].includes(ext)) color = colors.cyan;
          
          console.log(`   ${colors.green}${(index + 1).toString().padStart(2)})${colors.reset} ${color}${file}${colors.reset}`);
        });
        
        if (filteredFiles.length > 10) {
          console.log(`   ${colors.dim}... and ${filteredFiles.length - 10} more files${colors.reset}`);
        }

        console.log(`\n${colors.cyan}Options:${colors.reset}`);
        console.log(`   ${colors.green}f)${colors.reset} Filter by pattern`);
        console.log(`   ${colors.green}e)${colors.reset} Filter by extension`);
        console.log(`   ${colors.green}c)${colors.reset} Clear filters`);
        console.log(`   ${colors.green}g)${colors.reset} Generate with current results`);
        console.log(`   ${colors.green}q)${colors.reset} Back to main menu`);

        const action = await this.prompt.question(`\n${colors.cyan}Action: ${colors.reset}`);
        
        switch (action.toLowerCase()) {
          case 'f':
            const pattern = await this.prompt.question('Enter search pattern (filename contains): ');
            if (pattern.trim()) {
              filteredFiles = allFiles.filter(file => 
                file.toLowerCase().includes(pattern.toLowerCase())
              );
            }
            break;
            
          case 'e':
            const ext = await this.prompt.question('Enter file extension (e.g., .js, .py): ');
            if (ext.trim()) {
              const extension = ext.startsWith('.') ? ext : '.' + ext;
              filteredFiles = allFiles.filter(file => 
                file.toLowerCase().endsWith(extension.toLowerCase())
              );
            }
            break;
            
          case 'c':
            filteredFiles = [...allFiles];
            break;
            
          case 'g':
            if (filteredFiles.length === 0) {
              this.prompt.showError('No files to generate.');
              await this.prompt.question('Press Enter to continue...');
              break;
            }
            
            console.log(`\n${colors.yellow}Generate output with ${filteredFiles.length} files:${colors.reset}`);
            console.log(`   ${colors.green}1)${colors.reset} Copy to clipboard`);
            console.log(`   ${colors.green}2)${colors.reset} Save to file`);
            console.log(`   ${colors.green}3)${colors.reset} Preview`);
            
            const genChoice = await this.prompt.question('Choice (1-3): ');
            
            switch (genChoice) {
              case '1':
                await generateText(filteredFiles, { clipboard: true });
                this.prompt.showSuccess('Generated and copied to clipboard!');
                break;
              case '2':
                const filename = await this.prompt.getOutputFilename();
                await generateText(filteredFiles, { outputFile: filename });
                this.prompt.showSuccess(`Generated and saved to ${filename}!`);
                break;
              case '3':
                const count = await this.prompt.getPreviewCount();
                await generatePreview(filteredFiles, count);
                this.prompt.showSuccess('Preview generated!');
                break;
            }
            
            await this.prompt.question('Press Enter to continue...');
            break;
            
          case 'q':
            return;
        }
      }

    } catch (error) {
      this.prompt.showError(`Failed to search and filter: ${error.message}`);
      await this.prompt.question('Press Enter to continue...');
    }
  }

}

/**
 * Start interactive mode
 */
export async function startInteractiveMode() {
  const interactive = new InteractiveMode();
  await interactive.start();
}