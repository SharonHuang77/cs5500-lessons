/**
 * TodoManager.ts - Main Data Management Class
 * 
 * This is the core Model class that manages all todo and category data.
 * It provides CRUD operations, data validation, and coordinates with the file system.
 */

import { 
  Todo, 
  TodoInput, 
  TodoUpdate, 
  TodoValidator, 
  createTodo, 
  TodoUtils, 
  Priority 
} from './Todo';
import { 
  Category, 
  CategoryInput, 
  CategoryUpdate, 
  CategoryValidator, 
  createCategory, 
  CategoryUtils,
  DEFAULT_CATEGORIES 
} from './Category';
import { FileManager, FileManagerConfig } from '../utils/FileManager';

// Event types for notifying views about data changes
export type TodoManagerEvent = 
  | 'todo-added'
  | 'todo-updated' 
  | 'todo-deleted'
  | 'category-added'
  | 'category-updated'
  | 'category-deleted'
  | 'data-loaded'
  | 'data-saved';

// Event listener function type
export type TodoManagerEventListener = (event: TodoManagerEvent, data?: unknown) => void;

// Error class for TodoManager specific errors
export class TodoManagerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'TodoManagerError';
  }
}

// Configuration for TodoManager
export interface TodoManagerConfig {
  fileManager?: FileManagerConfig;
  autoSave?: boolean;           // Whether to automatically save after changes
  createDefaultCategories?: boolean; // Whether to create default categories on first run
}

export class TodoManager {
  private todos: Todo[] = [];
  private categories: Category[] = [];
  private fileManager: FileManager;
  private eventListeners: TodoManagerEventListener[] = [];
  private config: Required<TodoManagerConfig>;
  private isInitialized = false;

  constructor(config: TodoManagerConfig = {}) {
    this.config = {
      fileManager: config.fileManager || { dataPath: '', autoBackup: false },
      autoSave: config.autoSave ?? true,
      createDefaultCategories: config.createDefaultCategories ?? true
    };
    
    this.fileManager = new FileManager(this.config.fileManager);
  }

  /**
   * Initializes the TodoManager by loading data from file
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing TodoManager...');
      
      const data = await this.fileManager.load();
      this.todos = data.todos;
      this.categories = data.categories;

      // Create default categories if none exist and it's enabled
      if (this.categories.length === 0 && this.config.createDefaultCategories) {
        await this.createDefaultCategories();
      }

      // Update category todo counts
      this.updateCategoryTodoCounts();

      this.isInitialized = true;
      this.emitEvent('data-loaded', { todos: this.todos, categories: this.categories });
      
      console.log(`TodoManager initialized with ${this.todos.length} todos and ${this.categories.length} categories`);
    } catch (error) {
      throw new TodoManagerError(
        `Failed to initialize TodoManager: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INITIALIZATION_ERROR',
        error
      );
    }
  }

  /**
   * Saves current data to file
   */
  async save(): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.fileManager.save({
        todos: this.todos,
        categories: this.categories
      });
      
