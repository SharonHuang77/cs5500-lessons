/**
 * Todo.ts - Todo data structure and validation
 * 
 * This file defines the Todo interface and related types.
 * It includes validation functions to ensure data integrity.
 */

import { v4 as uuidv4 } from 'uuid';

// Priority levels for todos
export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

// Main Todo interface - this defines what a todo item looks like
export interface Todo {
  id: string;              // Unique identifier (UUID)
  title: string;           // Todo title (required)
  description?: string;    // Optional detailed description
  completed: boolean;      // Whether the todo is completed
  priority: Priority;      // Priority level (low, medium, high)
  categoryId: string;      // Which category this todo belongs to
  createdAt: Date;        // When the todo was created
  completedAt?: Date;     // When it was completed (optional)
  dueDate?: Date;         // Optional due date
}

// Type for creating a new todo (without generated fields)
export type TodoInput = Omit<Todo, 'id' | 'createdAt' | 'completedAt'>;

// Type for updating a todo (all fields optional except id)
export type TodoUpdate = Partial<Omit<Todo, 'id' | 'createdAt'>> & {
  id: string;
};

// Validation functions
export class TodoValidator {
  /**
   * Validates a todo title
   * Rules: Must be a non-empty string, max 200 characters
   */
  static validateTitle(title: string): { isValid: boolean; error?: string } {
    if (!title || typeof title !== 'string') {
      return { isValid: false, error: 'Title is required and must be a string' };
    }
    
    if (title.trim().length === 0) {
      return { isValid: false, error: 'Title cannot be empty' };
    }
    
    if (title.length > 200) {
      return { isValid: false, error: 'Title cannot exceed 200 characters' };
    }
    
    return { isValid: true };
  }

  /**
   * Validates a todo description
   * Rules: Optional, but if provided must be string, max 1000 characters
   */
  static validateDescription(description?: string): { isValid: boolean; error?: string } {
    if (description === undefined || description === null) {
      return { isValid: true }; // Description is optional
    }
    
    if (typeof description !== 'string') {
      return { isValid: false, error: 'Description must be a string' };
    }
    
    if (description.length > 1000) {
      return { isValid: false, error: 'Description cannot exceed 1000 characters' };
    }
    
    return { isValid: true };
  }

  /**
   * Validates priority level
   * Rules: Must be one of the Priority enum values
   */
  static validatePriority(priority: Priority): { isValid: boolean; error?: string } {
    if (!Object.values(Priority).includes(priority)) {
      return { 
        isValid: false, 
        error: `Priority must be one of: ${Object.values(Priority).join(', ')}` 
      };
    }
    
    return { isValid: true };
  }

  /**
   * Validates a category ID
   * Rules: Must be a non-empty string (UUID format expected)
   */
  static validateCategoryId(categoryId: string): { isValid: boolean; error?: string } {
    if (!categoryId || typeof categoryId !== 'string') {
      return { isValid: false, error: 'Category ID is required and must be a string' };
    }
    
    if (categoryId.trim().length === 0) {
      return { isValid: false, error: 'Category ID cannot be empty' };
    }
    
    return { isValid: true };
  }

  /**
   * Validates a due date
   * Rules: Optional, but if provided must be a valid Date object
   */
  static validateDueDate(dueDate?: Date): { isValid: boolean; error?: string } {
    if (dueDate === undefined || dueDate === null) {
      return { isValid: true }; // Due date is optional
    }
    
    if (!(dueDate instanceof Date)) {
      return { isValid: false, error: 'Due date must be a Date object' };
    }
    
    if (isNaN(dueDate.getTime())) {
      return { isValid: false, error: 'Due date must be a valid date' };
    }
    
    return { isValid: true };
  }

  /**
   * Validates an entire todo input object
   * This checks all required fields and their constraints
   */
  static validateTodoInput(input: TodoInput): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate title
    const titleValidation = this.validateTitle(input.title);
    if (!titleValidation.isValid) {
      errors.push(titleValidation.error!);
    }
    
    // Validate description
    const descriptionValidation = this.validateDescription(input.description);
    if (!descriptionValidation.isValid) {
      errors.push(descriptionValidation.error!);
    }
    
    // Validate priority
    const priorityValidation = this.validatePriority(input.priority);
    if (!priorityValidation.isValid) {
      errors.push(priorityValidation.error!);
    }
    
    // Validate category ID
    const categoryValidation = this.validateCategoryId(input.categoryId);
    if (!categoryValidation.isValid) {
      errors.push(categoryValidation.error!);
    }
    
    // Validate due date
    const dueDateValidation = this.validateDueDate(input.dueDate);
    if (!dueDateValidation.isValid) {
      errors.push(dueDateValidation.error!);
    }
    
    // Check completed status
    if (typeof input.completed !== 'boolean') {
      errors.push('Completed status must be a boolean');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Factory function to create a new todo with generated fields
export function createTodo(input: TodoInput): Todo {
  return {
    id: uuidv4(),
    createdAt: new Date(),
    completedAt: input.completed ? new Date() : undefined,
    ...input
  };
}

// Utility functions for working with todos
export class TodoUtils {
  /**
   * Marks a todo as completed
   */
  static markCompleted(todo: Todo): Todo {
    return {
      ...todo,
      completed: true,
      completedAt: new Date()
    };
  }

  /**
   * Marks a todo as not completed
   */
  static markIncomplete(todo: Todo): Todo {
    return {
      ...todo,
      completed: false,
      completedAt: undefined
    };
  }

  /**
   * Checks if a todo is overdue
   */
  static isOverdue(todo: Todo): boolean {
    if (!todo.dueDate || todo.completed) {
      return false;
    }
    
    return todo.dueDate < new Date();
  }

  /**
   * Gets the priority as a number for sorting (higher number = higher priority)
   */
  static getPriorityWeight(priority: Priority): number {
    switch (priority) {
      case Priority.HIGH:
        return 3;
      case Priority.MEDIUM:
        return 2;
      case Priority.LOW:
        return 1;
      default:
        return 0;
    }
  }
}