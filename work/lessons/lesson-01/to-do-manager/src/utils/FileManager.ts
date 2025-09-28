/**
 * FileManager.ts - Data Persistence Layer
 * 
 * This utility handles saving and loading todo data to/from JSON files.
 * It includes error handling, backup functionality, and data validation.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Todo } from '../models/Todo';
import { Category } from '../models/Category';

// Structure of the data file
export interface TodoData {
  todos: Todo[];
  categories: Category[];
  version: string;          // Data format version for future migrations
  lastModified: string;     // ISO timestamp of last modification
}

// Configuration for file operations
export interface FileManagerConfig {
  dataPath: string;         // Main data file path
  backupPath?: string;      // Backup file path (optional)
  autoBackup: boolean;      // Whether to create backups automatically
  maxBackups?: number;      // Maximum number of backup files to keep
}

// Default configuration
const DEFAULT_CONFIG: FileManagerConfig = {
  dataPath: './data/todos.json',
  backupPath: './data/backups',
  autoBackup: true,
  maxBackups: 5
};

// Error types for better error handling
export class FileManagerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'FileManagerError';
  }
}

export class FileManager {
  private config: FileManagerConfig;

  constructor(config: Partial<FileManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Ensure data directory exists
    this.ensureDirectoryExists(path.dirname(this.config.dataPath));
    
    if (this.config.backupPath && this.config.autoBackup) {
      this.ensureDirectoryExists(this.config.backupPath);
    }
  }

  /**
   * Saves todo data to the JSON file
   */
  async save(data: { todos: Todo[]; categories: Category[] }): Promise<void> {
    try {
      // Create backup if enabled
      if (this.config.autoBackup) {
        await this.createBackup();
      }

      // Prepare data for saving
      const todoData: TodoData = {
        ...data,
        version: '1.0.0',
        lastModified: new Date().toISOString()
      };

      // Validate data before saving
      this.validateData(todoData);

      // Convert data to JSON with pretty formatting
      const jsonData = JSON.stringify(todoData, this.dateSerializer, 2);

      // Write to file atomically (write to temp file, then rename)
      const tempFile = `${this.config.dataPath}.tmp`;
      await fs.writeFile(tempFile, jsonData, 'utf8');
      await fs.rename(tempFile, this.config.dataPath);

      console.log(`Data saved successfully to ${this.config.dataPath}`);
    } catch (error) {
      const fileError = new FileManagerError(
        `Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SAVE_ERROR',
        error instanceof Error ? error : undefined
      );
      
      console.error('Save error:', fileError.message);
      throw fileError;
    }
  }

  /**
   * Loads todo data from the JSON file
   */
  async load(): Promise<{ todos: Todo[]; categories: Category[] }> {
    try {
      // Check if file exists
      if (!(await this.fileExists(this.config.dataPath))) {
        console.log('No existing data file found, creating new one...');
        return this.createEmptyData();
      }

      // Read file content
      const fileContent = await fs.readFile(this.config.dataPath, 'utf8');
      
      if (!fileContent.trim()) {
        console.log('Data file is empty, creating new data...');
        return this.createEmptyData();
      }

      // Parse JSON
      const todoData: TodoData = JSON.parse(fileContent, this.dateDeserializer);

      // Validate loaded data
      this.validateData(todoData);

      // Handle version migrations if needed
      const migratedData = await this.migrateData(todoData);

      console.log(`Loaded ${migratedData.todos.length} todos and ${migratedData.categories.length} categories`);
      
      return {
        todos: migratedData.todos,
        categories: migratedData.categories
      };
    } catch (error) {
      const fileError = new FileManagerError(
        `Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LOAD_ERROR',
        error instanceof Error ? error : undefined
      );
      
      console.error('Load error:', fileError.message);
      
      // Try to load from backup
      if (this.config.autoBackup) {
        console.log('Attempting to load from backup...');
        return await this.loadFromBackup();
      }
      
      throw fileError;
    }
  }

  /**
   * Creates a backup of the current data file
   */
  private async createBackup(): Promise<void> {
    if (!this.config.backupPath || !(await this.fileExists(this.config.dataPath))) {
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `todos-backup-${timestamp}.json`;
      const backupFilePath = path.join(this.config.backupPath, backupFileName);

      await fs.copyFile(this.config.dataPath, backupFilePath);
      
      // Clean up old backups
      if (this.config.maxBackups) {
        await this.cleanupOldBackups();
      }

      console.log(`Backup created: ${backupFilePath}`);
    } catch (error) {
      console.warn('Failed to create backup:', error);
      // Don't throw - backup failure shouldn't stop the save operation
    }
  }

  /**
   * Loads data from the most recent backup
   */
  private async loadFromBackup(): Promise<{ todos: Todo[]; categories: Category[] }> {
    if (!this.config.backupPath) {
      throw new FileManagerError('No backup path configured', 'NO_BACKUP_PATH');
    }

    try {
      const backupFiles = await fs.readdir(this.config.backupPath);
      const todoBackups = backupFiles
        .filter(file => file.startsWith('todos-backup-') && file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first

      if (todoBackups.length === 0) {
        throw new FileManagerError('No backup files found', 'NO_BACKUPS');
      }

      const latestBackup = path.join(this.config.backupPath, todoBackups[0]!);
      console.log(`Loading from backup: ${latestBackup}`);

      const backupContent = await fs.readFile(latestBackup, 'utf8');
      const todoData: TodoData = JSON.parse(backupContent, this.dateDeserializer);
      
      this.validateData(todoData);
      
      return {
        todos: todoData.todos,
        categories: todoData.categories
      };
    } catch (error) {
      throw new FileManagerError(
        `Failed to load from backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BACKUP_LOAD_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Removes old backup files to keep only the specified number
   */
  private async cleanupOldBackups(): Promise<void> {
    if (!this.config.backupPath || !this.config.maxBackups) {
      return;
    }

    try {
      const backupFiles = await fs.readdir(this.config.backupPath);
      const todoBackups = backupFiles
        .filter(file => file.startsWith('todos-backup-') && file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first

      // Remove excess backups
      if (todoBackups.length > this.config.maxBackups) {
        const filesToDelete = todoBackups.slice(this.config.maxBackups);
        
        for (const file of filesToDelete) {
          const filePath = path.join(this.config.backupPath, file);
          await fs.unlink(filePath);
          console.log(`Removed old backup: ${file}`);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Creates empty data structure for new installations
   */
  private createEmptyData(): { todos: Todo[]; categories: Category[] } {
    return {
      todos: [],
      categories: []
    };
  }

  /**
   * Validates the structure and content of todo data
   */
  private validateData(data: TodoData): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    if (!Array.isArray(data.todos)) {
      throw new Error('todos must be an array');
    }

    if (!Array.isArray(data.categories)) {
      throw new Error('categories must be an array');
    }

    if (!data.version || typeof data.version !== 'string') {
      throw new Error('version must be a string');
    }

    // Validate each todo
    for (const [index, todo] of data.todos.entries()) {
      try {
        this.validateTodo(todo);
      } catch (error) {
        throw new Error(`Invalid todo at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Validate each category
    for (const [index, category] of data.categories.entries()) {
      try {
        this.validateCategory(category);
      } catch (error) {
        throw new Error(`Invalid category at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Validate referential integrity (todos reference valid categories)
    const categoryIds = new Set(data.categories.map(cat => cat.id));
    for (const todo of data.todos) {
      if (!categoryIds.has(todo.categoryId)) {
        console.warn(`Todo "${todo.title}" references non-existent category: ${todo.categoryId}`);
      }
    }
  }

  /**
   * Validates a single todo object
   */
  private validateTodo(todo: unknown): asserts todo is Todo {
    if (!todo || typeof todo !== 'object') {
      throw new Error('Todo must be an object');
    }

    const t = todo as Record<string, unknown>;

    if (!t.id || typeof t.id !== 'string') {
      throw new Error('Todo must have a valid id');
    }

    if (!t.title || typeof t.title !== 'string') {
      throw new Error('Todo must have a valid title');
    }

    if (typeof t.completed !== 'boolean') {
      throw new Error('Todo completed status must be a boolean');
    }

    if (!t.priority || typeof t.priority !== 'string') {
      throw new Error('Todo must have a valid priority');
    }

    if (!t.categoryId || typeof t.categoryId !== 'string') {
      throw new Error('Todo must have a valid categoryId');
    }

    if (!t.createdAt || !(t.createdAt instanceof Date)) {
      throw new Error('Todo must have a valid createdAt date');
    }
  }

  /**
   * Validates a single category object
   */
  private validateCategory(category: unknown): asserts category is Category {
    if (!category || typeof category !== 'object') {
      throw new Error('Category must be an object');
    }

    const c = category as Record<string, unknown>;

    if (!c.id || typeof c.id !== 'string') {
      throw new Error('Category must have a valid id');
    }

    if (!c.name || typeof c.name !== 'string') {
      throw new Error('Category must have a valid name');
    }

    if (!c.color || typeof c.color !== 'string') {
      throw new Error('Category must have a valid color');
    }

    if (typeof c.todoCount !== 'number') {
      throw new Error('Category todoCount must be a number');
    }
  }

  /**
   * Handles data format migrations for future compatibility
   */
  private async migrateData(data: TodoData): Promise<TodoData> {
    // Currently version 1.0.0 - no migrations needed
    // Future versions can add migration logic here
    
    if (data.version === '1.0.0') {
      return data;
    }

    // Example of how to handle future migrations:
    // if (data.version === '0.9.0') {
    //   return this.migrateFrom090(data);
    // }

    console.warn(`Unknown data version: ${data.version}, attempting to use as-is`);
    return data;
  }

  /**
   * Custom JSON serializer that handles Date objects
   */
  private dateSerializer(key: string, value: unknown): unknown {
    if (value instanceof Date) {
      return { __date: value.toISOString() };
    }
    return value;
  }

  /**
   * Custom JSON deserializer that restores Date objects
   */
  private dateDeserializer(key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && '__date' in value) {
      return new Date((value as { __date: string }).__date);
    }
    return value;
  }

  /**
   * Checks if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensures a directory exists, creating it if necessary
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // If the error is not about the directory already existing, throw it
      if (error instanceof Error && !error.message.includes('EEXIST')) {
        throw error;
      }
    }
  }

  /**
   * Gets file statistics (size, modification date, etc.)
   */
  async getFileStats(): Promise<{
    exists: boolean;
    size?: number;
    lastModified?: Date;
    backupCount?: number;
  }> {
    const stats: {
      exists: boolean;
      size?: number;
      lastModified?: Date;
      backupCount?: number;
    } = { exists: false };

    try {
      if (await this.fileExists(this.config.dataPath)) {
        const fileStats = await fs.stat(this.config.dataPath);
        stats.exists = true;
        stats.size = fileStats.size;
        stats.lastModified = fileStats.mtime;
      }

      // Count backup files
      if (this.config.backupPath && await this.fileExists(this.config.backupPath)) {
        const backupFiles = await fs.readdir(this.config.backupPath);
        stats.backupCount = backupFiles.filter(
          file => file.startsWith('todos-backup-') && file.endsWith('.json')
        ).length;
      }
    } catch (error) {
      console.warn('Error getting file stats:', error);
    }

    return stats;
  }

  /**
   * Manually triggers a backup (useful for testing or manual backups)
   */
  async manualBackup(): Promise<void> {
    await this.createBackup();
  }

  /**
   * Exports data in a human-readable format (for sharing or debugging)
   */
  async exportData(exportPath: string): Promise<void> {
    try {
      const data = await this.load();
      const exportData = {
        exportDate: new Date().toISOString(),
        summary: {
          totalTodos: data.todos.length,
          completedTodos: data.todos.filter(t => t.completed).length,
          totalCategories: data.categories.length
        },
        categories: data.categories,
        todos: data.todos
      };

      const jsonData = JSON.stringify(exportData, this.dateSerializer, 2);
      await fs.writeFile(exportPath, jsonData, 'utf8');
      
      console.log(`Data exported to ${exportPath}`);
    } catch (error) {
      throw new FileManagerError(
        `Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EXPORT_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }
}