      this.emitEvent('data-saved');
      console.log('Data saved successfully');
    } catch (error) {
      throw new TodoManagerError(
        `Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SAVE_ERROR',
        error
      );
    }
  }

  // =============================================================================
  // TODO OPERATIONS
  // =============================================================================

  /**
   * Adds a new todo
   */
  async addTodo(input: TodoInput): Promise<Todo> {
    this.ensureInitialized();
    
    // Validate input
    const validation = TodoValidator.validateTodoInput(input);
    if (!validation.isValid) {
      throw new TodoManagerError(
        `Invalid todo input: ${validation.errors.join(', ')}`,
        'VALIDATION_ERROR',
        validation.errors
      );
    }

    // Check if category exists
    if (!this.categoryExists(input.categoryId)) {
      throw new TodoManagerError(
        `Category with ID ${input.categoryId} does not exist`,
        'CATEGORY_NOT_FOUND',
        { categoryId: input.categoryId }
      );
    }

    // Create the todo
    const todo = createTodo(input);
    this.todos.push(todo);

    // Update category todo count
    this.updateCategoryTodoCount(input.categoryId);

    // Auto-save if enabled
    if (this.config.autoSave) {
      await this.save();
    }

    this.emitEvent('todo-added', todo);
    console.log(`Added todo: ${todo.title}`);
    
    return todo;
  }

  /**
   * Updates an existing todo
   */
  async updateTodo(id: string, updates: Partial<Omit<Todo, 'id' | 'createdAt'>>): Promise<boolean> {
    this.ensureInitialized();
    
    const todoIndex = this.todos.findIndex(todo => todo.id === id);
    if (todoIndex === -1) {
      throw new TodoManagerError(
        `Todo with ID ${id} not found`,
        'TODO_NOT_FOUND',
        { id }
      );
    }

    const currentTodo = this.todos[todoIndex]!;
    const oldCategoryId = currentTodo.categoryId;

    // Validate updates
    if (updates.title !== undefined) {
      const titleValidation = TodoValidator.validateTitle(updates.title);
      if (!titleValidation.isValid) {
        throw new TodoManagerError(
          `Invalid title: ${titleValidation.error}`,
          'VALIDATION_ERROR'
        );
      }
    }

    if (updates.description !== undefined) {
      const descValidation = TodoValidator.validateDescription(updates.description);
      if (!descValidation.isValid) {
        throw new TodoManagerError(
          `Invalid description: ${descValidation.error}`,
          'VALIDATION_ERROR'
        );
      }
    }

    if (updates.priority !== undefined) {
      const priorityValidation = TodoValidator.validatePriority(updates.priority);
      if (!priorityValidation.isValid) {
        throw new TodoManagerError(
          `Invalid priority: ${priorityValidation.error}`,
          'VALIDATION_ERROR'
        );
      }
    }

    if (updates.categoryId !== undefined && !this.categoryExists(updates.categoryId)) {
      throw new TodoManagerError(
        `Category with ID ${updates.categoryId} does not exist`,
        'CATEGORY_NOT_FOUND',
        { categoryId: updates.categoryId }
      );
    }

    // Handle completion status changes
    if (updates.completed !== undefined && updates.completed !== currentTodo.completed) {
      if (updates.completed) {
        updates.completedAt = new Date();
      } else {
        updates.completedAt = undefined;
      }
    }

    // Apply updates
    const updatedTodo = { ...currentTodo, ...updates };
    this.todos[todoIndex] = updatedTodo;

    // Update category todo counts if category changed
    if (updates.categoryId !== undefined && updates.categoryId !== oldCategoryId) {
      this.updateCategoryTodoCount(oldCategoryId);
      this.updateCategoryTodoCount(updates.categoryId);
    }

    // Auto-save if enabled
    if (this.config.autoSave) {
      await this.save();
    }

    this.emitEvent('todo-updated', updatedTodo);
    console.log(`Updated todo: ${updatedTodo.title}`);
    
    return true;
  }

  /**
   * Deletes a todo
   */
  async deleteTodo(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const todoIndex = this.todos.findIndex(todo => todo.id === id);
    if (todoIndex === -1) {
      throw new TodoManagerError(
        `Todo with ID ${id} not found`,
        'TODO_NOT_FOUND',
        { id }
      );
    }

    const todo = this.todos[todoIndex]!;
    const categoryId = todo.categoryId;
    
    // Remove the todo
    this.todos.splice(todoIndex, 1);

    // Update category todo count
    this.updateCategoryTodoCount(categoryId);

    // Auto-save if enabled
    if (this.config.autoSave) {
      await this.save();
    }

    this.emitEvent('todo-deleted', { id, todo });
    console.log(`Deleted todo: ${todo.title}`);
    
    return true;
  }

  /**
   * Toggles the completion status of a todo
   */
  async toggleTodoCompletion(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const todo = this.getTodoById(id);
    if (!todo) {
      throw new TodoManagerError(
        `Todo with ID ${id} not found`,
        'TODO_NOT_FOUND',
        { id }
      );
    }

    return await this.updateTodo(id, { completed: !todo.completed });
  }

  /**
   * Gets a todo by ID
   */
  getTodoById(id: string): Todo | undefined {
    this.ensureInitialized();
    return this.todos.find(todo => todo.id === id);
  }

  /**
   * Gets all todos
   */
  getAllTodos(): Todo[] {
    this.ensureInitialized();
    return [...this.todos];
  }

  /**
   * Gets todos by category
   */
  getTodosByCategory(categoryId: string): Todo[] {
    this.ensureInitialized();
    return this.todos.filter(todo => todo.categoryId === categoryId);
  }

  /**
   * Gets todos by completion status
   */
  getTodosByStatus(completed: boolean): Todo[] {
    this.ensureInitialized();
    return this.todos.filter(todo => todo.completed === completed);
  }

  /**
   * Gets overdue todos
   */
  getOverdueTodos(): Todo[] {
    this.ensureInitialized();
    return this.todos.filter(todo => TodoUtils.isOverdue(todo));
  }

  /**
   * Gets todos by priority
   */
  getTodosByPriority(priority: Priority): Todo[] {
    this.ensureInitialized();
    return this.todos.filter(todo => todo.priority === priority);
  }

  /**
   * Searches todos by title or description
   */
  searchTodos(query: string): Todo[] {
    this.ensureInitialized();
    const lowerQuery = query.toLowerCase();
    return this.todos.filter(todo => 
      todo.title.toLowerCase().includes(lowerQuery) ||
      (todo.description && todo.description.toLowerCase().includes(lowerQuery))
    );
  }

  // =============================================================================
  // CATEGORY OPERATIONS
  // =============================================================================

  /**
   * Adds a new category
   */
  async addCategory(input: CategoryInput): Promise<Category> {
    this.ensureInitialized();
    
    // Validate input
    const validation = CategoryValidator.validateCategoryInput(input);
    if (!validation.isValid) {
      throw new TodoManagerError(
        `Invalid category input: ${validation.errors.join(', ')}`,
        'VALIDATION_ERROR',
        validation.errors
      );
    }

    // Check if name is unique
    if (!CategoryValidator.isNameUnique(input.name, this.categories)) {
      throw new TodoManagerError(
        `Category name "${input.name}" already exists`,
        'DUPLICATE_CATEGORY_NAME',
        { name: input.name }
      );
    }

    // Create the category
    const category = createCategory(input);
    this.categories.push(category);

    // Auto-save if enabled
    if (this.config.autoSave) {
      await this.save();
    }

    this.emitEvent('category-added', category);
    console.log(`Added category: ${category.name}`);
    
    return category;
  }

  /**
   * Updates an existing category
   */
  async updateCategory(id: string, updates: Partial<Omit<Category, 'id' | 'todoCount'>>): Promise<boolean> {
    this.ensureInitialized();
    
    const categoryIndex = this.categories.findIndex(cat => cat.id === id);
    if (categoryIndex === -1) {
      throw new TodoManagerError(
        `Category with ID ${id} not found`,
        'CATEGORY_NOT_FOUND',
        { id }
      );
    }

    const currentCategory = this.categories[categoryIndex]!;

    // Validate updates
    if (updates.name !== undefined) {
      const nameValidation = CategoryValidator.validateName(updates.name);
      if (!nameValidation.isValid) {
        throw new TodoManagerError(
          `Invalid category name: ${nameValidation.error}`,
          'VALIDATION_ERROR'
        );
      }

      // Check if new name is unique (excluding current category)
      const otherCategories = this.categories.filter(cat => cat.id !== id);
      if (!CategoryValidator.isNameUnique(updates.name, otherCategories)) {
        throw new TodoManagerError(
          `Category name "${updates.name}" already exists`,
          'DUPLICATE_CATEGORY_NAME',
          { name: updates.name }
        );
      }
    }

    if (updates.color !== undefined) {
      const colorValidation = CategoryValidator.validateColor(updates.color);
      if (!colorValidation.isValid) {
        throw new TodoManagerError(
          `Invalid category color: ${colorValidation.error}`,
          'VALIDATION_ERROR'
        );
      }
    }

    // Apply updates (preserve todoCount)
    const updatedCategory = { 
      ...currentCategory, 
      ...updates,
      todoCount: currentCategory.todoCount // Don't allow direct todoCount updates
    };
    this.categories[categoryIndex] = updatedCategory;

    // Auto-save if enabled
    if (this.config.autoSave) {
      await this.save();
    }

    this.emitEvent('category-updated', updatedCategory);
    console.log(`Updated category: ${updatedCategory.name}`);
    
    return true;
  }

  /**
   * Deletes a category and handles todos in that category
   */
  async deleteCategory(id: string, moveTosCategoryId?: string): Promise<boolean> {
    this.ensureInitialized();
    
    const categoryIndex = this.categories.findIndex(cat => cat.id === id);
    if (categoryIndex === -1) {
      throw new TodoManagerError(
        `Category with ID ${id} not found`,
        'CATEGORY_NOT_FOUND',
        { id }
      );
    }

    const category = this.categories[categoryIndex]!;
    const todosInCategory = this.getTodosByCategory(id);

    // Handle todos in the category
    if (todosInCategory.length > 0) {
      if (moveTosCategoryId) {
        // Move todos to another category
        if (!this.categoryExists(moveTosCategoryId)) {
          throw new TodoManagerError(
            `Target category with ID ${moveTosCategoryId} does not exist`,
            'CATEGORY_NOT_FOUND',
            { categoryId: moveTosCategoryId }
          );
        }

        for (const todo of todosInCategory) {
          await this.updateTodo(todo.id, { categoryId: moveTosCategoryId });
        }
      } else {
        // Delete all todos in the category
        for (const todo of todosInCategory) {
          await this.deleteTodo(todo.id);
        }
      }
    }

    // Remove the category
    this.categories.splice(categoryIndex, 1);

    // Auto-save if enabled
    if (this.config.autoSave) {
      await this.save();
    }

    this.emitEvent('category-deleted', { id, category });
    console.log(`Deleted category: ${category.name}`);
    
    return true;
  }

  /**
   * Gets a category by ID
   */
  getCategoryById(id: string): Category | undefined {
    this.ensureInitialized();
    return this.categories.find(cat => cat.id === id);
  }

  /**
   * Gets all categories
   */
  getAllCategories(): Category[] {
    this.ensureInitialized();
    return [...this.categories];
  }

  /**
   * Checks if a category exists
   */
  categoryExists(id: string): boolean {
    this.ensureInitialized();
    return this.categories.some(cat => cat.id === id);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Gets summary statistics
   */
  getStatistics(): {
    totalTodos: number;
    completedTodos: number;
    pendingTodos: number;
    overdueTodos: number;
    totalCategories: number;
    priorityBreakdown: Record<Priority, number>;
  } {
    this.ensureInitialized();
    
    const completed = this.todos.filter(t => t.completed);
    const pending = this.todos.filter(t => !t.completed);
    const overdue = this.getOverdueTodos();
    
    const priorityBreakdown = {
      [Priority.HIGH]: this.getTodosByPriority(Priority.HIGH).length,
      [Priority.MEDIUM]: this.getTodosByPriority(Priority.MEDIUM).length,
      [Priority.LOW]: this.getTodosByPriority(Priority.LOW).length
    };

    return {
      totalTodos: this.todos.length,
      completedTodos: completed.length,
      pendingTodos: pending.length,
      overdueTodos: overdue.length,
      totalCategories: this.categories.length,
      priorityBreakdown
    };
  }

  /**
   * Adds an event listener
   */
  addEventListener(listener: TodoManagerEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Removes an event listener
   */
  removeEventListener(listener: TodoManagerEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Gets the file manager for advanced operations
   */
  getFileManager(): FileManager {
    return this.fileManager;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Ensures the TodoManager is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new TodoManagerError(
        'TodoManager must be initialized before use. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * Updates the todo count for a specific category
   */
  private updateCategoryTodoCount(categoryId: string): void {
    const category = this.categories.find(cat => cat.id === categoryId);
    if (category) {
      category.todoCount = this.getTodosByCategory(categoryId).length;
    }
  }

  /**
   * Updates todo counts for all categories
   */
  private updateCategoryTodoCounts(): void {
    for (const category of this.categories) {
      category.todoCount = this.getTodosByCategory(category.id).length;
    }
  }

  /**
   * Creates default categories on first run
   */
  private async createDefaultCategories(): Promise<void> {
    console.log('Creating default categories...');
    
    for (const categoryInput of DEFAULT_CATEGORIES) {
      try {
        await this.addCategory(categoryInput);
      } catch (error) {
        console.warn(`Failed to create default category "${categoryInput.name}":`, error);
      }
    }
  }

  /**
   * Emits an event to all listeners
   */
  private emitEvent(event: TodoManagerEvent, data?: unknown): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    }
  }
}