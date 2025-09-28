/**
 * Category.ts - Category data structure and validation
 * 
 * This file defines the Category interface and related functionality.
 * Categories are used to organize and group todo items.
 */

import { v4 as uuidv4 } from 'uuid';

// Main Category interface
export interface Category {
  id: string;              // Unique identifier (UUID)
  name: string;            // Category name (e.g., "Work", "Personal")
  color: string;           // Color code for display (hex format like "#FF0000")
  todoCount: number;       // Number of todos in this category (calculated field)
}

// Type for creating a new category (without generated fields)
export type CategoryInput = Omit<Category, 'id' | 'todoCount'>;

// Type for updating a category
export type CategoryUpdate = Partial<Omit<Category, 'id' | 'todoCount'>> & {
  id: string;
};

// Predefined color palette for categories
export const CATEGORY_COLORS = {
  RED: '#e74c3c',
  BLUE: '#3498db',
  GREEN: '#2ecc71',
  ORANGE: '#f39c12',
  PURPLE: '#9b59b6',
  PINK: '#e91e63',
  TEAL: '#1abc9c',
  YELLOW: '#f1c40f',
  GRAY: '#95a5a6',
  DARK_BLUE: '#2c3e50'
} as const;

// Type for the color values
export type CategoryColor = typeof CATEGORY_COLORS[keyof typeof CATEGORY_COLORS];

// Default categories that come with the application
export const DEFAULT_CATEGORIES: CategoryInput[] = [
  {
    name: 'Personal',
    color: CATEGORY_COLORS.BLUE
  },
  {
    name: 'Work',
    color: CATEGORY_COLORS.GREEN
  },
  {
    name: 'Shopping',
    color: CATEGORY_COLORS.ORANGE
  },
  {
    name: 'Health',
    color: CATEGORY_COLORS.RED
  }
];

// Validation functions for categories
export class CategoryValidator {
  /**
   * Validates a category name
   * Rules: Must be non-empty string, max 50 characters, unique within the system
   */
  static validateName(name: string): { isValid: boolean; error?: string } {
    if (!name || typeof name !== 'string') {
      return { isValid: false, error: 'Category name is required and must be a string' };
    }
    
    if (name.trim().length === 0) {
      return { isValid: false, error: 'Category name cannot be empty' };
    }
    
    if (name.length > 50) {
      return { isValid: false, error: 'Category name cannot exceed 50 characters' };
    }
    
    // Check for reserved names
    const reservedNames = ['all', 'completed', 'pending', 'overdue'];
    if (reservedNames.includes(name.toLowerCase())) {
      return { isValid: false, error: `"${name}" is a reserved category name` };
    }
    
    return { isValid: true };
  }

  /**
   * Validates a category color
   * Rules: Must be a valid hex color code
   */
  static validateColor(color: string): { isValid: boolean; error?: string } {
    if (!color || typeof color !== 'string') {
      return { isValid: false, error: 'Color is required and must be a string' };
    }
    
    // Check if it's a valid hex color (with or without #)
    const hexColorRegex = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexColorRegex.test(color)) {
      return { isValid: false, error: 'Color must be a valid hex color code (e.g., #FF0000 or #F00)' };
    }
    
    return { isValid: true };
  }

  /**
   * Validates an entire category input object
   */
  static validateCategoryInput(input: CategoryInput): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate name
    const nameValidation = this.validateName(input.name);
    if (!nameValidation.isValid) {
      errors.push(nameValidation.error!);
    }
    
    // Validate color
    const colorValidation = this.validateColor(input.color);
    if (!colorValidation.isValid) {
      errors.push(colorValidation.error!);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Checks if a category name is unique among existing categories
   */
  static isNameUnique(name: string, existingCategories: Category[]): boolean {
    return !existingCategories.some(
      category => category.name.toLowerCase() === name.toLowerCase()
    );
  }
}

// Factory function to create a new category with generated fields
export function createCategory(input: CategoryInput): Category {
  // Ensure color has # prefix
  const normalizedColor = input.color.startsWith('#') ? input.color : `#${input.color}`;
  
  return {
    id: uuidv4(),
    todoCount: 0, // Will be updated when todos are added/removed
    ...input,
    color: normalizedColor
  };
}

// Utility functions for working with categories
export class CategoryUtils {
  /**
   * Gets a random color from the predefined palette
   */
  static getRandomColor(): string {
    const colors = Object.values(CATEGORY_COLORS);
    const randomIndex = Math.floor(Math.random() * colors.length);
    return colors[randomIndex]!;
  }

  /**
   * Normalizes a hex color to ensure it has the # prefix
   */
  static normalizeColor(color: string): string {
    if (!color) return CATEGORY_COLORS.GRAY;
    return color.startsWith('#') ? color : `#${color}`;
  }

  /**
   * Converts a hex color to RGB values for terminal display
   * This is useful for the blessed library which might need RGB values
   */
  static hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const normalized = hex.replace('#', '');
    
    if (normalized.length === 3) {
      // Convert 3-digit hex to 6-digit
      const expanded = normalized.split('').map(char => char + char).join('');
      return this.hexToRgb('#' + expanded);
    }
    
    if (normalized.length !== 6) {
      return null;
    }
    
    const r = parseInt(normalized.substr(0, 2), 16);
    const g = parseInt(normalized.substr(2, 2), 16);
    const b = parseInt(normalized.substr(4, 2), 16);
    
    return { r, g, b };
  }

  /**
   * Gets the next available color that's not already used
   */
  static getNextAvailableColor(usedColors: string[]): string {
    const availableColors = Object.values(CATEGORY_COLORS).filter(
      color => !usedColors.includes(color)
    );
    
    if (availableColors.length === 0) {
      return this.getRandomColor(); // Fallback if all colors are used
    }
    
    return availableColors[0]!;
  }

  /**
   * Suggests a category name based on common patterns
   */
  static suggestCategoryName(existingCategories: Category[]): string {
    const commonNames = [
      'Personal', 'Work', 'Shopping', 'Health', 'Fitness', 'Learning',
      'Travel', 'Finance', 'Home', 'Projects', 'Goals', 'Family'
    ];
    
    const existingNames = existingCategories.map(cat => cat.name.toLowerCase());
    
    const availableName = commonNames.find(
      name => !existingNames.includes(name.toLowerCase())
    );
    
    if (availableName) {
      return availableName;
    }
    
    // If all common names are taken, generate a unique name
    let counter = 1;
    let baseName = 'Category';
    while (existingNames.includes(`${baseName.toLowerCase()} ${counter}`)) {
      counter++;
    }
    
    return `${baseName} ${counter}`;
  }
}