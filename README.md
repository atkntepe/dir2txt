# dir2txt

A powerful CLI tool that converts your project's directory structure and file contents into clean, LLM-friendly text format. Perfect for sharing codebases with AI assistants, creating documentation, or analyzing project structures.

## 🚀 Features

- **Beautiful Welcome Screen**: Helpful ASCII art interface for new users
- **Clipboard Integration**: Copy output directly to clipboard for AI tools
- **Smart File Discovery**: Efficiently scans directories using fast-glob with configurable ignore patterns
- **Multiple Output Formats**: Plain text or Markdown with syntax highlighting
- **Project Templates**: Pre-configured settings for Node.js, Python, Java, Web, and C++ projects
- **Flexible Configuration**: Use `.dir2txt.json` config files or fallback to `.gitignore` patterns
- **Binary File Detection**: Automatically skips binary files and images
- **Size Filtering**: Configurable file size limits to avoid huge files
- **Performance Optimized**: Concurrent file processing with timing metrics
- **LLM-Friendly Output**: Clean, structured text perfect for AI analysis

## 📦 Installation

### Global Installation
```bash
npm install -g dir2txt
```

### Local Installation
```bash
npm install dir2txt
npx dir2txt --help
```

## 🏃 Quick Start

### First Time Users
```bash
# Install globally
npm install -g dir2txt

# Run without commands to see the welcome screen
dir2txt
```

### Basic Usage
```bash
# Generate text to directory-output.txt (default)
dir2txt run

# Save to custom file
dir2txt run --output project.txt

# Only show directory structure (no file created)
dir2txt run --dry

# Generate in markdown format
dir2txt run --markdown
```

### Advanced Usage
```bash
# Copy to clipboard
dir2txt run --clipboard

# Limit file size and specific extensions
dir2txt run --max-size 512000 --extensions .js .ts .md

# Add extra ignore patterns on command line
dir2txt run --ignore "*.test.js" "temp/**"

# Ignore config file and use only .gitignore
dir2txt run --noconfig

# Generate preview with first 5 files
dir2txt run --preview 5

# Save markdown output to file
dir2txt run --markdown --output docs/codebase.md
```

## ⚙️ Configuration

### Create Default Config
```bash
dir2txt config
```

This creates `.dir2txt.json` with sensible defaults:

```json
{
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    "build/**",
    "*.log",
    ".git/**",
    ".env*",
    "coverage/**",
    ".nyc_output/**"
  ],
  "includeExtensions": [
    ".js", ".ts", ".jsx", ".tsx",
    ".json", ".md", ".txt", ".py",
    ".java", ".c", ".cpp", ".h",
    ".css", ".html", ".xml",
    ".yaml", ".yml"
  ],
  "maxFileSize": 1048576
}
```

### Update Configuration
```bash
# Add ignore patterns
dir2txt update --add "*.test.js"
dir2txt update --add "docs/**"

# Remove ignore patterns  
dir2txt update --remove "dist/**"

# Add/remove file extensions
dir2txt update --add-ext .go
dir2txt update --remove-ext .xml

# Set max file size (in bytes)
dir2txt update --max-size 2097152

# View current config
dir2txt config --show
```

### Project Templates
```bash
# List available templates
dir2txt templates --list

# Apply a template (Node.js, Python, Java, Web, C++)
dir2txt templates --apply node
```

### Delete Configuration
```bash
dir2txt delete --force
```

## 📋 Commands

| Command | Description | Options |
|---------|-------------|---------|
| `run` | Generate text output | `--dry`, `--output`, `--clipboard`, `--markdown`, `--preview`, `--max-size`, `--extensions`, `--ignore`, `--noconfig` |
| `config` | Create/show configuration | `--show` |
| `update` | Update configuration | `--add`, `--remove`, `--add-ext`, `--remove-ext`, `--max-size` |
| `templates` | Project templates | `--list`, `--apply` |
| `delete` | Delete configuration | `--force` |
| `status` | Show directory status | - |

## 📖 Output Format

### Plain Text Format
```
Project Structure:
├── src/
│   ├── index.js
│   └── utils/
│       └── helper.js
└── package.json

=== FILE CONTENTS ===

--- src/index.js ---
console.log('Hello World');

--- package.json ---
{
  "name": "my-project",
  "version": "1.0.0"
}

=== SUMMARY ===
Total files: 2
Processed: 2
Skipped: 0
Total time: 45ms
```

### Markdown Format
```markdown
# Project Structure

```
├── src/
│   ├── index.js
│   └── utils/
│       └── helper.js
└── package.json
```

# File Contents

## src/index.js

```javascript
console.log('Hello World');
```

## package.json

```json
{
  "name": "my-project",
  "version": "1.0.0"
}
```
```

## 🎯 Use Cases

### For AI/LLM Analysis
```bash
# Generate complete codebase for AI analysis (creates directory-output.txt)
dir2txt run

# Copy directly to clipboard for ChatGPT/Claude
dir2txt run --clipboard --extensions .js .ts

# Focus on specific file types
dir2txt run --extensions .js .ts --output frontend-code.txt
```

### For Documentation
```bash
# Create project overview
dir2txt run --dry --markdown > project-structure.md

# Generate code documentation
dir2txt run --markdown --output docs/source-code.md
```

### For Code Review
```bash
# Quick preview for code review
dir2txt run --preview 10 --extensions .js .ts

# Export specific directories
cd src && dir2txt run --output ../src-export.txt
```

## 🏗️ Architecture

```
dir2txt/
├── bin/cli.js          # CLI entry point and command handling
├── lib/
│   ├── config.js       # Configuration management
│   ├── traverse.js     # Directory traversal and filtering
│   └── generate.js     # Text generation and formatting
└── test/              # Jest test suites
```

## 🧪 Development

### Setup
```bash
git clone https://github.com/yourusername/dir2txt.git
cd dir2txt
npm install
```

### Testing
```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Manual Testing
```bash
# Test on current project
node bin/cli.js run --dry

# Test configuration
node bin/cli.js config
node bin/cli.js status
```

## 📊 Performance

- **Fast scanning**: Uses `fast-glob` for efficient file discovery
- **Concurrent processing**: Configurable concurrency (default: 10 files)
- **Memory efficient**: Streams output instead of building large strings
- **Binary detection**: Quick binary file detection to avoid processing
- **Timing metrics**: Built-in performance measurement

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [fast-glob](https://github.com/mrmlnc/fast-glob) - Fast and efficient glob matching
- [ignore](https://github.com/kaelzhang/node-ignore) - .gitignore parsing
- [commander](https://github.com/tj/commander.js) - Command-line interface framework

---

**Made with ❤️ for developers and AI enthusiasts**
