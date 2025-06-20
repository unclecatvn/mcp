#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import ignore from "ignore";

class DirectoryTreeServer {
  constructor() {
    this.server = new Server(
      {
        name: "directory-tree-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "generate_directory_tree",
            description: "Generates a JSON tree structure of a directory, respecting .gitignore patterns",
            inputSchema: {
              type: "object",
              properties: {
                directory_path: {
                  type: "string",
                  description: "Path to the directory to scan (defaults to current directory)",
                },
                max_depth: {
                  type: "number",
                  description: "Maximum depth to scan (defaults to 6)",
                  default: 6,
                },
                include_hidden: {
                  type: "boolean", 
                  description: "Include hidden files/directories (defaults to false)",
                  default: false,
                },
              },
              required: ["directory_path"],
            },
          },
          {
            name: "save_tree_to_file",
            description: "Saves the generated directory tree to a JSON file",
            inputSchema: {
              type: "object",
              properties: {
                directory_path: {
                  type: "string",
                  description: "Path to the directory to scan",
                },
                output_file: {
                  type: "string",
                  description: "Output file path (defaults to 'directory-tree.json')",
                  default: "directory-tree.json",
                },
                max_depth: {
                  type: "number",
                  description: "Maximum depth to scan",
                  default: 6,
                },
                include_hidden: {
                  type: "boolean",
                  description: "Include hidden files/directories",
                  default: false,
                },
              },
              required: ["directory_path"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "generate_directory_tree") {
        return await this.generateDirectoryTree(args);
      } else if (name === "save_tree_to_file") {
        return await this.saveTreeToFile(args);
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async loadGitignoreForDirectory(directoryPath) {
    const ig = ignore();
    
    try {
      const gitignorePath = path.join(directoryPath, '.gitignore');
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      ig.add(gitignoreContent);
      console.error(`Loaded .gitignore from: ${gitignorePath}`);
    } catch (error) {
      // .gitignore không tồn tại ở directory này, không sao
    }

    return ig;
  }

  createDefaultIgnore() {
    const ig = ignore();

    // Thêm các pattern mặc định chung
    ig.add([
      '.git/',
      'node_modules/',
      '.DS_Store',
      'Thumbs.db',
      '*.log',
      '.env*',
      'dist/',
      'build/',
      '.cache/',
      '.temp/',
      '.tmp/',
    ]);

    return ig;
  }

  // Merge multiple ignore instances để áp dụng hierarchy
  mergeIgnorePatterns(ignoreInstances) {
    const merged = ignore();
    
    // Add default patterns first
    const defaultIg = this.createDefaultIgnore();
    merged.add(defaultIg._rules.map(rule => rule.pattern));
    
    // Add patterns từ các .gitignore files theo hierarchy
    ignoreInstances.forEach(ig => {
      if (ig._rules && ig._rules.length > 0) {
        merged.add(ig._rules.map(rule => rule.pattern));
      }
    });

    return merged;
  }

  // Security helper: Check if path is safe for scanning
  isPathSafe(targetPath, basePath) {
    try {
      const resolvedTarget = path.resolve(targetPath);
      
      // 1. Block sensitive system directories
      if (this.isSensitiveDirectory(resolvedTarget)) {
        console.error(`Blocked sensitive directory: ${resolvedTarget}`);
        return false;
      }
      
      // 2. Allow within user home directory
      const userHome = this.getUserHomeDirectory();
      if (userHome && resolvedTarget.startsWith(userHome)) {
        console.error(`Allowed within user home: ${resolvedTarget}`);
        return true;
      }
      
      // 3. Allow if it's a project directory (has project indicators)
      if (this.isProjectDirectory(resolvedTarget)) {
        console.error(`Allowed project directory: ${resolvedTarget}`);
        return true;
      }
      
      // 4. Allow within current working directory (original behavior)
      const resolvedBase = path.resolve(basePath);
      const normalizedTarget = path.normalize(resolvedTarget);
      const normalizedBase = path.normalize(resolvedBase);
      
      if (normalizedTarget.startsWith(normalizedBase) || normalizedTarget === normalizedBase) {
        console.error(`Allowed within working directory: ${resolvedTarget}`);
        return true;
      }
      
      // Default: block
      console.error(`Access denied: ${resolvedTarget}`);
      return false;
    } catch (error) {
      console.error('Error checking path safety:', error);
      return false;
    }
  }

  // Get user home directory cross-platform
  getUserHomeDirectory() {
    return process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;
  }

  // Check if directory contains project indicators
  isProjectDirectory(dirPath) {
    try {
      const projectIndicators = [
        'package.json',      // Node.js
        'requirements.txt',  // Python
        'Cargo.toml',       // Rust
        'go.mod',           // Go
        'pom.xml',          // Java Maven
        'build.gradle',     // Java Gradle
        'composer.json',    // PHP
        'Gemfile',          // Ruby
        '.git',             // Git repository
        '.gitignore',       // Git repository
        'README.md',        // Common project file
        'README.txt',
        'LICENSE',
        'Makefile',
        'CMakeLists.txt',   // C/C++
        'src/',             // Common source directory
      ];
      
      for (const indicator of projectIndicators) {
        const indicatorPath = path.join(dirPath, indicator);
        try {
          // Check if file or directory exists
          const stats = require('fs').statSync(indicatorPath);
          console.error(`Found project indicator: ${indicator} in ${dirPath}`);
          return true;
        } catch (error) {
          // Indicator doesn't exist, continue checking
          continue;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking project indicators:', error);
      return false;
    }
  }

  // Additional safety: Prevent scanning sensitive system directories  
  isSensitiveDirectory(dirPath) {
    const sensitive = [
      '/System', '/Library', '/usr', '/bin', '/sbin', '/etc',
      '/Windows', '/Program Files', '/Program Files (x86)',
      'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
    ];
    
    const normalizedPath = path.normalize(dirPath);
    return sensitive.some(sensDir => 
      normalizedPath.startsWith(sensDir) || normalizedPath.startsWith(path.normalize(sensDir))
    );
  }

  async scanDirectory(dirPath, options = {}) {
    const {
      maxDepth = 6,
      currentDepth = 0,
      includeHidden = false,
      parentIgnores = [], // Array of ignore instances từ parent directories
      rootPath = null,
    } = options;

    if (maxDepth !== -1 && currentDepth >= maxDepth) {
      return null;
    }

    // Additional safety check for sensitive directories
    if (this.isSensitiveDirectory(dirPath)) {
      console.error(`Skipping sensitive directory: ${dirPath}`);
      return null;
    }

    // Load .gitignore cho directory hiện tại
    const currentIgnore = await this.loadGitignoreForDirectory(dirPath);
    
    // Combine với các ignores từ parent directories
    const allIgnores = [...parentIgnores, currentIgnore];
    const mergedIgnore = this.mergeIgnorePatterns(allIgnores);

    const items = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(rootPath || dirPath, fullPath);

        // Skip hidden files nếu không include
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        // Check all gitignore patterns (từ root xuống current level)
        if (mergedIgnore.ignores(relativePath)) {
          console.error(`Ignored by .gitignore: ${relativePath}`);
          continue;
        }

        const item = {
          name: entry.name,
        };

        if (entry.isDirectory()) {
          // Recursively scan subdirectory với inherited ignores
          const children = await this.scanDirectory(fullPath, {
            ...options,
            currentDepth: currentDepth + 1,
            parentIgnores: allIgnores, // Pass down tất cả ignore patterns
          });
          
          if (children && children.length > 0) {
            item.children = children;
          }
        }

        items.push(item);
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error.message);
    }

    return items;
  }

  async generateDirectoryTree(args) {
    const {
      directory_path: directoryPath = process.cwd(),
      max_depth: maxDepth = 6,
      include_hidden: includeHidden = false,
    } = args;

    try {
      const absolutePath = path.resolve(directoryPath);
      
      // Security check: Smart path validation
      const currentWorkingDir = process.cwd();
      if (!this.isPathSafe(absolutePath, currentWorkingDir)) {
        throw new Error(`Access denied: Cannot scan directory. Please ensure the path is a valid project directory within your user space. Requested: ${absolutePath}`);
      }
      
      // Check if directory exists
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${absolutePath}`);
      }

      // Get directory name
      const dirName = path.basename(absolutePath);

      console.error(`Scanning directory: ${absolutePath}`);

      // Scan directory với hierarchical gitignore support
      const children = await this.scanDirectory(absolutePath, {
        maxDepth,
        includeHidden,
        parentIgnores: [], // Start với empty array
        rootPath: absolutePath,
      });

      const tree = {
        name: dirName,
        children: children || [],
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tree, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to generate directory tree: ${error.message}`);
    }
  }

  async saveTreeToFile(args) {
    const {
      directory_path: directoryPath,
      output_file: outputFile = 'directory-tree.json',
      ...otherArgs
    } = args;

    try {
      // Generate tree
      const result = await this.generateDirectoryTree({
        directory_path: directoryPath,
        ...otherArgs,
      });

      const treeJson = result.content[0].text;
      
      // Save to file
      await fs.writeFile(outputFile, treeJson, 'utf8');

      return {
        content: [
          {
            type: "text",
            text: `Directory tree saved successfully to: ${outputFile}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to save tree to file: ${error.message}`);
    }
  }

  countItems(items) {
    let count = 0;
    for (const item of items) {
      count++;
      if (item.children) {
        count += this.countItems(item.children);
      }
    }
    return count;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Directory Tree MCP server running on stdio");
  }
}

const server = new DirectoryTreeServer();
server.run().catch(console.error); 